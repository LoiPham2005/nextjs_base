import { z } from "zod";

/**
 * Yêu cầu tối thiểu về mật khẩu.
 *
 * Sàn 8 ký tự theo NIST SP 800-63B, và cố ý KHÔNG ép phải có chữ hoa/ký tự
 * đặc biệt: những luật đó đẩy người dùng tới `Password1!` chứ không làm mật
 * khẩu mạnh hơn. Độ dài mới là thứ có giá trị. Trần 72 là giới hạn cứng của
 * bcrypt — ký tự thứ 73 trở đi bị bỏ qua im lặng, nên phải chặn từ đây.
 */
export const passwordSchema = z
  .string()
  .min(8, "Mật khẩu tối thiểu 8 ký tự")
  .max(72, "Mật khẩu tối đa 72 ký tự");

export const loginSchema = z.object({
  email: z.email("Email không hợp lệ"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  email: z.email("Email không hợp lệ"),
  password: passwordSchema,
  name: z.string().min(1, "Tên không được để trống").max(100).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;
