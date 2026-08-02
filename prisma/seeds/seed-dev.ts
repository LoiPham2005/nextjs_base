import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedProd } from "./seed-prod";

export async function seedDev(prisma: PrismaClient) {
  console.log("🚀 [DEV SEED] Starting development & test data seed...");

  // First ensure production base data (Super Admin) exists
  await seedProd(prisma);

  const defaultPassword = await bcrypt.hash("123456", 10);

  const mockUsers = [
    {
      email: "user1@example.com",
      name: "Nguyễn Văn A",
      password: defaultPassword,
      role: Role.USER,
    },
    {
      email: "user2@example.com",
      name: "Trần Thị B",
      password: defaultPassword,
      role: Role.USER,
    },
    {
      email: "dev.admin@example.com",
      name: "Dev Manager",
      password: defaultPassword,
      role: Role.ADMIN,
    },
    {
      email: "test.user@example.com",
      name: "Tester Demo",
      password: defaultPassword,
      role: Role.USER,
    },
  ];

  let createdCount = 0;
  for (const userData of mockUsers) {
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {},
      create: userData,
    });
    console.log(` └─ Mock user: ${user.email} (${user.name})`);
    createdCount++;
  }

  console.log(`✅ [DEV SEED] Completed! Inserted/Verified ${createdCount} mock users (Password: 123456)`);
}

// Allow direct execution if run as standalone script
if (require.main === module) {
  const prisma = new PrismaClient();
  seedDev(prisma)
    .catch((e) => {
      console.error("❌ [DEV SEED ERROR]", e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
