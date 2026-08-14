import type { PrismaClient } from "@prisma/client";
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
} from "../../src/lib/permissions";

/**
 * Đồng bộ danh mục quyền và vai trò hệ thống từ code xuống database.
 *
 * Chạy được nhiều lần, và phải chạy đầu tiên trong mọi bộ seed — không có vai
 * trò thì không tạo được user nào.
 *
 * ---
 * NGUYÊN TẮC: CHỈ THÊM, KHÔNG GHI ĐÈ
 *
 * Đây là điểm quan trọng nhất của file này. Quyền được gán cho vai trò là thứ
 * quản trị viên chỉnh sửa trên giao diện. Nếu seed ghi đè lại theo
 * `DEFAULT_ROLE_PERMISSIONS`, thì mỗi lần deploy sẽ xoá sạch công sức cấu hình
 * của khách hàng — và không ai hiểu vì sao phân quyền "tự nhiên quay về như cũ".
 *
 * Nên: quyền còn thiếu thì thêm vào, quyền đã bị gỡ bỏ có chủ đích thì để yên.
 */
export async function seedRbac(prisma: PrismaClient) {
  // 1. Danh mục quyền. Nguồn sự thật là hằng PERMISSIONS trong code.
  for (const key of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      // Mô tả thì cập nhật được: nó chỉ là chữ hiển thị, sửa lại không đổi
      // hành vi của hệ thống.
      update: { description: PERMISSION_DESCRIPTIONS[key] },
      create: { key, description: PERMISSION_DESCRIPTIONS[key] },
    });
  }

  // 2. Quyền đã bị xoá khỏi code nhưng còn sót trong database.
  //
  // Không xoá tự động: hàng phân quyền tham chiếu tới nó sẽ biến mất theo dây
  // chuyền, và nếu quyền được thêm lại ở bản sau thì cấu hình đã mất rồi.
  // Chỉ cảnh báo để người vận hành tự quyết.
  const orphans = await prisma.permission.findMany({
    where: { key: { notIn: [...PERMISSIONS] } },
    select: { key: true },
  });

  if (orphans.length > 0) {
    console.warn(
      `⚠️  ${orphans.length} quyền có trong database nhưng không còn trong code: ` +
        `${orphans.map((permission) => permission.key).join(", ")}\n` +
        `    Chúng bị bỏ qua khi kiểm tra quyền. Xoá tay nếu chắc chắn không dùng lại.`,
    );
  }

  // 3. Vai trò hệ thống và bộ quyền mặc định.
  for (const role of DEFAULT_ROLE_PERMISSIONS) {
    const saved = await prisma.role.upsert({
      where: { key: role.key },
      // Không đụng tới `name` và `description` của vai trò đã tồn tại: khách
      // hàng có thể đã đổi tên hiển thị cho hợp với cách gọi của họ.
      update: {},
      create: {
        key: role.key,
        name: role.name,
        description: role.description,
        isSystem: true,
      },
    });

    for (const permissionKey of role.permissions) {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { key: permissionKey },
        select: { id: true },
      });

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: saved.id, permissionId: permission.id },
        },
        update: {},
        create: { roleId: saved.id, permissionId: permission.id },
      });
    }
  }

  const roleCount = await prisma.role.count();
  const permissionCount = await prisma.permission.count();

  console.log(`✅ [RBAC SEED] ${roleCount} vai trò, ${permissionCount} quyền`);
}
