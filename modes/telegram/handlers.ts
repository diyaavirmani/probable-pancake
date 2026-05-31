import type { Telegraf } from "telegraf";
import { isOwner } from "./auth";
import { WELCOME } from "./constants";
import { clip, commandArg } from "./text";
import { runAgent, runAsk, runPlanSteps } from "./agent-run";
import { generatePlan } from "../plan/planner";
import { planKeyboard, planMessage, planSessions, refreshPlanUi, type PlanSession } from "./plan-session";
import { approvalDiff, approvalSessions, feedbackSessions } from "./approval-session";

export function registerHandlers(bot: Telegraf) {
    // Debugging middleware to help track incoming messages, user IDs, and verify correct bot token connectivity
    bot.use(async (ctx, next) => {
        if (ctx.chat) {
            const sender = ctx.from ? `@${ctx.from.username || ''} (${ctx.from.first_name || ''} ${ctx.from.last_name || ''})` : 'Unknown';
            const text = ctx.message && 'text' in ctx.message ? ctx.message.text : 'Action/Callback';
            console.log(`[Telegram Bot] Incoming from Chat ID: ${ctx.chat.id} | User: ${sender} | Message: "${text}"`);
        }
        return next();
    });

    bot.command("start", async (ctx) => {
        if (!isOwner(ctx.chat.id)) return;
        await ctx.reply(WELCOME, { parse_mode: "Markdown" });
    });

    bot.command("ask", async (ctx) => {
        if (!isOwner(ctx.chat.id)) return;
        const q = commandArg(ctx.message.text, "ask");
        if (!q)
            return ctx.reply("Usage: `/ask <your question>`", {
                parse_mode: "Markdown",
            });

        await ctx.reply("🔍 Researching your question…");
        void runAsk(ctx, q).catch(console.error);
    });

    bot.command("agent", async (ctx) => {
        if (!isOwner(ctx.chat.id)) return;
        const goal = commandArg(ctx.message.text, "agent");
        if (!goal)
            return ctx.reply("Usage: `/agent <task description>`", {
                parse_mode: "Markdown",
            });
        await ctx.reply("🤖 Agent is working on your task…");
        void runAgent(ctx, ctx.chat.id, goal).catch(console.error);
    });

    bot.command("plan", async (ctx) => {
        if (!isOwner(ctx.chat.id)) return;
        const goal = commandArg(ctx.message.text, "plan");

        if (!goal)
            return ctx.reply("Usage: `/plan <your goal>`", {
                parse_mode: "Markdown",
            });

        await ctx.reply("🧭 Generating a plan…");

        void (async () => {
            const plan = await generatePlan(goal)
            const session: PlanSession = { plan, selected: new Set(plan.steps.map((s) => s.id)) }
            await ctx.reply(planMessage(session), { parse_mode: "Markdown", ...planKeyboard(session) });
            planSessions.set(ctx.chat.id, session);
        })().catch(console.error)
    });

    bot.action(/^plan_toggle:(.+)$/, async (ctx) => {
        if (!isOwner(ctx.chat!.id)) return ctx.answerCbQuery();
        const s = planSessions.get(ctx.chat!.id);
        if (!s) return ctx.answerCbQuery();

        const id = ctx.match[1]!;
        if (s.selected.has(id)) s.selected.delete(id);
        else s.selected.add(id);

        await refreshPlanUi(ctx, s);
        await ctx.answerCbQuery();
    });


    bot.action('plan_all', async (ctx) => {
        if (!isOwner(ctx.chat!.id)) return ctx.answerCbQuery();
        const s = planSessions.get(ctx.chat!.id);
        if (!s) return ctx.answerCbQuery();
        for (const step of s.plan.steps) s.selected.add(step.id);
        await refreshPlanUi(ctx, s);
        await ctx.answerCbQuery();
    });

    bot.action('plan_none', async (ctx) => {
        if (!isOwner(ctx.chat!.id)) return ctx.answerCbQuery();
        const s = planSessions.get(ctx.chat!.id);
        if (!s) return ctx.answerCbQuery();
        s.selected.clear();
        await refreshPlanUi(ctx, s);
        await ctx.answerCbQuery();
    });

    bot.action('plan_proceed', async (ctx) => {
        if (!isOwner(ctx.chat!.id)) return ctx.answerCbQuery();
        const s = planSessions.get(ctx.chat!.id);
        if (!s) return ctx.answerCbQuery();

        const steps = s.plan.steps.filter((step) => s.selected.has(step.id));
        if (steps.length === 0) return ctx.answerCbQuery();

        const { plan } = s;
        planSessions.delete(ctx.chat!.id);
        const list = steps.map((step, i) => `${i + 1}. ${step.title}`).join('\n');
        await ctx.editMessageText(`🚀 Executing ${steps.length} step(s)…\n\n${list}`);
        await ctx.answerCbQuery();

        void runPlanSteps(ctx, ctx.chat!.id, plan, steps).catch(console.error);
    });

    bot.action('approval_diff', async (ctx) => {
        if (!isOwner(ctx.chat!.id)) return ctx.answerCbQuery();
        const s = approvalSessions.get(ctx.chat!.id);
        if (!s) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        await ctx.reply(clip(approvalDiff(s.pending)));
    });

    bot.action('approval_accept', async (ctx) => {
        if (!isOwner(ctx.chat!.id)) return ctx.answerCbQuery();
        const s = approvalSessions.get(ctx.chat!.id);
        if (!s) return ctx.answerCbQuery();

        approvalSessions.delete(ctx.chat!.id);
        for (const a of s.pending) s.tracker.updateStatus(a.id, 'approved', true);
        const { errors } = s.executor.applyApprovedFromTracker();
        s.executor.clearStaging();

        await ctx.editMessageText('✅ All changes applied.');
        await ctx.answerCbQuery('Applied!');
        if (errors.length) console.error(errors);
    });

    bot.action('approval_reject', async (ctx) => {
        if (!isOwner(ctx.chat!.id)) return ctx.answerCbQuery();
        const s = approvalSessions.get(ctx.chat!.id);
        if (!s) return ctx.answerCbQuery();

        approvalSessions.delete(ctx.chat!.id);
        for (const a of s.pending) s.tracker.updateStatus(a.id, 'rejected', false);
        s.executor.clearStaging();

        await ctx.editMessageText('❌ All changes rejected. Nothing was applied.');
        await ctx.answerCbQuery('Rejected');
    });

    bot.action('approval_suggest', async (ctx) => {
        if (!isOwner(ctx.chat!.id)) return ctx.answerCbQuery();
        const s = approvalSessions.get(ctx.chat!.id);
        if (!s) return ctx.answerCbQuery();

        // Stash the session goal in feedbackSessions
        feedbackSessions.set(ctx.chat!.id, { goal: s.goal || "agent task" });
        approvalSessions.delete(ctx.chat!.id);
        s.executor.clearStaging();

        await ctx.editMessageText('💡 Staged changes shelved.\n\n💬 Please send a message with your suggested changes or feedback for the agent. For example: "Change the button color to orange" or "Add input length validation".');
        await ctx.answerCbQuery();
    });

    // Default text handler: treat any plain text question as a codebase search/question
    bot.on("text", async (ctx) => {
        if (!isOwner(ctx.chat.id)) return;
        const text = ctx.message.text.trim();

        // Check if there is an active feedback session for suggesting changes to the agent
        const fb = feedbackSessions.get(ctx.chat.id);
        if (fb) {
            feedbackSessions.delete(ctx.chat.id);
            await ctx.reply("🤖 Revising task with your feedback…");
            const newGoal = `Original Goal: ${fb.goal}\nFeedback / Adjustments requested: ${text}`;
            void runAgent(ctx, ctx.chat.id, newGoal).catch(console.error);
            return;
        }

        if (!text.startsWith('/')) {
            await ctx.reply("🔍 Researching your question…");
            void runAsk(ctx, text).catch(console.error);
        }
    });

}