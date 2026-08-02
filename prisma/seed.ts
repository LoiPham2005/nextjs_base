import { PrismaClient } from "@prisma/client";
import { seedProd } from "./seeds/seed-prod";
import { seedDev } from "./seeds/seed-dev";

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const seedType = process.env.SEED_TYPE || (args.includes("--prod") ? "prod" : "dev");
  const isProdEnv = process.env.NODE_ENV === "production";

  if (seedType === "prod" || (isProdEnv && seedType !== "dev")) {
    console.log("🔒 Target environment: PRODUCTION");
    await seedProd(prisma);
  } else {
    console.log("🛠️ Target environment: DEVELOPMENT / TEST");
    await seedDev(prisma);
  }
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
