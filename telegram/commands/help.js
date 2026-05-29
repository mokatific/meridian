import { Composer } from "grammy";

const help = new Composer();

const HELP_TEXT = `🎛 Meridian Commands

📊 Positions
/status — Bot overview: mode, wallet, PnL
/wallet — Wallet balance + virtual wallet (dry run)
/positions — List all open positions
/pool <n> — Detailed view of one position by index
/close <n> — Close one position by index
/closeall — Close all open positions
/set <n> <note> — Attach a note or instruction to a position

🔍 Screening
/screen — Run deterministic candidate screen now
/candidates — Show last cached candidate list
/deploy <n> — Deploy into a cached candidate by index

⚙️ Config
/config — Show current runtime config snapshot
/settings — Inline settings menu (buttons)
/setcfg <key> <value> — Update a config key and persist

📈 Reporting
/briefing — Daily performance briefing
/analysis — Causal analysis: why positions win or lose
/sim — Virtual trading summary (dry run stats)

🧠 Smart Wallets & HiveMind
/smart_wallets — List tracked KOL / smart wallets
/hive — HiveMind sync status
/hive pull — Trigger a manual HiveMind pull now

🔧 System
/health — Check all external service connectivity
/pause — Stop autonomous cron cycles
/resume — Resume autonomous cron cycles
/stop — Graceful shutdown
/menu — Inline button menu
/help — This message`;

help.command("help", (ctx) => ctx.reply(HELP_TEXT));
help.command("start", (ctx) => ctx.reply(HELP_TEXT));

export default help;
