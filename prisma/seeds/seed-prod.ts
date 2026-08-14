import type { PrismaClient } from "@prisma/client";
import { CryptoUtils } from "../../src/lib/crypto";
import { SYSTEM_ROLES } from "../../src/lib/permissions";
import { seedRbac } from "./seed-rbac";

/**
 * Dữ liệu nền tối thiểu cho mọi môi trường: một tài khoản ADMIN.
 *
 * Cố ý KHÔNG có mật khẩu mặc định. Bản trước dùng "Admin@123456" khi thiếu
 * biến môi trường — nghĩa là mọi dự án sinh ra từ template này đều có chung
 * một mật khẩu admin đã nằm công khai trong source. Ở production, thiếu biến
 * thì dừng hẳn; ngoài production thì sinh mật khẩu ngẫu nhiên và in một lần.
 */
export async function seedProd(prisma: PrismaClient) {
  // Vai trò phải tồn tại trước: users.roleId là khoá ngoại bắt buộc.
  await seedRbac(prisma);

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

  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { key: SYSTEM_ROLES.ADMIN },
    select: { id: true },
  });

  const admin = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    // Không ghi đè mật khẩu của admin đã tồn tại: seed phải chạy lại được
    // nhiều lần mà không reset thông tin đăng nhập đang dùng.
    update: {},
    create: {
      email: email.toLowerCase(),
      username: "admin",
      fullName: "System Super Admin",
      password: hashedPassword,
      roleId: adminRole.id,
    },
    select: { email: true, role: { select: { key: true } } },
  });

  console.log(`✅ [PROD SEED] Admin sẵn sàng: ${admin.email} (vai trò: ${admin.role.key})`);
}
