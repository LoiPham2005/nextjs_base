import type { Queue } from "bullmq";
import { env, isProduction } from "./env";
import { logger } from "./logger";
import { jobHandlers } from "@/jobs/handlers";
import type { JobName, JobPayloads } from "@/jobs/types";

/**
 * Hàng đợi job nền, chạy trên BullMQ + Redis.
 *
 * ---
 * VÌ SAO CẦN
 *
 * Có những việc không nên nằm trên đường đi của request: gửi email (SMTP mất
 * vài giây), gọi API bên thứ ba, xuất báo cáo, xử lý ảnh. Làm ngay trong
 * request thì người dùng ngồi chờ, và một lần mạng chậm là một lần họ thấy
 * trang treo.
 *
 * Hàng đợi còn cho hai thứ mà chạy thẳng không có: **thử lại tự động** khi
 * thất bại, và **không mất việc** khi tiến trình chết giữa chừng.
 *
 * ---
 * KHÔNG CÓ REDIS THÌ SAO — VÀ VÌ SAO KHÔNG IM LẶNG BỎ QUA
 *
 * Hàng đợi bền vững thì bắt buộc phải có nơi lưu, nên không có bản "chạy trong
 * RAM" nào tương đương. Nhưng bắt phải có Redis mới chạy được `pnpm dev` là
 * một rào cản vô nghĩa. Cách xử lý, theo đúng lối `src/lib/mailer.ts` đã chọn:
 *
 *   - Có `REDIS_URL`  → đẩy vào hàng đợi, worker xử lý (đường đi thật).
 *   - Không, và đang DEV → chạy NGAY trong tiến trình hiện tại, kèm cảnh báo.
 *     Lập trình viên thấy việc chạy thật mà không phải dựng Redis.
 *   - Không, và đang PRODUCTION → **NÉM LỖI**.
 *
 * Vế cuối là phần quan trọng nhất. Im lặng bỏ qua job trên production nghĩa là
 * email không bao giờ gửi, báo cáo không bao giờ chạy — mà không có dòng log
 * nào nói rằng có việc đã bị nuốt. Thà hỏng ngay lúc deploy.
 */

const QUEUE_NAME = "app";

type BullQueue = Queue<unknown, void, string>;

let queuePromise: Promise<BullQueue> | null = null;

async function getQueue(url: string): Promise<BullQueue> {
  queuePromise ??= (async () => {
    // Import động: máy không cấu hình Redis thì BullMQ không bao giờ được nạp,
    // và bundle của Next cũng không phải mang nó.
    const { Queue } = await import("bullmq");

    const queue = new Queue(QUEUE_NAME, {
      connection: { url },
      defaultJobOptions: {
        // Thử lại 3 lần với khoảng cách tăng dần (1s, 2s, 4s). Phần lớn thất
        // bại là tạm thời — SMTP nghẽn, API bên kia trả 503 — và chờ một chút
        // rồi thử lại giải quyết được hầu hết.
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },

        // Dọn job đã xong, nếu không Redis phình vô hạn. Giữ lại một ít để còn
        // soi được khi cần.
        removeOnComplete: { age: 3600, count: 1000 },
        // Job THẤT BẠI giữ lâu hơn hẳn — đó mới là thứ cần điều tra, và nó
        // thường chỉ được phát hiện sau vài ngày.
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    });

    logger.info("Queue: đã kết nối Redis");
    return queue as BullQueue;
  })();

  return queuePromise;
}

export type EnqueueOptions = {
  /**
   * Khoá chống trùng. Hai job cùng `jobId` thì BullMQ chỉ giữ một.
   *
   * Dùng khi việc của bạn KHÔNG chịu được chạy hai lần — trừ tiền, cấp mã
   * giảm giá. Đặt theo định danh nghiệp vụ (`"invoice:123"`), đừng đặt ngẫu
   * nhiên vì như vậy là không chống được gì.
   */
  jobId?: string;
  /** Hoãn lại bao nhiêu mili-giây trước khi chạy. */
  delay?: number;
};

/**
 * Đẩy một job vào hàng đợi.
 *
 * @throws Khi đang chạy production mà chưa cấu hình `REDIS_URL`.
 *
 * @example
 * await enqueue("email:send", { to, subject, text });
 */
export async function enqueue<TName extends JobName>(
  name: TName,
  payload: JobPayloads[TName],
  options: EnqueueOptions = {},
): Promise<void> {
  if (!env.REDIS_URL) {
    if (isProduction) {
      throw new Error(
        `Không đẩy được job "${name}": chưa cấu hình REDIS_URL. ` +
          `Trên production, job bị bỏ qua trong im lặng là hành vi nguy hiểm — ` +
          `đặt REDIS_URL và chạy tiến trình worker (xem worker/).`,
      );
    }

    logger.warn(
      `Queue chưa có Redis — chạy job "${name}" NGAY trong tiến trình này. ` +
        `Chỉ dành cho môi trường dev: không có thử lại, không sống sót qua restart.`,
    );

    // Chạy thẳng, và để lỗi bung ra như thể gọi hàm bình thường — ở dev thì
    // thấy lỗi ngay là điều tốt.
    await jobHandlers[name](payload);
    return;
  }

  const queue = await getQueue(env.REDIS_URL);
  await queue.add(name, payload, { jobId: options.jobId, delay: options.delay });

  logger.debug("Đã đẩy job vào hàng đợi", { name, jobId: options.jobId });
}

/** `true` khi job thật sự chạy nền. Dùng để hiển thị trạng thái, không phải để rẽ nhánh nghiệp vụ. */
export function isQueueEnabled(): boolean {
  return Boolean(env.REDIS_URL);
}

/** Đóng kết nối. Gọi khi script ngắn hạn kết thúc, nếu không tiến trình treo. */
export async function closeQueue(): Promise<void> {
  if (!queuePromise) return;
  const queue = await queuePromise;
  await queue.close();
  queuePromise = null;
}
