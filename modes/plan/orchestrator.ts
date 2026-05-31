import chalk from "chalk";
import { confirm, isCancel, text } from "@clack/prompts";
import { ToolLoopAgent, stepCountIs } from "ai";
import { getAgentModel } from "../../ai/ai.config.ts";
import { ActionTracker } from "../agent/actiontracker.ts";
import { ToolExecutor } from "../agent/Toolexecutor.ts";
import { createAgentTools } from "../agent/agenttools.ts";
import { defaultAgentConfig } from "../agent/types.ts";
import { runApprovalFlow } from "../agent/approval.ts";
import { renderTerminalMarkdown } from "../../tui/terminal-md.ts";
import { generatePlan } from "./planner.ts";
import { printPlan, selectSteps } from "./selection.ts";
import type { PlanStep } from "./types.ts";
import { createWebTools } from "../../tools/web/index.ts";


function stepPrompt(goal: string, step: PlanStep): string {
  return [`Goal: ${goal}`, `Step: ${step.title}`, step.description].join('\n');
}


export async function runPlanMode(): Promise<void> {
  console.log(chalk.bold("\n🧭 Plan Mode\n"));

  const goal = await text({ message: "What is your goal?" });
  if (isCancel(goal) || !goal.trim()) return;

  const plan = await generatePlan(goal);

  printPlan(plan);

  const selected = await selectSteps(plan);
  if (selected.length === 0) return;

  const proceed = await confirm({
    message: `Execute ${selected.length} step(s)`,
    initialValue: true,
  });

  if (isCancel(proceed) || !proceed) return;

  const config = defaultAgentConfig();
  const tracker = new ActionTracker();
  const executor = new ToolExecutor(tracker, config);


  const tools = {
    ...createAgentTools(executor),
    ...createWebTools(tracker)
  };

  for (const step of selected) {
    console.log(chalk.bold(`\n🔧 ${step.title}\n`));

    const agent = new ToolLoopAgent({
      model:getAgentModel(),
      stopWhen:stepCountIs(30),
      instructions: [
          "You are OpenClaw, a private agentic plan executor.",
          `Current date: ${new Date().toISOString()}`,
          "",
          "CRITICAL SEARCH POLICY:",
          "- When web_search is used, you must summarize ONLY the returned pages and cite their URLs as sources.",
          "- NEVER rely on your pre-trained memory or training cutoff to guess facts, years, or dates.",
          "- If no results or sources are returned (e.g. status is 'NO_RESULTS'), explicitly state: 'I could not find current information'."
      ].join("\n"),
      tools
    });

    const r = await agent.generate({prompt:stepPrompt(plan.goal , step)})

    if(r.text) {
      console.log(renderTerminalMarkdown(r.text));
    }
  }

  const ok = await runApprovalFlow(tracker);

  if(!ok) return executor.clearStaging();

  const { errors } = executor.applyApprovedFromTracker();
  if (errors.length) {
    console.log(chalk.red('\nSome operations reported errors:\n'));
    for (const e of errors) console.log(chalk.red(`  • ${e}`));
  } else {
    console.log(chalk.green('\n✓ Applied.\n'));
  }
  executor.clearStaging();
}
