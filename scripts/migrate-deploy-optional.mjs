import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const databaseUrl = process.env.DATABASE_URL || "";
const requireMigrations = process.env.REQUIRE_DATABASE_MIGRATIONS === "true";

function log(message) {
  console.log(`[migrate] ${message}`);
}

if (!databaseUrl || databaseUrl.includes("USER:PASSWORD") || databaseUrl.includes("localhost:5437")) {
  log("DATABASE_URL is missing or points to a local/demo database. Skipping migrations.");
  process.exit(0);
}

const prismaBin = join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "prisma.cmd" : "prisma");

if (!existsSync(prismaBin)) {
  log("Prisma CLI is not installed in the runtime image.");
  process.exit(requireMigrations ? 1 : 0);
}

const result = spawnSync(prismaBin, ["migrate", "deploy"], {
  cwd: process.cwd(),
  env: process.env,
  shell: false,
  stdio: "inherit"
});

if (result.status === 0) {
  log("Database migrations applied.");
  process.exit(0);
}

log(`Migration failed with exit code ${result.status ?? "unknown"}.`);
process.exit(requireMigrations ? result.status || 1 : 0);
