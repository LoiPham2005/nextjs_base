import "server-only";
import { env, isProduction } from "./env";
import { logger } from "./logger";

/**
 * Lớp gửi email.
 *
 * ---
 * VÌ SAO KHÔNG CHỌN SẴN NHÀ CUNG CẤP
 *
 * Đây là bộ khung dùng cho nhiều dự án, mà mỗi dự án lại bị ràng buộc khác nhau:
 * có nơi bắt buộc dùng SMTP nội bộ của khách, có nơi dùng Resend hoặc SES, có
 * nơi khách đã mua sẵn dịch vụ khác. Cắm cứng một nhà cung cấp vào đây chỉ tạo
 * ra việc phải gỡ ra.
 *
 * Thay vào đó: một interface hẹp, và một bản cài đặt mặc định ghi ra log cho
 * môi trường dev. Cắm nhà cung cấp thật = viết một object thoả `Mailer` rồi
 * truyền vào `setMailer()` ở nơi khởi động ứng dụng.
 *
 * ---
 * VÌ SAO BẢN MẶC ĐỊNH GHI LOG THAY VÌ NÉM LỖI
 *
 * Ở môi trường dev, lập trình viên cần thấy được đường link trong luồng xác
 * thực email mà không phải dựng hạ tầng gửi thư. Ném lỗi sẽ chặn cả luồng.
 *
 * Nhưng trên production thì im lặng nuốt email là hành vi nguy hiểm — người
 * dùng bấm "quên mật khẩu", hệ thống báo thành công, mà thư không bao giờ tới.
 * Nên ở production, bản mặc định ném lỗi để buộc phải cấu hình thật.
 */

export type MailMessage = {
  to: string;
  subject: string;
  /** Nội dung dạng chữ thuần. Bắt buộc — mọi trình đọc thư đều hiển thị được. */
  text: string;
  html?: string;
};

export type Mailer = {
  send(message: MailMessage): Promise<void>;
};

/**
 * Bản mặc định: ghi nội dung ra log ở dev, ném lỗi ở production.
 *
 * Cố ý ghi cả phần `text` — link xác thực nằm trong đó, và đó chính là thứ lập
 * trình viên cần lấy ra khi chạy máy cục bộ.
 */
const consoleMailer: Mailer = {
  // Không khai báo `async`: thân hàm không chờ gì cả. Trả Promise trực tiếp
  // vừa đúng kiểu `Mailer`, vừa nói thật rằng ở đây không có thao tác bất đồng
  // bộ nào.
  send(message) {
    if (isProduction) {
      return Promise.reject(
        new Error(
          "Chưa cấu hình Mailer. Gọi setMailer() với một nhà cung cấp thật " +
            "(Resend / SES / SMTP) ở nơi khởi động ứng dụng trước khi chạy production.",
        ),
      );
    }

    logger.info("[mailer:dev] Email không được gửi thật", {
      from: env.MAIL_FROM ?? "(chưa đặt MAIL_FROM)",
      to: message.to,
      subject: message.subject,
      text: message.text,
    });

    return Promise.resolve();
  },
};

let currentMailer: Mailer = consoleMailer;

/** Cắm nhà cung cấp thật. Gọi một lần lúc khởi động ứng dụng. */
export function setMailer(mailer: Mailer): void {
  currentMailer = mailer;
}

export function getMailer(): Mailer {
  return currentMailer;
}
