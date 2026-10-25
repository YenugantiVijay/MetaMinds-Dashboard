import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { db } from "./database.mjs";
import { hashPassword } from "./domain.mjs";

if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
  throw new Error("Run this setup command in an interactive terminal so the initial password can be entered without echoing it.");
}

const rl = createInterface({ input: stdin, output: stdout });
try {
  if (db.prepare("SELECT 1 FROM users WHERE role = 'ceo' LIMIT 1").get()) {
    throw new Error("A CEO account already exists. Use the authenticated portal to manage access.");
  }
  const email = (await rl.question("CEO/MD email: ")).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  rl.close();
  const password = await new Promise((resolve, reject) => {
    let value = "";
    stdout.write("Initial password (minimum 12 characters): ");
    stdin.setRawMode(true);
    stdin.resume();
    const restore = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      stdout.write("\n");
    };
    const onData = (buffer) => {
      for (const character of buffer.toString("utf8")) {
        if (character === "\u0003") {
          restore();
          reject(new Error("Setup cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          restore();
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        if (character >= " " && character !== "\u007f" && value.length < 256) value += character;
      }
    };
    stdin.on("data", onData);
  });
  const passwordHash = hashPassword(password);
  db.prepare("INSERT INTO users(email, password_hash, role, active) VALUES (?, ?, 'ceo', 1)").run(email, passwordHash);
  console.log("CEO account created. Configure SMTP before expecting email notifications.");
} finally {
  rl.close();
}
