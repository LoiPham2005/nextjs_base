import "server-only";
import { env } from "./env";
import { enqueue } from "./queue";

/**
 * Mọi email đi qua HÀNG ĐỢI, không gửi thẳng.
 *
 * Vì sao: SMTP có thể mất vài giây, và người dùng bấm "quên mật khẩu" không
 * nên ngồi chờ chừng ấy chỉ để nhận về một trang xác nhận. Quan trọng hơn —
 * hàng đợi có THỬ LẠI: nhà cung cấp thư nghẽn một lúc thì job tự chạy lại,
 * thay vì lá thư biến mất vĩnh viễn.
 *
 * Chưa cấu hình Redis thì `enqueue` tự chạy ngay trong tiến trình hiện tại ở
 * môi trường dev, và NÉM LỖI ở production — xem `src/lib/queue.ts`.
 */

/**
 * Nội dung các email hệ thống.
 *
 * Tách khỏi service để phần chữ nghĩa sửa được mà không đụng vào logic, và để
 * service không phải biết gì về đường dẫn hay cách dựng link.
 */

/**
 * Dựng URL tuyệt đối trỏ về ứng dụng.
 *
 * Ném lỗi khi thiếu `NEXT_PUBLIC_APP_URL` thay vì đoán bừa `localhost`: một
 * email đặt lại mật khẩu chứa link localhost là email vô dụng, mà người dùng
 * thì đã nhận rồi — không rút lại được. Thà hỏng ngay lúc gửi.
 */
function appUrl(path: string): string {
  if (!env.NEXT_PUBLIC_APP_URL) {
    throw new Error(
      "Thiếu NEXT_PUBLIC_APP_URL — không dựng được link trong email. " +
        "Đặt biến này trong .env trước khi bật các luồng xác thực qua email.",
    );
  }

  return new URL(path, env.NEXT_PUBLIC_APP_URL).toString();
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const link = appUrl(`/verify-email?token=${encodeURIComponent(token)}`);
  const hours = env.EMAIL_VERIFICATION_TTL_HOURS;

  await enqueue("email:send", {
    to,
    subject: "Xác thực địa chỉ email của bạn",
    text: [
      "Chào bạn,",
      "",
      "Nhấn vào liên kết dưới đây để xác thực địa chỉ email này:",
      link,
      "",
      `Liên kết có hiệu lực trong ${hours} giờ.`,
      "",
      "Nếu bạn không tạo tài khoản nào, hãy bỏ qua email này.",
    ].join("\n"),
  });
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = appUrl(`/reset-password?token=${encodeURIComponent(token)}`);
  const minutes = env.PASSWORD_RESET_TTL_MINUTES;

  await enqueue("email:send", {
    to,
    subject: "Đặt lại mật khẩu",
    text: [
      "Chào bạn,",
      "",
      "Có yêu cầu đặt lại mật khẩu cho tài khoản này. Nhấn vào liên kết dưới đây:",
      link,
      "",
      `Liên kết có hiệu lực trong ${minutes} phút và chỉ dùng được một lần.`,
      "",
      // Câu này quan trọng hơn vẻ ngoài của nó: người nhận nhầm cần biết họ
      // không phải làm gì cả, và mật khẩu hiện tại vẫn còn nguyên hiệu lực.
      "Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu của bạn không thay đổi.",
    ].join("\n"),
  });
}
