import { z } from "zod";
import { passwordSchema } from "./auth.schema";

export const createUserSchema = z.object({
  email: z.email("Email không hợp lệ"),
  password: passwordSchema.optional(),
  name: z.string().min(1, "Tên không được để trống").max(100).optional(),
  role: z.enum(["USER", "ADMIN"]).optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const userSchema = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string().nullable(),
  role: z.enum(["USER", "ADMIN"]),
  createdAt: z.coerce.date(),
});
export type User = z.infer<typeof userSchema>;
