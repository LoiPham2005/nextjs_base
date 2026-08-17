import { z } from "zod";
import { PERMISSIONS } from "@/lib/permissions";

/**
 * Khoá vai trò do người dùng đặt.
 *
 * Hẹp có chủ đích — CHỮ HOA, số và gạch dưới. Khoá này xuất hiện trong JWT,
 * trong log và trong các câu so sánh `role === "ADMIN"` của code, nên nó phải
 * dễ đọc bằng mắt và không có ký tự gây bất ngờ. Quy ước chữ hoa cũng giúp
 * phân biệt ngay với `name` (tên hiển thị, sửa thoải mái).
 */
export const roleKeyInputSchema = z
  .string()
  .min(2, "Khoá vai trò tối thiểu 2 ký tự")
  .max(50, "Khoá vai trò tối đa 50 ký tự")
  .regex(/^[A-Z][A-Z0-9_]*$/, "Khoá vai trò chỉ gồm CHỮ HOA, số và dấu gạch dưới");

export const roleNameSchema = z
  .string()
  .min(1, "Tên vai trò không được để trống")
  .max(100, "Tên vai trò tối đa 100 ký tự");

export const roleDescriptionSchema = z.string().max(500, "Mô tả tối đa 500 ký tự");

/**
 * Danh sách quyền, ràng buộc theo hằng `PERMISSIONS` trong code.
 *
 * Dùng `z.enum` chứ không phải `z.string()`: quyền không tồn tại phải bị bác
 * ngay ở biên, kèm tên trường cụ thể, thay vì đi sâu xuống service rồi mới lỗi.
 */
export const permissionListSchema = z.array(z.enum(PERMISSIONS));

export const createRoleSchema = z.object({
  key: roleKeyInputSchema,
  name: roleNameSchema,
  description: roleDescriptionSchema.nullish(),
  permissions: permissionListSchema.optional(),
});
export type CreateRoleInputSchema = z.infer<typeof createRoleSchema>;

/**
 * `key` cố ý KHÔNG có ở đây: nó nằm trong mọi JWT đang lưu hành, đổi là vô
 * hiệu hoá token của những người đang đăng nhập mà không báo gì.
 */
export const updateRoleSchema = z.object({
  name: roleNameSchema.optional(),
  description: roleDescriptionSchema.nullish(),
  /** Danh sách ĐẦY ĐỦ sau khi sửa — bỏ tick phải thực sự gỡ được quyền. */
  permissions: permissionListSchema.optional(),
});
export type UpdateRoleInputSchema = z.infer<typeof updateRoleSchema>;
