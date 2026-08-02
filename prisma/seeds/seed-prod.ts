import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

export async function seedProd(prisma: PrismaClient) {
  console.log("🌱 [PROD SEED] Running production database seed...");

  const adminEmail = process.env.ADMIN_EMAIL || "admin@system.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "Admin@123456";
  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: "System Super Admin",
      password: hashedPassword,
      role: Role.ADMIN,
    },
  });

  console.log(`✅ [PROD SEED] Admin user ready: ${admin.email} (Role: ${admin.role})`);
}

// Allow direct execution if run as standalone script
if (require.main === module) {
  const prisma = new PrismaClient();
  seedProd(prisma)
    .catch((e) => {
      console.error("❌ [PROD SEED ERROR]", e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
