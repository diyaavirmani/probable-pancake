import { isCancel, text } from "@clack/prompts";
import chalk from "chalk";
import { defaultAgentConfig } from "./types";
import { ActionTracker } from "./actiontracker";
import { ToolExecutor } from "./Toolexecutor";
import { createAgentTools } from "./agenttools";
import { ToolLoopAgent } from "ai";
import { getAgentModel } from "../../ai/ai.config";
import { stepCountIs } from "ai";
import { renderTerminalMarkdown } from "../../tui/terminal-md";
import { runApprovalFlow } from "./approval";

export async function runAgentMode() {
    console.log(chalk.bold("\n🤖 Agent Mode\n"));

    const goal = await text({
        message: "What would you like the agent to do?",
        placeholder: "Concrete task for this codebase...",
    });

    if (isCancel(goal) || !goal.trim()) return;


    const config = defaultAgentConfig()
    const tracker = new ActionTracker()
    const executor = new ToolExecutor(tracker, config)
    const tools = createAgentTools(executor)

    const agent = new ToolLoopAgent({
        model: getAgentModel(),
        stopWhen: stepCountIs(40),
        instructions: [
            "You are OpenClaw, a private agentic coding and search assistant.",
            `Current date: ${new Date().toISOString()}`,
            `Workspace root: ${config.codebasePath}`,
            "All mutations are staged until approval.",
            "",
            "CRITICAL SEARCH POLICY:",
            "- When web_search is used, you must summarize ONLY the returned pages and cite their URLs as sources.",
            "- NEVER rely on your pre-trained memory or training cutoff to guess facts, years, or dates.",
            "- If no results or sources are returned (e.g. status is 'NO_RESULTS'), explicitly state: 'I could not find current information'."
        ].join("\n"),
        tools,
    });

    const result = await agent.generate({
        prompt: goal.trim(),
        onStepFinish: ({ toolCalls }) => {
            for (const tc of toolCalls) {
                const preview = JSON.stringify(tc.input).slice(0, 160);
                console.log(
                    chalk.green("  ✓"),
                    chalk.bold(String(tc.toolName)),
                    chalk.dim(preview + (preview.length >= 160 ? "..." : "")),
                );
            }
        },
    });
    if (result.text?.trim()) console.log(renderTerminalMarkdown(result.text));

    const ok = await runApprovalFlow(tracker);
    if (!ok) return executor.clearStaging();

    const { errors } = executor.applyApprovedFromTracker();

    if (errors.length) {
        console.log(chalk.red("\nSome operations reported errors:\n"));
        for (const e of errors) console.log(chalk.red(`  • ${e}`));
    }
    else {
        console.log(chalk.green('\n✓ Applied.\n'));
    }

    executor.clearStaging()
}


