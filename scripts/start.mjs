import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const port = process.env.PORT || process.env.APP_PORT || "8081";
const nextBin = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

if (!existsSync(nextBin)) {
  console.error("[start] Next.js binary not found. Did the install step finish?");
  process.exit(1);
}

console.log(`[start] Starting Next.js on 0.0.0.0:${port}`);

const child = spawn(process.execPath, [nextBin, "start", "--hostname", "0.0.0.0", "--port", port], {
  cwd: process.cwd(),
  env: process.env,
  shell: false,
  stdio: "inherit"
});

function stop(signal) {
  console.log(`[start] Received ${signal}, stopping Next.js.`);
  child.kill(signal);
}

process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));

child.on("exit", (code, signal) => {
  if (signal === "SIGTERM" || signal === "SIGINT") {
    process.exit(0);
  }

  process.exit(code ?? 1);
});
