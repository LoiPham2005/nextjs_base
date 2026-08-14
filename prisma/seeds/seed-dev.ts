import type { PrismaClient } from "@prisma/client";
import { CryptoUtils } from "../../src/lib/crypto";
import { SYSTEM_ROLES } from "../../src/lib/permissions";
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
    {
      email: "user1@example.com",
      username: "vana",
      fullName: "Nguyễn Văn A",
      roleKey: SYSTEM_ROLES.USER,
    },
    {
      email: "user2@example.com",
      username: "thib",
      fullName: "Trần Thị B",
      roleKey: SYSTEM_ROLES.USER,
    },
    {
      email: "dev.admin@example.com",
      username: "devadmin",
      fullName: "Dev Manager",
      roleKey: SYSTEM_ROLES.ADMIN,
    },
    {
      email: "test.user@example.com",
      username: "tester",
      fullName: "Tester Demo",
      roleKey: SYSTEM_ROLES.USER,
    },
  ];

  // Tra id vai trò một lần rồi dùng lại, thay vì mỗi user một truy vấn.
  const roles = await prisma.role.findMany({ select: { id: true, key: true } });
  const roleIdByKey = new Map(roles.map((role) => [role.key, role.id]));

  for (const user of mockUsers) {
    const roleId = roleIdByKey.get(user.roleKey);
    if (!roleId) throw new Error(`Thiếu vai trò "${user.roleKey}" — seedRbac chưa chạy?`);

    const created = await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: {
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        password,
        roleId,
      },
      select: { email: true, fullName: true },
    });
    console.log(` └─ ${created.email} (${created.fullName ?? "—"})`);
  }

  console.log(`✅ [DEV SEED] Xong ${mockUsers.length} user mẫu. Mật khẩu: ${DEV_PASSWORD}`);
}
