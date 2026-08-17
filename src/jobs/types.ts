import type { MailMessage } from "@/lib/mailer";

/**
 * Danh mục job và hình dạng payload của từng loại.
 *
 * ---
 * VÌ SAO Ở ĐÂY, KHÔNG PHẢI TRONG `worker/`
 *
 * File này được import từ HAI phía: ứng dụng Next.js (bên đẩy job vào hàng
 * đợi) và tiến trình `worker/` (bên lấy ra chạy). Đặt ở `src/` để cả hai nhìn
 * chung một định nghĩa — nhờ vậy TypeScript bắt được ngay khi hai bên lệch
 * nhau về payload.
 *
 * Không có bước này thì lỗi lệch payload chỉ lộ ra lúc chạy, và lộ ở tiến
 * trình worker — nơi không ai đang nhìn.
 *
 * ---
 * PAYLOAD PHẢI SERIALIZE ĐƯỢC BẰNG JSON
 *
 * Job đi qua Redis dưới dạng chuỗi JSON. Nghĩa là `Date`, `Map`, `class` và
 * hàm đều KHÔNG sống sót. Dùng `string` cho thời điểm (ISO 8601) và kiểu
 * nguyên thuỷ cho phần còn lại.
 *
 * ---
 * ĐỪNG NHÉT DỮ LIỆU LỚN VÀO PAYLOAD
 *
 * Payload nằm trong Redis, tức là trong RAM. Truyền `id` rồi để worker tự đọc
 * database, đừng truyền cả bản ghi. Ngoại lệ hợp lý: nội dung email dưới đây —
 * nó cần đúng nội dung tại thời điểm gửi, đọc lại từ database sau đó có thể ra
 * kết quả khác.
 */
export type JobPayloads = {
  /**
   * Gửi một email.
   *
   * Đẩy việc gửi thư ra khỏi đường đi của request là lý do phổ biến nhất để
   * cần hàng đợi: SMTP có thể mất vài giây, và người dùng không nên ngồi chờ
   * chỉ để nhận về một trang xác nhận.
   */
  "email:send": MailMessage;
};

export type JobName = keyof JobPayloads;

/** Hàm xử lý một loại job. Không trả gì — job xong là xong. */
export type JobHandler<TName extends JobName> = (payload: JobPayloads[TName]) => Promise<void>;
