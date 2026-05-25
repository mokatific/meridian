/**
 * PM2 Ecosystem Config — Meridian
 *
 * Path-aware: uses __dirname so this works regardless of where the repo was cloned.
 * Reads .env from the repo root — no npm deps required.
 *
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 restart meridian
 *   pm2 stop meridian
 *   pm2 delete meridian
 *   pm2 logs meridian
 */

const path = require("path");
const fs = require("fs");

const ROOT = __dirname;

function parseEnv(envPath) {
  const env = {};
  if (!fs.existsSync(envPath)) return env;
  fs.readFileSync(envPath, "utf8")
    .split("\n")
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const eq = trimmed.indexOf("=");
      if (eq === -1) return;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    });
  return env;
}

const dotenv = parseEnv(path.join(ROOT, ".env"));

const logDir = path.join(ROOT, "logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

module.exports = {
  apps: [
    {
      name: "meridian",
      script: path.join(ROOT, "index.js"),
      cwd: ROOT,
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      restart_delay: 5000,
      kill_timeout: 10000,
      max_restarts: 10,
      min_uptime: "10s",
      out_file: path.join(logDir, "pm2-out.log"),
      err_file: path.join(logDir, "pm2-err.log"),
      log_date_format: "DD-MM-YYYY HH:mm:ss Z",
      env: {
        ...dotenv,
        NODE_ENV: "production",
      },
    },
  ],
};
