import { spawn } from "node:child_process";
import process from "node:process";
import fs from "node:fs";
import path from "node:path";

const isWin = process.platform === "win32";
const localVitePath = path.resolve("node_modules", "vite", "bin", "vite.js");
const hasLocalVite = fs.existsSync(localVitePath);

console.log("\x1b[36m%s\x1b[0m", "====================================================");
console.log("\x1b[36m%s\x1b[0m", " Starting MetaMinds Portal (Server + Client)        ");
console.log("\x1b[36m%s\x1b[0m", " Backend API : http://localhost:3001                ");
console.log("\x1b[36m%s\x1b[0m", " Frontend App: http://localhost:5173                ");
console.log("\x1b[36m%s\x1b[0m", "====================================================");

let shuttingDown = false;
let serverProcess = null;

function startServer() {
  if (shuttingDown) return;
  serverProcess = spawn(
    process.execPath,
    ["--watch", "--env-file-if-exists=.env", "--disable-warning=ExperimentalWarning", "src/server.mjs"],
    { stdio: "inherit" }
  );

  serverProcess.on("error", (err) => {
    console.error("\x1b[31m[server error]\x1b[0m", err);
  });

  serverProcess.on("exit", (code) => {
    if (!shuttingDown) {
      console.log("\x1b[33m[server exited with code " + code + ", restarting in 500ms...]\x1b[0m");
      setTimeout(startServer, 500);
    }
  });
}

startServer();

// 2. Start Vite on port 5173
const client = hasLocalVite
  ? spawn(process.execPath, [localVitePath], { stdio: "inherit" })
  : spawn(isWin ? "npx.cmd" : "npx", ["vite"], { stdio: "inherit", shell: isWin });

client.on("error", (err) => console.error("\x1b[31m[client error]\x1b[0m", err));

function cleanup() {
  shuttingDown = true;
  try { if (serverProcess) serverProcess.kill(); } catch {}
  try { client.kill(); } catch {}
  process.exit();
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("exit", cleanup);
