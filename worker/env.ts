import { z } from "zod";

/**
 * Biến môi trường riêng của tiến trình worker.
 *
 * Tách khỏi `src/lib/env.ts` cùng lý do với `realtime/env.ts`: worker chỉ cần
 * đúng thứ nó dùng. Nhưng khác realtime ở hai điểm quan trọng:
 *
 *   - `REDIS_URL` là **BẮT BUỘC**. Worker không có việc gì để làm nếu không có
 *     hàng đợi để lấy job ra — chạy mà không có Redis là một tiến trình ngồi
 *     im, tốn RAM, và trông như đang hoạt động.
 *   - `DATABASE_URL` cũng bắt buộc: job đọc/ghi database qua tầng service.
 */
const schema = z.object({
  REDIS_URL: z.string().min(1, "REDIS_URL là bắt buộc — worker không chạy được nếu thiếu hàng đợi"),

  /**
   * Số job chạy song song trong MỘT tiến trình worker.
   *
   * Mặc định 5 — đủ để không nghẽn vì một job chậm, mà không đủ để một loạt
   * job nặng bóp chết connection pool của database. Job nặng CPU thì hạ xuống;
   * job chủ yếu chờ mạng (gửi mail, gọi API) thì nâng lên được.
   */
  WORKER_CONCURRENCY: z.coerce.number().int().positive().max(100).default(5),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  throw new Error(`Cấu hình worker không hợp lệ:\n${details}`);
}

export const workerEnv = parsed.data;
