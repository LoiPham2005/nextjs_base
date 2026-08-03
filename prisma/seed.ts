import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { seedProd } from "./seeds/seed-prod";
import { seedDev } from "./seeds/seed-dev";

// Prisma 7 bắt buộc dùng driver adapter, kể cả cho script chạy ngoài ứng dụng.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/**
 * Điểm vào duy nhất cho seeding; chọn bộ dữ liệu qua biến SEED_TYPE
 * (`pnpm db:seed:dev` / `pnpm db:seed:prod` đã set sẵn).
 *
 * Mặc định nghiêng về "prod" khi NODE_ENV=production: nhầm lẫn ở đây phải dẫn
 * tới việc nạp ít dữ liệu hơn, không phải đổ user giả vào database thật.
 */
async function main() {
  const seedType =
    process.env.SEED_TYPE ?? (process.env.NODE_ENV === "production" ? "prod" : "dev");

  if (seedType !== "dev" && seedType !== "prod") {
    throw new Error(`SEED_TYPE không hợp lệ: "${seedType}" (chỉ nhận "dev" hoặc "prod")`);
  }

  console.log(`🌱 Seed type: ${seedType.toUpperCase()}`);

  if (seedType === "prod") {
    await seedProd(prisma);
  } else {
    await seedDev(prisma);
  }
}

main()
  .catch((error: unknown) => {
    console.error("❌ Seeding thất bại:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
