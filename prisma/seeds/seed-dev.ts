import type { PrismaClient } from "@prisma/client";
import { CryptoUtils } from "../../src/lib/crypto";
import { seedProd } from "./seed-prod";

const DEV_PASSWORD = "devpassword123";

/**
 * Dữ liệu mẫu cho dev/test. Chặn cứng ở production — mật khẩu bên dưới là
 * hằng số công khai nằm trong source.
 */
export async function seedDev(prisma: PrismaClient) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Không được chạy dev seed trên production.");
  }

  console.log("🚀 [DEV SEED] Nạp dữ liệu phát triển…");

  // Đảm bảo tài khoản admin nền tồn tại trước.
  await seedProd(prisma);

  const password = await CryptoUtils.hashPassword(DEV_PASSWORD);

  const mockUsers = [
    { email: "user1@example.com", name: "Nguyễn Văn A", role: "USER" as const },
    { email: "user2@example.com", name: "Trần Thị B", role: "USER" as const },
    { email: "dev.admin@example.com", name: "Dev Manager", role: "ADMIN" as const },
    { email: "test.user@example.com", name: "Tester Demo", role: "USER" as const },
  ];

  for (const user of mockUsers) {
    const created = await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: { ...user, password },
    });
    console.log(` └─ ${created.email} (${created.name ?? "—"})`);
  }

  console.log(`✅ [DEV SEED] Xong ${mockUsers.length} user mẫu. Mật khẩu: ${DEV_PASSWORD}`);
}
