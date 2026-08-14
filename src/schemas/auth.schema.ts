import { z } from "zod";

/**
 * Yêu cầu tối thiểu về mật khẩu.
 *
 * Sàn 8 ký tự theo NIST SP 800-63B, và cố ý KHÔNG ép phải có chữ hoa/ký tự đặc
 * biệt: những luật đó đẩy người dùng tới `Password1!` chứ không làm mật khẩu
 * mạnh hơn. Độ dài mới là thứ có giá trị.
 *
 * Trần trước đây là 72 vì đó là giới hạn cứng của bcrypt — ký tự thứ 73 trở đi
 * bị bỏ qua im lặng. Argon2id không có giới hạn đó, nên trần được nới lên 128.
 * Vẫn cần một trần: mật khẩu dài vô hạn là một đường tấn công từ chối dịch vụ,
 * vì mỗi lần băm đều tốn bộ nhớ và thời gian thật.
 */
export const passwordSchema = z
  .string()
  .min(8, "Mật khẩu tối thiểu 8 ký tự")
  .max(128, "Mật khẩu tối đa 128 ký tự");

/**
 * Tên đăng nhập.
 *
 * Chỉ cho phép chữ thường, chữ số và dấu gạch dưới. Cố ý hẹp:
 *
 *   - Chặn chữ hoa ngay từ đầu vào thay vì tự hạ xuống, để người dùng biết
 *     chính xác tên họ sẽ là gì. Tự sửa dữ liệu người ta nhập rồi không nói gì
 *     là cách nhanh nhất khiến họ nghi ngờ hệ thống.
 *   - Không có dấu chấm và ký tự `@`: chúng làm tên đăng nhập trông như email,
 *     mà ô đăng nhập lại nhận cả hai — người dùng sẽ không biết mình nhập gì.
 *   - Không có dấu tiếng Việt: tên đăng nhập hay xuất hiện trong URL, tên file
 *     và log, những nơi ký tự Unicode gây phiền hơn là giúp ích.
 *
 * Đặt ở đây chứ không phải `user.schema.ts` để tránh import vòng — file kia đã
 * nhập `passwordSchema` từ đây rồi.
 */
export const usernameSchema = z
  .string()
  .min(3, "Tên đăng nhập tối thiểu 3 ký tự")
  .max(32, "Tên đăng nhập tối đa 32 ký tự")
  .regex(/^[a-z0-9_]+$/, "Tên đăng nhập chỉ gồm chữ thường, số và dấu gạch dưới");

export const fullNameSchema = z
  .string()
  .min(1, "Họ tên không được để trống")
  .max(100, "Họ tên tối đa 100 ký tự");

/**
 * Đăng nhập bằng email HOẶC tên đăng nhập.
 *
 * Một ô `identifier` thay vì hai ô riêng: người dùng không phải chọn trước xem
 * mình sắp nhập cái gì, và giao diện không phải đoán. Việc phân biệt do
 * `AuthService` lo — có ký tự `@` thì tra theo email, không thì tra theo tên
 * đăng nhập.
 *
 * ⚠️ ĐÂY LÀ THAY ĐỔI PHÁ VỠ TƯƠNG THÍCH so với bản trước dùng trường `email`.
 * Client mobile đang chạy phải cập nhật theo.
 */
export const loginSchema = z.object({
  identifier: z.string().min(1, "Vui lòng nhập email hoặc tên đăng nhập").max(320),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  email: z.email("Email không hợp lệ"),
  password: passwordSchema,
  /**
   * Tên đăng nhập là tuỳ chọn khi đăng ký.
   *
   * Bắt buộc ngay từ bước này sẽ làm rơi rất nhiều lượt đăng ký chỉ vì tên đẹp
   * đã có người lấy. Để họ vào trước, đặt tên sau.
   */
  username: usernameSchema.optional(),
  fullName: fullNameSchema.optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * Token gửi qua email.
 *
 * Trần 512 ký tự chỉ để chặn payload rác — token thật là 43 ký tự base64url.
 * Không kiểm tra định dạng chặt hơn: token sai sẽ bị bác ở bước tra database,
 * và một thông báo lỗi riêng cho "sai định dạng" chẳng giúp gì ngoài việc nói
 * cho kẻ dò biết họ đang đi đúng hướng.
 */
export const verificationTokenSchema = z
  .string()
  .min(1, "Thiếu mã xác thực")
  .max(512, "Mã xác thực không hợp lệ");

export const verifyEmailSchema = z.object({
  token: verificationTokenSchema,
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const forgotPasswordSchema = z.object({
  email: z.email("Email không hợp lệ"),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: verificationTokenSchema,
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/**
 * Đổi mật khẩu khi đang đăng nhập.
 *
 * `currentPassword` dùng `z.string().min(1)` chứ không phải `passwordSchema`:
 * nó là mật khẩu ĐANG dùng, có thể được đặt từ trước khi luật độ dài hiện tại
 * ra đời. Bắt nó thoả luật mới sẽ khoá cửa chính những người cần đổi nhất.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Vui lòng nhập mật khẩu hiện tại"),
    newPassword: passwordSchema,
  })
  .refine((input) => input.currentPassword !== input.newPassword, {
    message: "Mật khẩu mới phải khác mật khẩu hiện tại",
    path: ["newPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
