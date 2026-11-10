/**
 * One-command LOCAL development fresh start for MetaMinds.
 * Resets current employee and application records in the DEFAULT PRIVATE user-home
 * SQLite database. Always creates and verifies a complete backup first.
 * Never invoked by ordinary `npm run dev`, production, or CI.
 */
import { spawnSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, join } from "node:path";
import { connect } from "node:net";

const defaultDir = resolve(join(homedir(), ".meta-minds-portal"));
const configuredDir = resolve(process.env.DATA_DIR?.trim() || defaultDir);
const identical = process.platform === "win32"
  ? configuredDir.toLowerCase() === defaultDir.toLowerCase()
  : configuredDir === defaultDir;

if (process.env.CI || !identical || (process.env.NODE_ENV && process.env.NODE_ENV !== "development")) {
  throw new Error("Refusing employee reset outside the default local development data directory.");
}
if (/(production|live|prod-db)/i.test(configuredDir)) {
  throw new Error("The configured database appears to be a production data directory.");
}
const urlString = process.env.APP_URL || "http://localhost:5173";
const origin = new URL(urlString);
if (!["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)) {
  throw new Error("Employee reset requires a local-only APP_URL.");
}
for (const required of ["portal.sqlite", ".application-key"]) {
  if (!existsSync(join(configuredDir, required))) {
    throw new Error(`Required local file ${required} is missing in ${configuredDir}; nothing was deleted.`);
  }
}

const port = Number(process.env.PORT || 3001);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
  throw new Error("Invalid local server PORT.");
}
const serverRunning = await new Promise((resolveCheck) => {
  const socket = connect({ host: "127.0.0.1", port });
  const end = (result) => { socket.destroy(); resolveCheck(result); };
  socket.once("connect", () => end(true));
  socket.once("error", () => end(false));
  socket.setTimeout(700, () => end(false));
});
if (serverRunning) {
  throw new Error(`MetaMinds backend is already running on port ${port}. Close your existing npm run dev window before resetting, then retry.`);
}

console.log("\n=== MetaMinds FULL LOCAL EMPLOYEE FRESH START ===");
console.log("Local database:", join(configuredDir, "portal.sqlite"));
console.log("This reset is explicitly requested for TEST employee data.");
console.log("Employee accounts, applications, attendance, leave, reports and recent feed will be cleared.");
console.log("Your CEO demo account, login credentials, holidays and company configuration will be preserved.");
console.log("A verified backup of the old records and encryption key will be saved outside Git.");
const env = { ...process.env, NODE_ENV: "development", DATA_DIR: configuredDir };
const child = spawnSync(process.execPath, [
  "scripts/cleanup-employee-accounts.mjs", "--execute",
  "--confirm-disposable-data", "--full-fresh",
], { cwd: process.cwd(), env, stdio: "inherit" });
if (child.error) throw child.error;
if (child.status !== 0) {
  throw new Error(`Employee reset failed with exit code ${child.status ?? "unknown"}; do not proceed until checked.`);
}
console.log("\nEmployee reset successful. Your CEO account remains available.");
console.log("The previous database still exists in the verified backup directory.");

if (process.argv.includes("--start")) {
  console.log("\nStarting MetaMinds development dashboard with a fresh employee directory...");
  const app = spawn(process.execPath, ["dev.mjs"], { env, cwd: process.cwd(), stdio: "inherit" });
  app.on("error", (error) => { console.error(error); process.exitCode = 1; });
  app.on("exit", (code) => { process.exitCode = code ?? 1; });
}
