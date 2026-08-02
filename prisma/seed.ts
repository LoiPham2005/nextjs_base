import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const existing = await prisma.user.findUnique({
    where: { email: "admin@example.com" },
  });

  if (!existing) {
    await prisma.user.create({
      data: {
        email: "admin@example.com",
        name: "System Admin",
        role: "ADMIN",
      },
    });
    console.log("Created admin user.");
  } else {
    console.log("Admin user already exists.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
