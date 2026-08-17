"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { logger } from "@/lib/logger";
import type { Permission } from "@/lib/permissions";
import { createRoleSchema, updateRoleSchema } from "@/schemas/role.schema";
import { permissionService } from "@/services/permission.service";
import {
  roleService,
  RoleInUseError,
  RoleKeyAlreadyExistsError,
  RoleNotFoundError,
  SystemRoleImmutableError,
  UnknownPermissionError,
} from "@/services/role.service";

/**
 * Mỗi Server Action là một HTTP endpoint công khai — trang gọi nó nằm sau lớp
 * nào không quan trọng, ai cũng POST thẳng tới action id được. Vì vậy mọi
 * action ở đây tự kiểm quyền.
 *
 * Khác `(admin)/users/actions.ts` ở một điểm: chỗ này kiểm theo QUYỀN chứ
 * không so `role === "ADMIN"`. Đây chính là màn hình để tạo ra những vai trò
 * không phải ADMIN mà vẫn được giao việc, nên nó không được phép tự giả định
 * rằng chỉ ADMIN mới dùng tới.
 */
async function denyUnlessPermitted(permission: Permission): Promise<{ error: string } | null> {
  const session = await getSession();

  if (!session) return { error: "Bạn cần đăng nhập để thực hiện thao tác này." };

  if (!(await permissionService.can(session.role, permission))) {
    logger.warn("Thao tác phân quyền bị từ chối", { userId: session.sub, permission });
    return { error: "Bạn không có quyền thực hiện thao tác này." };
  }

  return null;
}

export type RoleFormState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<Record<"key" | "name" | "description" | "permissions", string[]>>;
};

/**
 * Lưu lại bộ quyền của một vai trò.
 *
 * FormData gửi lên chỉ chứa những ô ĐƯỢC TICK — trình duyệt bỏ qua checkbox
 * không tick. Đó đúng là thứ ta cần vì `roleService.update` mang ngữ nghĩa
 * "thay thế toàn bộ": ô bỏ tick vắng mặt trong form nên cũng bị gỡ khỏi vai
 * trò. Nếu service mang ngữ nghĩa "chỉ thêm" thì màn hình này không bao giờ gỡ
 * được quyền nào.
 */
export async function updateRolePermissionsAction(
  _prevState: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  const denied = await denyUnlessPermitted("role:update");
  if (denied) return denied;

  const key = formData.get("key");
  if (typeof key !== "string" || !key) return { error: "Thiếu khoá vai trò." };

  const parsed = updateRoleSchema.safeParse({
    permissions: formData.getAll("permissions"),
  });

  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  try {
    await roleService.update(key, parsed.data);
  } catch (error) {
    if (error instanceof RoleNotFoundError || error instanceof UnknownPermissionError) {
      return { error: error.message };
    }
    logger.error("Cập nhật phân quyền thất bại", error, { roleKey: key });
    return { error: "Không thể lưu phân quyền lúc này. Vui lòng thử lại." };
  }

  logger.info("Phân quyền được cập nhật", { roleKey: key });
  revalidatePath("/roles");

  return { success: `Đã lưu phân quyền cho vai trò "${key}".` };
}

export async function createRoleAction(
  _prevState: RoleFormState,
  formData: FormData,
): Promise<RoleFormState> {
  const denied = await denyUnlessPermitted("role:create");
  if (denied) return denied;

  const parsed = createRoleSchema.safeParse({
    key: formData.get("key"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    // Vai trò mới cố ý bắt đầu với BỘ QUYỀN RỖNG, không kế thừa gì cả. Vai trò
    // vừa tạo mà đã có sẵn quyền là cách nhanh nhất để cấp nhầm.
    permissions: [],
  });

  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  try {
    await roleService.create(parsed.data);
  } catch (error) {
    if (error instanceof RoleKeyAlreadyExistsError) {
      return { fieldErrors: { key: [error.message] } };
    }
    logger.error("Tạo vai trò thất bại", error, { roleKey: parsed.data.key });
    return { error: "Không thể tạo vai trò lúc này. Vui lòng thử lại." };
  }

  logger.info("Vai trò được tạo", { roleKey: parsed.data.key });
  revalidatePath("/roles");

  return { success: `Đã tạo vai trò "${parsed.data.key}". Hãy tick quyền cho nó bên dưới.` };
}

export async function deleteRoleAction(key: string): Promise<{ error?: string }> {
  const denied = await denyUnlessPermitted("role:delete");
  if (denied) return denied;

  try {
    // Luật "không xoá vai trò hệ thống" và "không xoá vai trò còn người dùng"
    // nằm trong service — chép lại ở đây thì sớm muộn hai bên cũng lệch nhau.
    await roleService.delete(key);
  } catch (error) {
    if (
      error instanceof RoleNotFoundError ||
      error instanceof SystemRoleImmutableError ||
      error instanceof RoleInUseError
    ) {
      return { error: error.message };
    }
    logger.error("Xoá vai trò thất bại", error, { roleKey: key });
    return { error: "Không thể xoá vai trò lúc này. Vui lòng thử lại." };
  }

  logger.info("Vai trò bị xoá", { roleKey: key });
  revalidatePath("/roles");

  return {};
}
