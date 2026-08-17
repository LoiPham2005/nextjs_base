import "server-only";
import { logger } from "@/lib/logger";
import { getMailer } from "@/lib/mailer";
import type { JobHandler, JobName, JobPayloads } from "./types";

/**
 * Nơi thực sự làm việc của từng loại job.
 *
 * ---
 * ĐƯỢC GỌI TỪ HAI CHỖ
 *
 * 1. Tiến trình `worker/` — đường đi bình thường trên production.
 * 2. Chính ứng dụng Next.js — khi chưa cấu hình Redis (xem `src/lib/queue.ts`).
 *
 * Vì vậy handler KHÔNG được giả định mình đang chạy trong worker: không đụng
 * tới biến toàn cục của worker, không tự đóng kết nối database.
 *
 * ---
 * HANDLER PHẢI CHẠY LẠI ĐƯỢC (IDEMPOTENT)
 *
 * BullMQ sẽ thử lại khi job ném lỗi, và một job có thể chạy hai lần cả khi lần
 * đầu đã "gần xong" (worker chết ngay trước lúc báo hoàn thành). Nghĩa là mọi
 * handler phải chịu được việc chạy trùng.
 *
 * Với `email:send` thì hệ quả là: thử lại có thể gửi trùng một lá thư. Chấp
 * nhận được — thà nhận hai email xác thực còn hơn không nhận cái nào. Nhưng
 * với job kiểu "trừ tiền" thì KHÔNG chấp nhận được: loại đó cần một khoá chống
 * trùng (ví dụ `jobId` cố định theo id giao dịch, xem `enqueue`).
 */
export const jobHandlers: { [K in JobName]: JobHandler<K> } = {
  "email:send": async (message: JobPayloads["email:send"]) => {
    await getMailer().send(message);
    // Cố ý KHÔNG ghi nội dung thư vào log — nó chứa link đặt lại mật khẩu.
    logger.info("Job email:send hoàn tất", { to: message.to, subject: message.subject });
  },
};
