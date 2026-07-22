import { runDueJobs } from "../lib/automation";
import { prisma } from "../lib/db";

async function main() {
  const result = await runDueJobs();
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
