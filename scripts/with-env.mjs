/**
 * Runs a command with an env file's variables, for a second set of credentials beside
 * .env.local (a Discord test server, or production for a one-off script):
 *
 *   node scripts/with-env.mjs .env.discord next dev
 *
 * Variables already set win over the file, so a secret manager can fill them in first.
 */
import { spawnSync } from "node:child_process";

const [file, ...command] = process.argv.slice(2);
if (!file || !command.length) {
  console.error("Usage: node scripts/with-env.mjs <env file> <command> [args…]");
  process.exit(1);
}

process.loadEnvFile(file);
const [bin, ...args] = command;
const { status, error } = spawnSync(bin, args, { stdio: "inherit" });
if (error) console.error(error.message);
process.exit(status ?? 1);
