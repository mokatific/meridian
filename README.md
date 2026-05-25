# Meridian

**Meridian** is an autonomous AI agent designed to manage liquidity automatically on **Meteora DLMM** (Dynamic Liquidity Market Maker) on the Solana blockchain.

**Links:** [Website](https://agentmeridian.xyz) | [Telegram](https://t.me/agentmeridian) | [X](https://x.com/meridian_agent)

Meridian runs continuous screening and management cycles - deploying capital to high-quality Meteora DLMM pools and closing positions based on live PnL, yield, and range data. It learns from every closed position.

---

## What Meridian Does

- **Pool screening** - scan Meteora DLMM pools based on configurable thresholds (fee/TVL ratio, organic score, holder count, mcap, bin step) and find the best opportunities
- **Position management** - monitor, claim fees, and close LP positions autonomously; decide STAY, CLOSE, or REDEPLOY based on live data
- **Learn from performance** - study top LPers in target pools, store structured lessons, and evolve screening thresholds based on closed-position history
- **Smart wallet evolution** - automatically discover high-quality LP wallets from study data, add the good ones, and drop those whose performance declines
- **Dry run simulator** - demo mode: when `DRY_RUN=true`, the agent tracks virtual positions using real market data, simulates PnL, and learns from each virtual close just like live positions
- **Discord signals** - optional Discord listener that monitors LP Army channels for Solana token signals and queues them for screening
- **Telegram chat** - full agent chat via Telegram, plus cycle reports and OOR alerts
- **Kiro integration** - run AI-powered screening and management directly from the editor using steering files and hooks

---

## How It Works

Meridian runs a **ReAct agent loop** - each cycle the LLM reasons over live data, calls tools, and acts. Two dedicated agents run on independent cron schedules:

| Agent                | Default interval | Role                                                              |
| -------------------- | ---------------- | ----------------------------------------------------------------- |
| **Screening Agent**  | Every 30 minutes | Pool screening - find and deploy to the best candidates           |
| **Management Agent** | Every 10 minutes | Position management - evaluate each open position and take action |

### Agent harness

Meridian's agent harness is the runtime wrapper for each autonomous cycle. It gives both agent loops the same control surface: load live state, inject relevant memory, expose only role-appropriate tools, execute tool calls, and return a readable cycle report.

The harness also stores a structured decision log in `decision-log.json` for deploy, close, skip, and no-deploy. Each entry records the actor, pool or position, summary, rationale, primary risks, metrics, and rejected alternatives. The latest decisions are injected back into the system prompt so the agent can answer "why did you deploy?", "why did you close?", or "why did you skip?" without guessing.

**Data sources:**

- `@meteora-ag/dlmm` SDK - on-chain position data, active bin, deploy/close transactions
- Meteora DLMM PnL API - position yield, fee accrual, PnL
- OKX OnchainOS - smart money signals, token risk scoring
- Pool screening API - fee/TVL ratio, volume, organic score, holder count
- Jupiter API - token audit, mcap, launchpad, price stats

The agent is powered via **OpenRouter** or other compatible providers and models can be swapped at any time.

---

## Requirements

- Node.js 18+
- [OpenRouter](https://openrouter.ai) API key (or SwiftRouter / other compatible provider)
- Solana wallet (base58 private key)
- Solana RPC endpoint ([Helius](https://helius.xyz) recommended)
- Telegram bot token (optional)

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/mokatific/meridian.git
cd meridian
yarn install
```

### 2. Run the setup wizard

```bash
yarn setup
```

The wizard guides you through creating `.env` (API keys, wallet, RPC, Telegram) and `user-config.json` (risk preset, deploy size, thresholds, model). It takes about 2 minutes.

**Or manual setup:**

Create `.env`:

```env
WALLET_PRIVATE_KEY=your_base58_private_key
RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
OPENROUTER_API_KEY=sk-or-...
HELIUS_API_KEY=your_helius_key   # for wallet balance lookup
TELEGRAM_BOT_TOKEN=123456:ABC... # optional - notifications + chat
TELEGRAM_CHAT_ID=                # auto-filled on first message
DRY_RUN=true                     # set false for live trading
```

> Never put private keys or API keys in `user-config.json` - use `.env` only. Both files are gitignored.

Copy the config and edit as needed:

```bash
cp user-config.example.json user-config.json
```

### 3. Run

```bash
yarn dev   # dry run - no on-chain transactions
yarn start # live mode
```

On startup, Meridian loads wallet balance, open positions, and top pool candidates, then immediately begins the autonomous cycle.

### Run with PM2

PM2 is supported and recommended to keep Telegram control online on a VPS:

```bash
yarn install
yarn pm2:start
pm2 save
```

To update an existing PM2 install:

```bash
git pull
yarn install
yarn pm2:restart
```

If the process keeps restarting after update, check app errors first:

```bash
yarn pm2:logs
```

Most PM2 crashes after updates are startup errors - usually because `yarn install` was skipped after `yarn.lock` changed, PM2 was run from the wrong directory, or `.env` / `user-config.json` values are missing. Avoid `nohup`; it runs outside PM2 and can leave Telegram polling as an unmanaged duplicate process.

---

## Using Other LLM Providers (SwiftRouter, OpenAI, Local, etc)

Meridian is not limited to OpenRouter. You can use **SwiftRouter**, OpenAI, Groq, Together AI, or even local models (LM Studio / Ollama).

### Easiest way: Setup Wizard

```bash
yarn setup
```

The wizard asks which LLM provider you want to use.

### Manual setup

Add the following to `.env`:

```env
LLM_BASE_URL=https://api.swiftrouter.com/v1
LLM_API_KEY=sk-put-your-api-key-here
LLM_MODEL=claude-sonnet-4-6
```

### Local models (LM Studio)

```env
LLM_BASE_URL=http://localhost:1234/v1
LLM_API_KEY=lm-studio
LLM_MODEL=your-local-model-name
```

Any OpenAI-compatible endpoint can be used.

### Model Recommendations

| Model               | Quality   | Notes                          | Recommendation         |
| ------------------- | --------- | ------------------------------ | ---------------------- |
| `claude-sonnet-4-6` | Very good | Most stable, best tool calling | **Highly recommended** |
| `gemini-2.5-pro`    | Good      | Fast and reasonably priced     | Good                   |
| `deepseek-r1-0528`  | Good      | Very strong reasoning          | Worth trying           |

---

## Operating Modes

### Autonomous agent

```bash
yarn start
```

Starts the full autonomous agent with screening + management cycles driven by cron and an interactive REPL. The prompt shows the countdown to the next cycle:

```
[manage: 8m 12s | screen: 24m 3s]
>
```

REPL commands:

| Command                 | Description                                                         |
| ----------------------- | ------------------------------------------------------------------- |
| `/status`               | Wallet balance and open positions                                   |
| `/candidates`           | Re-screen and show top pool candidates                              |
| `/learn`                | Study top LPers across all current candidate pools                  |
| `/learn <pool_address>` | Study top LPers for a specific pool                                 |
| `/thresholds`           | Current screening thresholds and performance stats                  |
| `/evolve`               | Trigger threshold evolution from performance data (needs 5+ closes) |
| `/stop`                 | Graceful shutdown                                                   |
| `<anything>`            | Free chat - ask the agent anything, request actions, analyze pools  |

### CLI (direct tool invocation)

The `meridian` CLI provides direct access to every tool with JSON output - useful for scripting, debugging, or piping into other tools.

```bash
yarn global add . # install globally (once)
meridian < command > [flags]
```

Or without install:

```bash
node cli.js < command > [flags]
```

**Positions and PnL**

```bash
meridian positions
meridian pnl <position_address>
meridian wallet-positions --wallet <addr>
```

**Screening**

```bash
meridian candidates --limit 5
meridian pool-detail --pool <addr> [--timeframe 5m]
meridian active-bin --pool <addr>
meridian search-pools --query <name_or_symbol>
meridian study --pool <addr> [--limit 4]
```

**Token research**

```bash
meridian token-info --query <mint_or_symbol>
meridian token-holders --mint <addr> [--limit 20]
meridian token-narrative --mint <addr>
```

**Deploy and manage**

```bash
meridian deploy --pool <addr> --amount <sol> [--bins-below 69] [--strategy bid_ask|spot|curve]
meridian claim --position <addr>
meridian close --position <addr>
meridian swap --from <mint> --to <mint> --amount <n>
meridian add-liquidity --position <addr> --pool <addr> [--amount-x <n>] [--amount-y <n>]
meridian withdraw-liquidity --position <addr> --pool <addr> [--bps 10000]
```

**Agent cycles**

```bash
meridian screen # one AI screening cycle
meridian manage # one AI management cycle
meridian start  # start autonomous agent with cron jobs
```

**Config**

```bash
meridian config get
meridian config set <key> <value>
```

**Learning and memory**

```bash
meridian lessons
meridian lessons add "your lesson text"
meridian performance [--limit 200]
meridian evolve
meridian pool-memory --pool <addr>
```

**Blacklist**

```bash
meridian blacklist list
meridian blacklist add --mint "reason" < addr > --reason
```

**Discord signals**

```bash
meridian discord-signals
meridian discord-signals clear
```

**Balance**

```bash
meridian balance
```

**Flags**

| Flag        | Effect                                       |
| ----------- | -------------------------------------------- |
| `--dry-run` | Skip all on-chain transactions               |
| `--silent`  | Suppress Telegram notifications for this run |

---

## Discord Listener

The Discord listener monitors configured channels (for example LP Army) for Solana token signals and queues them for the screener agent.

### Setup

```bash
cd discord-listener
yarn install
```

Add to the root `.env`:

```env
DISCORD_USER_TOKEN=your_discord_account_token
DISCORD_GUILD_ID=the_server_id
DISCORD_CHANNEL_IDS=channel1,channel2
DISCORD_MIN_FEES_SOL=5
```

> This uses a selfbot (personal account automation, not a bot token). Use it carefully.

### Run

```bash
cd discord-listener
yarn start
```

Signals are written to `discord-signals.json` and automatically picked up by the screening cycle.

### Signal pipeline

Each incoming token address goes through the pre-check pipeline before it is queued:

1. **Dedup** - ignore addresses seen in the last 10 minutes
2. **Blacklist** - reject mints on the blacklist
3. **Pool resolution** - resolve the address to a Meteora DLMM pool
4. **Rug check** - check the deployer against `deployer-blacklist.json`
5. **Fees check** - reject pools below `DISCORD_MIN_FEES_SOL`

Signals that pass all checks are queued with status `pending`. The screener pulls pending signals and processes them as priority candidates before running the normal screening cycle.

---

## Telegram

### Setup

1. Create a bot via [@BotFather](https://t.me/BotFather) and copy the token
2. Add `TELEGRAM_BOT_TOKEN=<token>` to `.env`
3. Set the chat ID and allowed user IDs in `.env`:

```env
TELEGRAM_BOT_TOKEN=<token>
TELEGRAM_CHAT_ID=<target chat id>
TELEGRAM_ALLOWED_USER_IDS=<comma-separated Telegram user ids>
```

Security notes:

- If `TELEGRAM_CHAT_ID` is not set, inbound Telegram control is ignored
- Notifications are still sent to the configured chat, but control is restricted to the allowed user IDs

### Notifications sent

- After each management cycle: full agent report (reasoning + decision)
- After each screening cycle: full agent report (what was found, whether deploy happened)
- When a position is out of range for longer than `outOfRangeWaitMinutes`
- On deploy: pair, amount, position address, tx hash
- On close: pair and PnL

### Telegram commands

| Command                 | Action                                   |
| ----------------------- | ---------------------------------------- |
| `/help`                 | Show all commands                        |
| `/status`               | Snapshot wallet + positions              |
| `/wallet`               | Wallet, deploy amount, HiveMind status   |
| `/positions`            | List open positions                      |
| `/pool <n>`             | Detailed info for one open position      |
| `/close <n>`            | Close a position by index                |
| `/closeall`             | Close all open positions                 |
| `/set <n> <note>`       | Set a note/instruction on a position     |
| `/config`               | Show important runtime config            |
| `/settings`             | Button menu for common config            |
| `/setcfg <key> <value>` | Update stored config                     |
| `/screen`               | Refresh the deterministic candidate list |
| `/candidates`           | Show the latest cached candidates        |
| `/deploy <n>`           | Deploy a candidate by cache index        |
| `/smart_wallets`        | List tracked smart wallets               |
| `/sim`                  | Virtual trading summary (dry run stats)  |
| `/briefing`             | Morning briefing                         |
| `/hive`                 | HiveMind sync status                     |
| `/hive pull`            | Manual HiveMind pull now                 |
| `/pause`                | Stop cron cycles                         |
| `/resume`               | Resume cron cycles                       |
| `/stop`                 | Stop the agent                           |

You can also free-chat via Telegram using the same interface as the REPL.

---

## Config Reference

All fields are optional - defaults are shown. Edit `user-config.json`.

### Screening

| Field                  | Default    | Description                                   |
| ---------------------- | ---------- | --------------------------------------------- |
| `minFeeActiveTvlRatio` | `0.05`     | Minimum fee/active TVL ratio                  |
| `minTvl`               | `10000`    | Minimum pool TVL (USD)                        |
| `maxTvl`               | `150000`   | Maximum pool TVL (USD)                        |
| `minVolume`            | `500`      | Minimum pool volume                           |
| `minOrganic`           | `60`       | Minimum organic score (0-100)                 |
| `minHolders`           | `500`      | Minimum token holder count                    |
| `minMcap`              | `150000`   | Minimum market cap (USD)                      |
| `maxMcap`              | `10000000` | Maximum market cap (USD)                      |
| `minBinStep`           | `80`       | Minimum bin step                              |
| `maxBinStep`           | `125`      | Maximum bin step                              |
| `timeframe`            | `5m`       | Candle timeframe for screening                |
| `category`             | `trending` | Pool category filter                          |
| `minTokenFeesSol`      | `30`       | Minimum all-time fees in SOL                  |
| `maxBundlersPct`       | `30`       | Maximum % bundlers in top 100 holders         |
| `maxTop10Pct`          | `60`       | Maximum top-10 holder concentration           |
| `blockedLaunchpads`    | `[]`       | Launchpad names that should never be deployed |

### Management

| Field                   | Default | Description                                  |
| ----------------------- | ------- | -------------------------------------------- |
| `deployAmountSol`       | `0.5`   | Base SOL per new position                    |
| `positionSizePct`       | `0.35`  | Fraction of balance that can be deployed     |
| `maxDeployAmount`       | `50`    | Max SOL per position cap                     |
| `gasReserve`            | `0.2`   | Minimum SOL kept for gas                     |
| `minSolToOpen`          | `0.55`  | Minimum wallet SOL before opening a position |
| `outOfRangeWaitMinutes` | `30`    | OOR minutes before acting                    |
| `stopLossPct`           | `-15`   | Close if price drops by this amount          |
| `takeProfitPct`         | `12`    | Close when total return reaches this         |
| `trailingTakeProfit`    | `true`  | Enable trailing take profit                  |
| `trailingTriggerPct`    | `4`     | Activate trailing when PnL reaches this %    |
| `trailingDropPct`       | `1.5`   | Close when it drops by this % from the peak  |

### Schedule

| Field                   | Default | Description                          |
| ----------------------- | ------- | ------------------------------------ |
| `managementIntervalMin` | `10`    | Management cycle frequency (minutes) |
| `screeningIntervalMin`  | `30`    | Screening cycle frequency (minutes)  |

### Model

| Field             | Default                   | Description              |
| ----------------- | ------------------------- | ------------------------ |
| `managementModel` | `openrouter/healer-alpha` | LLM for management cycle |
| `screeningModel`  | `openrouter/hunter-alpha` | LLM for screening cycle  |
| `generalModel`    | `openrouter/healer-alpha` | LLM for REPL / chat      |

> Override the model at runtime: `node cli.js config set screeningModel anthropic/claude-opus-4-5`

---

## How Meridian Learns

### Lessons

After each position is closed, the agent runs `studyTopLPers` on candidate pools, analyzes on-chain behavior of top performers (hold duration, entry/exit timing, win rate), and stores concrete lessons. Lessons are injected into the next agent cycle as part of the system context.

Add a lesson manually:

```bash
node cli.js lessons add "Never deploy to pump.fun tokens under 2 hours"
```

### Threshold evolution

After 5+ positions are closed, run:

```bash
node cli.js evolve
```

This analyzes closed-position performance (win rate, avg PnL, fee yield) and automatically adjusts screening thresholds in `user-config.json`. Changes take effect immediately.

### Smart wallet evolution

Every screening cycle, Meridian automatically:

- Studies top LPers from the top candidate pools
- Adds wallets with win rate >= 70%, at least 2 positions, and avg PnL >= 20%
- Updates stats for tracked wallets with a rolling average
- Removes wallets with win rate < 40% after 5+ positions, or not seen for > 30 days

Manually added wallets are never removed automatically.

### Dry run simulator

When `DRY_RUN=true`, Meridian runs as a **demo account** - all screening and decision-making runs normally, but no on-chain transactions are sent. Each time the agent decides to deploy, a virtual position is created and tracked using real market data.

Each management cycle, the simulator:

- Fetches real pool data to calculate simulated PnL
- Applies the same exit rules (stop loss, trailing TP, OOR, low yield)
- On virtual close: feeds into the same learning pipeline as live positions

After 5 virtual closes, the **config optimizer** analyzes performance and adds config adjustment suggestions to lessons - calibrated to the current wallet balance.

All data collected during dry run (lessons, pool memory, blacklist, signal weights) is used immediately when you switch to live.

```bash
/sim # view virtual trading summary in Telegram
```

---

## HiveMind

HiveMind sync uses Agent Meridian at `https://api.agentmeridian.xyz` by default. The agent can register, pull shared lessons/presets, and push learning events without a separate registration flow.

**What you get:**

- Shared lessons from other Meridian agents
- Strategy presets and collective performance context
- Role-aware lessons injected into screener/manager prompts when `hiveMindPullMode` is `auto`

**What you share:**

- Lessons from `lessons.json`
- Closed-position performance events: pool, pool name, base mint, strategy, close reason, PnL, fee, and hold time
- Agent heartbeat metadata: agent ID, version, timestamp, and basic capability flags
- **Private keys and wallet balances are never sent**

HiveMind failures do not block the agent. If Agent Meridian is unavailable, the agent logs a warning and keeps running.

Relevant config:

```json
{
  "agentId": "",
  "hiveMindUrl": "",
  "hiveMindApiKey": "",
  "hiveMindPullMode": "auto"
}
```

Set `hiveMindPullMode` to `manual` if you do not want shared lessons and presets pulled automatically.

---

## Architecture

```
index.js              Main entry: REPL + cron orchestration + Telegram bot polling
agent.js              ReAct loop: LLM -> tool call -> repeat
config.js             Runtime config from user-config.json + .env
prompt.js             System prompt builder (roles SCREENER / MANAGER / GENERAL)
state.js              Position registry (state.json)
decision-log.js       Structured decision log for deploy, close, skip, no-deploy
lessons.js            Learning engine: record performance, derive lessons, evolve thresholds
pool-memory.js        Per-pool deploy history + snapshots
strategy-library.js   Saved LP strategies
wallet-evolution.js   Auto-discovery and pruning of smart wallets
dry-run-simulator.js  Demo account mode - virtual positions + learning pipeline during dry run
telegram.js           Telegram bot: polling + notifications
hivemind.js           Agent Meridian HiveMind sync
smart-wallets.js      KOL/alpha wallet tracker
token-blacklist.js    Permanent token blacklist
cli.js                Direct CLI - each tool as a subcommand with JSON output

tools/
  definitions.js      Tool schemas (OpenAI format)
  executor.js         Tool dispatch + safety checks
  dlmm.js             Meteora DLMM SDK wrapper
  screening.js        Pool discovery
  wallet.js           SOL/token balances + Jupiter swap
  token.js            Token info, holders, narrative
  study.js            Top LPer study via LPAgent API

discord-listener/
  index.js            Discord listener selfbot
  pre-checks.js       Signal pre-check pipeline

.kiro/
  steering/           Steering files for Kiro IDE
  hooks/              Automation hooks for Kiro IDE
```

---

## Versioning and Changelog

Starting from version **1.1.0**, this project uses **Semantic Versioning**.

All notable changes are recorded in [CHANGELOG.md](./CHANGELOG.md).

---

## Disclaimer

This software is provided as-is, without warranty. Running an autonomous trading agent carries real financial risk - you can lose funds. Always start with `DRY_RUN=true` to verify behavior before going live. Never deploy more capital than you can afford to lose. This is not financial advice.

The author is not responsible for any losses arising from the use of this software.
