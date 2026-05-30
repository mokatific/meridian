import { Composer } from "grammy";
import { generateBriefing } from "../../briefing.js";
import { resetVirtualTrading } from "../../dry-run-simulator.js";
import { getVirtualSummary } from "../../dry-run-simulator.js";
import { getCausalAnalysisSummary } from "../../causal-analysis.js";

const reporting = new Composer();

// /briefing
reporting.command("briefing", async (ctx) => {
  try {
    const briefing = await generateBriefing();
    await ctx.reply(briefing, { parse_mode: "HTML" });
  } catch (e) {
    await ctx.reply(`Error: ${e.message}`);
  }
});

// /sim
reporting.command("sim", async (ctx) => {
  await ctx.reply(getVirtualSummary());
});

// /simreset
reporting.command("simreset", async (ctx) => {
  if (process.env.DRY_RUN !== "true") {
    await ctx.reply("⚠️ /simreset only works in dry-run mode (DRY_RUN=true).");
    return;
  }

  const result = resetVirtualTrading();
  await ctx.reply(
    `🔄 <b>Virtual trading reset</b>\n\nBalance restored to ${result.initialBalance} SOL\nAll virtual positions and history cleared.\n\nReady for a fresh test run.`,
    { parse_mode: "HTML" },
  );
});

// /analysis
reporting.command("analysis", async (ctx) => {
  await ctx.reply(getCausalAnalysisSummary());
});

export default reporting;
