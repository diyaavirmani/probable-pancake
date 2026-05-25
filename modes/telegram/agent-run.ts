import { tool, ToolLoopAgent, stepCountIs } from "ai";
import { z } from "zod";
import { getAgentModel } from "../../ai/ai.config.ts";
import { ActionTracker } from "../agent/actiontracker.ts";
import { ToolExecutor } from "../agent/Toolexecutor.ts";
import { createAgentTools } from "../agent/agenttools.ts";
import { defaultAgentConfig, type AgentConfig } from "../agent/types.ts";
import { createWebTools } from "../../tools/web/index.ts";
import type { Plan, PlanStep } from "../plan/types.ts";
import { replyMd } from "./text.ts";
import { finishOrApprove } from "./approval-session.ts";

function readOnlyConfig(): AgentConfig {
    const c = defaultAgentConfig();
    c.tools.allowFileCreation = false;
    c.tools.allowFileModification = false;
    c.tools.allowFolderCreation = false;
    c.tools.allowShellExecution = false;
    return c;
}

function agentOptions(config: AgentConfig, maxSteps: number) {
    return {
        model: getAgentModel(),
        stopWhen: stepCountIs(maxSteps),
        instructions: [
            "You are Pancake, a private agentic assistant running locally on the user's Windows machine.",
            `Workspace root: ${config.codebasePath}`,
            "You have full permission to read, write, and modify files anywhere on the operating system using absolute paths (including the Desktop, Downloads, and Documents folders).",
            "You can execute shell commands to run scripts, compile code, or launch files.",
            "If the user asks you to perform an OS-level task (like creating files on the desktop or running a command), use your staging tools or shell execution to do it directly instead of saying you cannot."
        ].join("\n"),
    };
}

function createReadOnlyTools(executor: ToolExecutor) {
    return {
        read_file: tool({
            description: "Read a workspace file (relative path).",
            inputSchema: z.object({ path: z.string() }),
            execute: async ({ path: p }) => executor.readFile(p),
        }),
        list_files: tool({
            description: "List files/dirs at a path.",
            inputSchema: z.object({
                path: z.string(),
                recursive: z.boolean().optional().default(false),
            }),
            execute: async ({ path: p, recursive }) =>
                executor.listFiles(p, recursive),
        }),
        search_files: tool({
            description:
                "Find files matching a glob pattern; optional content filter.",
            inputSchema: z.object({
                root: z.string(),
                pattern: z.string(),
                content_contains: z.string().optional(),
            }),
            execute: async ({ root, pattern, content_contains }) =>
                executor.searchFiles(root, pattern, content_contains),
        }),
        analyze_codebase: tool({
            description: "Summarize the codebase structure.",
            inputSchema: z.object({ path: z.string().default(".") }),
            execute: async ({ path: p }) => executor.analyzeCodebase(p),
        }),
    };
}

function extraWebTools(tracker: ActionTracker) {
    return process.env.FIRECRAWL_API_KEY ? createWebTools(tracker) : {};
}


export async function runAsk(ctx: { reply: (t: string, o?: object) => Promise<unknown> }, question: string) {
    const config = readOnlyConfig();
    const tracker = new ActionTracker();
    const executor = new ToolExecutor(tracker, config);
    const tools = { ...createReadOnlyTools(executor), ...extraWebTools(tracker) };
    const agent = new ToolLoopAgent({
        ...agentOptions(config, 20),
        tools,
    });

    const { text } = await agent.generate({ prompt: question });
    await replyMd(ctx, text || ("no answer"))
}

export async function runAgent(ctx: { reply: (t: string, o?: object) => Promise<unknown> }, chatId: number, goal: string) {
    const config = defaultAgentConfig();
    const tracker = new ActionTracker();
    const executor = new ToolExecutor(tracker, config);
    const tools = { ...createAgentTools(executor), ...extraWebTools(tracker) };
    const agent = new ToolLoopAgent({
        ...agentOptions(config, 40),
        tools,
    });
    const { text } = await agent.generate({ prompt: goal });
    if (text?.trim()) await replyMd(ctx, text.trim());
    await finishOrApprove(ctx, chatId, tracker, executor, '✅ Done. No file changes were needed.', goal);
}

export async function runPlanSteps(
    ctx: { reply: (t: string, o?: object) => Promise<unknown> },
    chatId: number,
    plan: Plan,
    steps: PlanStep[],
) {
    const config = defaultAgentConfig();
    const tracker = new ActionTracker();
    const executor = new ToolExecutor(tracker, config);
    const tools = { ...createAgentTools(executor), ...extraWebTools(tracker) };

    for (const step of steps) {
        await ctx.reply(`🔧 Executing: *${step.title}*`, { parse_mode: 'Markdown' });
        const prompt = [`Goal: ${plan.goal}`, `Step: ${step.title}`, step.description].join('\n');
        const agent = new ToolLoopAgent({
            ...agentOptions(config, 30),
            tools,
        });
        const { text } = await agent.generate({ prompt });
        if (text?.trim()) await replyMd(ctx, text.trim());
    }

    await finishOrApprove(ctx, chatId, tracker, executor, '✅ All steps done. No file changes needed.', plan.goal);
}