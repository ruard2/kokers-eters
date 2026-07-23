import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const databaseUrl = process.env.DATABASE_URL || "";
const failDeployOnMigrationError = process.env.FAIL_DEPLOY_ON_MIGRATION_ERROR === "true";

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
  process.exit(failDeployOnMigrationError ? 1 : 0);
}

let result;

try {
  result = spawnSync(prismaBin, ["migrate", "deploy"], {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    stdio: "inherit"
  });
} catch (error) {
  log(`Migration command could not start: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(failDeployOnMigrationError ? 1 : 0);
}

if (result.status === 0) {
  log("Database migrations applied.");
  process.exit(0);
}

if (result.error) {
  log(`Migration command failed: ${result.error.message}`);
}

log(`Migration failed with exit code ${result.status ?? "unknown"}.`);
process.exit(failDeployOnMigrationError ? result.status || 1 : 0);
