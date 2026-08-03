import type { PrismaClient } from "@prisma/client";
import { CryptoUtils } from "../../src/lib/crypto";

/**
 * Dữ liệu nền tối thiểu cho mọi môi trường: một tài khoản ADMIN.
 *
 * Cố ý KHÔNG có mật khẩu mặc định. Bản trước dùng "Admin@123456" khi thiếu
 * biến môi trường — nghĩa là mọi dự án sinh ra từ template này đều có chung
 * một mật khẩu admin đã nằm công khai trong source. Ở production, thiếu biến
 * thì dừng hẳn; ngoài production thì sinh mật khẩu ngẫu nhiên và in một lần.
 */
export async function seedProd(prisma: PrismaClient) {
  const isProduction = process.env.NODE_ENV === "production";

  const adminEmail = process.env.ADMIN_EMAIL;
  let adminPassword = process.env.ADMIN_PASSWORD;

  if (isProduction && (!adminEmail || !adminPassword)) {
    throw new Error(
      "Seed production cần ADMIN_EMAIL và ADMIN_PASSWORD. " +
        "Không có mật khẩu mặc định — đó là chủ ý.",
    );
  }

  const email = adminEmail ?? "admin@example.com";

  if (!adminPassword) {
    adminPassword = crypto.randomUUID().replaceAll("-", "").slice(0, 20);
    console.log("\n⚠️  ADMIN_PASSWORD chưa được set. Mật khẩu sinh ngẫu nhiên:");
    console.log(`    ${adminPassword}`);
    console.log("    (chỉ hiện một lần — hãy lưu lại ngay)\n");
  }

  const hashedPassword = await CryptoUtils.hashPassword(adminPassword);

  const admin = await prisma.user.upsert({
    where: { email },
    // Không ghi đè mật khẩu của admin đã tồn tại: seed phải chạy lại được
    // nhiều lần mà không reset thông tin đăng nhập đang dùng.
    update: {},
    create: {
      email,
      name: "System Super Admin",
      password: hashedPassword,
      role: "ADMIN",
    },
  });

  console.log(`✅ [PROD SEED] Admin sẵn sàng: ${admin.email} (role: ${admin.role})`);
}
