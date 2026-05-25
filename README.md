# Meridian

**Meridian** is an autonomous AI agent designed to manage liquidity on **Meteora DLMM** (Dynamic Liquidity Market Maker) on the Solana blockchain.

**Links:** [Website](https://agentmeridian.xyz) | [Telegram](https://t.me/agentmeridian) | [X](https://x.com/meridian_agent)

Meridian runs a continuous screening and management loop — deploying capital into high-quality Meteora DLMM pools and closing positions based on live PnL, yield, and range data. The agent learns from every closed position.

---

## What Meridian Does

- **Pool screening** — scans Meteora DLMM pools using configurable thresholds (fee/TVL ratio, organic score, holder count, market cap, bin step) and surfaces top opportunities
- **Position management** — monitors, claims fees, and closes LP positions autonomously; decides STAY, CLOSE, or REDEPLOY based on live data
- **Performance-driven learning** — studies top LPers in target pools, stores structured lessons, and adjusts screening thresholds based on closed-position history
- **Smart wallet evolution** — automatically discovers high-quality LP wallets from study data, auto-adds strong wallets, and prunes poor performers
- **Dry-run simulator** — demo mode: with `DRY_RUN=true` the agent tracks virtual positions using real market data, simulates PnL, and learns from virtual closes exactly like live positions
- **Discord signals** — optional Discord listener that watches LP Army channels for Solana token signals and queues them for screening
- **Telegram chat & control** — full agent chat via Telegram, plus cycle reports and OOR alerts
- **Kiro integration** — run AI-powered screening and management from the editor using steering files and hooks

---

## How It Works

Meridian runs a ReAct agent loop: each cycle the LLM reasons over live data, calls tools, and acts. Two specialized agents run on independent cron schedules:

| Agent                | Default interval | Role                                                          |
| -------------------- | ---------------- | ------------------------------------------------------------- |
| **Screening Agent**  | Every 30 minutes | Discover and (when appropriate) deploy to top candidate pools |
| **Management Agent** | Every 10 minutes | Evaluate and manage each open position                        |

### Agent harness

The Meridian harness is the runtime wrapper for each autonomous cycle. It provides both agent loops with the same control surface: load live state, inject relevant memory, expose role-appropriate tools, execute tool calls, and return a readable cycle report.

The harness also records a structured decision log in `decision-log.json` for deploys, closes, skips, and no-deploy outcomes. Each entry stores the actor, pool or position, a summary, rationale, key risks, metrics, and rejected alternatives. Recent decisions are re-injected into the system prompt so the agent can explain "why did you deploy?", "why did you close?", or "why did you skip?" using factual history.

**Data sources:**

- `@meteora-ag/dlmm` SDK — on-chain position data, active bin, deploy/close transactions
- Meteora DLMM PnL API — position yields, accumulated fees, PnL
- OKX OnchainOS — smart-money signals and token risk scoring
- Pool screening APIs — fee/TVL ratio, volume, organic score, holder counts
- Jupiter APIs — token audits, market cap, launchpad flags, price stats

The agent is powered via **OpenRouter** (or any compatible provider) and models can be swapped at any time.

---

## Requirements

- Node.js 18+
- OpenRouter API key (or [SwiftRouter](https://swiftrouter.com/?auth=signup&ref=H8D935KD4J) / other compatible provider)
- Solana wallet (private key in base58 or JSON)
- Solana RPC endpoint (Helius recommended)
- Telegram bot token (optional)

---

## Setup

### 0. One-script VPS setup (recommended)

Supported OS: Ubuntu 20.04+, Debian 11+, AlmaLinux/Rocky Linux 8+.

```bash
git clone https://github.com/mokatific/meridian.git
cd meridian
bash install.sh
```

The installer sets up system packages, mise, Node/Yarn, project dependencies, and optionally runs `yarn setup`.

### 1. Install node deps

```bash
yarn install
```

### 2. Run the setup wizard

```bash
yarn setup
```

The wizard helps create `.env` (API keys, wallet, RPC, Telegram) and `user-config.json` (risk presets, deploy sizes, thresholds, model). It takes about 2 minutes.

**Manual setup:**

Create `.env`:

```env
WALLET_PRIVATE_KEY=your_base58_private_key
RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
OPENROUTER_API_KEY=sk-or-...
HELIUS_API_KEY=your_helius_key   # for wallet balance lookup
TELEGRAM_BOT_TOKEN=123456:ABC... # optional — for notifications + chat
TELEGRAM_CHAT_ID=                # auto-filled after first message
DRY_RUN=true                     # set to false for live trading
```

> Never place private keys or API keys in `user-config.json` — use `.env`. Both files are in `.gitignore`.

Copy the example config and edit as needed:

```bash
cp user-config.example.json user-config.json
```

### 3. Run

```bash
yarn dev   # dry run — no on-chain transactions
yarn start # live mode
```

On startup Meridian fetches wallet balance, open positions, and top pool candidates, then begins autonomous cycles.

### Run with PM2

PM2 is supported and recommended for keeping Telegram control reliably online on a VPS:

```bash
yarn install
yarn pm2:start
pm2 save
```

To update an existing PM2 deployment:

```bash
git pull
yarn install
yarn pm2:restart
```

If processes keep restarting after an update, inspect the app error log first:

```bash
yarn pm2:logs
```

Most PM2 post-update crashes are startup errors — often caused by forgetting to run `yarn install` after a lockfile change, starting PM2 from the wrong directory, or missing `.env` / `user-config.json` values. Avoid using `nohup`; it runs outside PM2 and can leave duplicate, unmanaged Telegram polling processes.

---

## Using Other LLM Providers (SwiftRouter, OpenAI, local, etc.)

Meridian is not limited to OpenRouter. You may use **SwiftRouter**, OpenAI, Groq, Together AI, or even local models (LM Studio / Ollama).

### Easiest: Setup Wizard

```bash
yarn setup
```

The wizard will ask which LLM provider you want to use.

### Manual

Add these lines to `.env`:

```env
LLM_BASE_URL=https://api.swiftrouter.com/v1
LLM_API_KEY=sk-your-api-key
LLM_MODEL=claude-sonnet-4-6
```

### Local models (LM Studio)

```env
LLM_BASE_URL=http://localhost:1234/v1
LLM_API_KEY=lm-studio
LLM_MODEL=your-local-model-name
```

All OpenAI-compatible endpoints work.

### Recommended models

| Model               | Quality   | Notes                          | Recommended            |
| ------------------- | --------- | ------------------------------ | ---------------------- |
| `claude-sonnet-4-6` | Very Good | Most stable, best tool-calling | **Highly recommended** |
| `gemini-2.5-pro`    | Good      | Fast and cost-effective        | Good                   |
| `deepseek-r1-0528`  | Good      | Strong reasoning               | Worth trying           |

---

## Operation Modes

### Autonomous agent

```bash
yarn start
```

Starts full autonomous agent with cron-driven screening + management cycles and an interactive REPL. The prompt shows countdowns to the next cycles:

```
[manage: 8m 12s | screen: 24m 3s]
>
```

REPL commands:

| Command                 | Description                                                             |
| ----------------------- | ----------------------------------------------------------------------- |
| `/status`               | Wallet balance and open positions                                       |
| `/candidates`           | Re-screen and show top pool candidates                                  |
| `/learn`                | Study top LPers across current candidates                               |
| `/learn <pool_address>` | Study top LPers for a specific pool                                     |
| `/thresholds`           | Current screening thresholds and performance stats                      |
| `/evolve`               | Trigger threshold evolution from performance data (requires 5+ closes)  |
| `/stop`                 | Graceful shutdown                                                       |
| `<any text>`            | Free-form chat — ask the agent anything, request actions, analyze pools |

### CLI (direct tool invocation)

The `meridian` CLI exposes each tool with JSON output — useful for scripting, debugging, or piping to other tools.

```bash
yarn global add file:.
meridian < command > [flags]
```

Or without installing:

```bash
node cli.js < command > [flags]
```

**Positions & PnL**

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

**Deploy & manage**

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

**Learning & memory**

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

The Discord listener monitors configured channels (for example, LP Army) for Solana token signals and queues them as signals for the screener.

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

> This uses a selfbot (automating a personal account, not a bot token). Use responsibly.

### Run

```bash
cd discord-listener
yarn start
```

Signals are written to `discord-signals.json` and automatically picked up by the screening cycle.

### Signal pipeline

Incoming token addresses go through a pre-check pipeline before being queued:

1. **Dedup** — ignore addresses seen in the last 10 minutes
2. **Blacklist** — reject blacklisted mints
3. **Pool resolution** — resolve address to Meteora DLMM pool
4. **Rug check** — check deployer against `deployer-blacklist.json`
5. **Fees check** — reject pools below `DISCORD_MIN_FEES_SOL`

Signals that pass all checks are queued with status `pending`. The screener consumes pending signals as priority candidates before regular cycles.

---

## Telegram

### Setup

1. Create a bot via [@BotFather](https://t.me/BotFather) and copy the token
2. Add `TELEGRAM_BOT_TOKEN=<token>` to `.env`
3. Set the chat ID and allowed user IDs in `.env`:

```bash
TELEGRAM_BOT_TOKEN=<token>
TELEGRAM_CHAT_ID=<target chat id>
TELEGRAM_ALLOWED_USER_IDS=<comma-separated Telegram user ids>
```

Security notes:

- If `TELEGRAM_CHAT_ID` is not set, inbound Telegram control is ignored
- Notifications are still sent to the configured chat, but control is restricted to allowed user IDs

### Notifications

- After each management cycle: full agent report (reasoning + decision)
- After each screening cycle: full agent report (what was found, whether it deployed)
- When a position goes out-of-range beyond `outOfRangeWaitMinutes`
- On deploy: pair, amount, position address, tx hash
- On close: pair and PnL

### Telegram commands

| Command                 | Action                                  |
| ----------------------- | --------------------------------------- |
| `/help`                 | Show all commands                       |
| `/status`               | Wallet snapshot + positions             |
| `/wallet`               | Wallet, deploy amount, HiveMind status  |
| `/positions`            | List open positions                     |
| `/pool <n>`             | Show detailed info for a position       |
| `/close <n>`            | Close a position by index               |
| `/closeall`             | Close all open positions                |
| `/set <n> <note>`       | Set a note/instruction on a position    |
| `/config`               | Show important runtime config           |
| `/settings`             | Button menu for common config           |
| `/setcfg <key> <value>` | Update persisted config                 |
| `/screen`               | Refresh deterministic candidate list    |
| `/candidates`           | Show latest cached candidates           |
| `/deploy <n>`           | Deploy a cached candidate by index      |
| `/smart_wallets`        | List tracked smart wallets              |
| `/sim`                  | Virtual trading summary (dry run stats) |
| `/briefing`             | Morning briefing                        |
| `/hive`                 | HiveMind sync status                    |
| `/hive pull`            | Manual HiveMind pull now                |
| `/pause`                | Pause cron cycles                       |
| `/resume`               | Resume cron cycles                      |
| `/stop`                 | Stop the agent                          |

You can also chat freely via Telegram using the same REPL-style interface.

---

## Config Reference

All fields are optional — defaults shown. Edit `user-config.json`.

### Screening

| Field                  | Default    | Description                               |
| ---------------------- | ---------- | ----------------------------------------- |
| `minFeeActiveTvlRatio` | `0.05`     | Minimum fee / active TVL ratio            |
| `minTvl`               | `10000`    | Minimum pool TVL (USD)                    |
| `maxTvl`               | `150000`   | Maximum pool TVL (USD)                    |
| `minVolume`            | `500`      | Minimum pool volume                       |
| `minOrganic`           | `60`       | Minimum organic score (0–100)             |
| `minHolders`           | `500`      | Minimum token holder count                |
| `minMcap`              | `150000`   | Minimum market cap (USD)                  |
| `maxMcap`              | `10000000` | Maximum market cap (USD)                  |
| `minBinStep`           | `80`       | Minimum bin step                          |
| `maxBinStep`           | `125`      | Maximum bin step                          |
| `timeframe`            | `5m`       | Candle timeframe for screening            |
| `category`             | `trending` | Pool category filter                      |
| `minTokenFeesSol`      | `30`       | Minimum all-time fees (in SOL)            |
| `maxBundlersPct`       | `30`       | Max % bundler presence in top 100 holders |
| `maxTop10Pct`          | `60`       | Max concentration in top-10 holders       |
| `blockedLaunchpads`    | `[]`       | Launchpad names never to deploy           |

### Management

| Field                   | Default | Description                                 |
| ----------------------- | ------- | ------------------------------------------- |
| `deployAmountSol`       | `0.5`   | Base SOL per new position                   |
| `positionSizePct`       | `0.35`  | Fraction of deployable balance per position |
| `maxDeployAmount`       | `50`    | Max SOL per position                        |
| `gasReserve`            | `0.2`   | Minimum SOL reserved for gas                |
| `minSolToOpen`          | `0.55`  | Min wallet SOL required to open a position  |
| `outOfRangeWaitMinutes` | `30`    | Minutes OOR before action                   |
| `stopLossPct`           | `-15`   | Close position if price drops by this %     |
| `takeProfitPct`         | `12`    | Close position when total return reaches %  |
| `trailingTakeProfit`    | `true`  | Enable trailing take profit                 |
| `trailingTriggerPct`    | `4`     | Start trailing at this % of PnL             |
| `trailingDropPct`       | `1.5`   | Close when drop from peak exceeds this %    |

### Schedule

| Field                   | Default | Description                         |
| ----------------------- | ------- | ----------------------------------- |
| `managementIntervalMin` | `10`    | Management cycle interval (minutes) |
| `screeningIntervalMin`  | `30`    | Screening cycle interval (minutes)  |

### Model

| Field             | Default                   | Description               |
| ----------------- | ------------------------- | ------------------------- |
| `managementModel` | `openrouter/healer-alpha` | LLM for management cycles |
| `screeningModel`  | `openrouter/hunter-alpha` | LLM for screening cycles  |
| `generalModel`    | `openrouter/healer-alpha` | LLM for REPL / chat       |

> Override the model at runtime: `node cli.js config set screeningModel anthropic/claude-opus-4-5`

---

## How Meridian Learns

### Lessons

After every closed position, the agent runs `studyTopLPers` on the pool, analyzes on-chain top-performer behavior (hold duration, entry/exit timing, win rate), and stores actionable lessons. Lessons are injected into the agent prompt for future cycles.

Add a lesson manually:

```bash
node cli.js lessons add "Never deploy to token pump.fun within 2 hours"
```

### Threshold evolution

After 5+ closed positions, run:

```bash
node cli.js evolve
```

This analyzes closed-position performance (win rate, avg PnL, fee yield) and automatically adjusts screening thresholds in `user-config.json`. Changes take effect immediately.

### Smart wallet evolution

Each screening cycle Meridian automatically:

- Studies top LPers from top candidate pools
- Auto-adds wallets with win rate ≥70%, at least 2 positions, and avg PnL ≥20%
- Updates tracked wallet statistics with a rolling average
- Auto-removes wallets with win rate <40% after ≥5 positions, or wallets not seen for >30 days

Manually added wallets are never auto-removed.

### Dry run simulator

With `DRY_RUN=true`, Meridian runs as a demo account — screening and decision-making behave normally, but no on-chain transactions are sent. When the agent decides to deploy, a virtual position is created and tracked using real market data.

Each management cycle the simulator:

- Fetches real pool data to calculate simulated PnL
- Applies the same exit rules (stop loss, trailing TP, OOR, low yield)
- On virtual close: feeds results into the same learning pipeline as live positions

After 5 virtual closes the config optimizer analyzes performance and adds recommended config adjustments to lessons — calibrated to the current wallet balance.

All dry-run data (lessons, pool memory, blacklist, signal weights) is immediately usable when switching to live mode.

```bash
/sim # view virtual trading summary in Telegram
```

---

## HiveMind

HiveMind sync uses the Agent Meridian service at `https://api.agentmeridian.xyz` by default. Agents can register, pull shared lessons/presets, and push learning events without a separate registration flow.

**What you receive:**

- Shared lessons from other Meridian agents
- Strategy presets and collective performance context
- Role-aware lessons injected into screener/manager prompts when `hiveMindPullMode` is `auto`

**What you share:**

- Lessons from `lessons.json`
- Closed-position performance events: pool, pool name, base mint, strategy, close reason, PnL, fees, hold time
- Agent heartbeat metadata: agent ID, version, timestamp, and capability flags
- **Private keys and wallet balances are never transmitted**

HiveMind failures do not block the agent. If the Meridian HiveMind is unavailable the agent logs a warning and continues operating.

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
agent.js              ReAct loop: LLM → tool call → repeat
config.js             Runtime config from user-config.json + .env
prompt.js             System prompt builder (roles: SCREENER / MANAGER / GENERAL)
state.js              Position registry (state.json)
decision-log.js       Structured decision log for deploy, close, skip, no-deploy
lessons.js            Learning engine: record performance, derive lessons, evolve thresholds
pool-memory.js        Per-pool deploy history + snapshots
strategy-library.js   Saved LP strategies
wallet-evolution.js   Auto-discovery and pruning of smart wallets
dry-run-simulator.js  Demo account mode — virtual positions + learning pipeline during dry run
telegram.js           Telegram bot: polling + notifications
hivemind.js           Agent Meridian HiveMind sync
smart-wallets.js      KOL/alpha wallet tracker
token-blacklist.js    Permanent token blacklist
cli.js                CLI — each tool as a subcommand with JSON output

tools/
  definitions.js      Tool schemas (OpenAI format)
  executor.js         Tool dispatch + safety checks
  dlmm.js             Meteora DLMM SDK wrapper
  screening.js        Pool discovery
  wallet.js           SOL/token balances + Jupiter swap
  token.js            Token info, holders, narrative
  study.js            Top-LPer study via LPAgent API

discord-listener/
  index.js            Selfbot Discord listener
  pre-checks.js       Signal pre-check pipeline

.kiro/
  steering/           Steering files for Kiro IDE
  hooks/              Automation hooks for Kiro IDE
```

---

## Versioning & Changelog

Starting with version **1.1.0** this project follows **Semantic Versioning**.

All notable changes are recorded in [CHANGELOG.md](./CHANGELOG.md).

---

## Disclaimer

This software is provided "as-is", without warranty. Running an autonomous trading agent carries real financial risk — you can lose funds. Always start with `DRY_RUN=true` to validate behavior before going live. Never deploy more capital than you can afford to lose. This is not financial advice.

The author is not liable for any losses resulting from use of this software.
