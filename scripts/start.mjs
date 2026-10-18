import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const port = process.env.PORT || "8081";
const nextBin = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const prismaBin = join(process.cwd(), "node_modules", ".bin", "prisma");

if (!existsSync(nextBin)) {
  console.error("[start] Next.js binary not found. Did the install step finish?");
  process.exit(1);
}

// Apply any pending schema changes before starting (runs at runtime, after DB is reachable)
if (process.env.DATABASE_URL) {
  console.log("[start] Running prisma db push...");
  const result = spawnSync(process.execPath, [prismaBin, "db", "push", "--skip-generate"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    console.error("[start] prisma db push failed, aborting.");
    process.exit(result.status ?? 1);
  }
  console.log("[start] prisma db push done.");
} else {
  console.warn("[start] DATABASE_URL not set, skipping prisma db push.");
}

if (!process.env.PORT) {
  console.warn("[start] PORT is not set; falling back to local port 8081.");
} else {
  console.log(`[start] PORT from environment is ${process.env.PORT}.`);
}

console.log(`[start] Starting Next.js on 0.0.0.0:${port}`);
console.log(
  `[start] IMPORTANT: the Railway public domain 'target port' MUST equal ${port}, ` +
    "otherwise the public URL returns 502 even though this container is healthy."
);

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
