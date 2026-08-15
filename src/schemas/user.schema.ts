import { z } from "zod";
import { fullNameSchema, passwordSchema, usernameSchema } from "./auth.schema";

/**
 * Khoá vai trò.
 *
 * Là chuỗi chứ không phải enum vì vai trò nằm trong database và tạo thêm được
 * lúc chạy. Vai trò không tồn tại sẽ bị `userService` bác — ràng buộc nằm ở
 * khoá ngoại, chỗ duy nhất biết được sự thật.
 */
export const roleKeySchema = z
  .string()
  .min(1, "Vai trò không được để trống")
  .max(50, "Khoá vai trò quá dài");

export const createUserSchema = z.object({
  email: z.email("Email không hợp lệ"),
  password: passwordSchema.optional(),
  username: usernameSchema.optional(),
  fullName: fullNameSchema.optional(),
  roleKey: roleKeySchema.optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  username: usernameSchema.nullish(),
  fullName: fullNameSchema.nullish(),
  roleKey: roleKeySchema.optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/** Khoá thủ công do admin — xem ghi chú enum `UserStatus` trong schema.prisma. */
export const userStatusSchema = z.enum(["ACTIVE", "BANNED"]);
export type UserStatusInput = z.infer<typeof userStatusSchema>;

export const updateUserStatusSchema = z.object({
  status: userStatusSchema,
});
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;

export const userSchema = z.object({
  id: z.string(),
  email: z.email(),
  username: z.string().nullable(),
  fullName: z.string().nullable(),
  role: roleKeySchema,
  roleName: z.string(),
  emailVerifiedAt: z.coerce.date().nullable(),
  status: userStatusSchema,
  lockedUntil: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
});
export type User = z.infer<typeof userSchema>;
