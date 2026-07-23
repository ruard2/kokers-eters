import { prisma } from "../lib/db";
import { seedDemoData } from "../lib/seed";

async function main() {
  const result = await seedDemoData();
  console.log(`Demo database gevuld voor ${result.month}.`);
  console.log(`${result.participants} deelnemers, ${result.matched} matches gemaakt (van ${result.requested} aanvragen, ${result.hosts} hostplekken).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
