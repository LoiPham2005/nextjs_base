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
 *
 * ---
 * DỰ ÁN KHÔNG CẦN HÀNG ĐỢI: `QUEUE_ENABLED=0`
 *
 * Không phải dự án nào cũng đáng dựng thêm Redis và một tiến trình thứ ba.
 * Đặt `QUEUE_ENABLED=0` thì `enqueue()` chạy handler ngay trong request — kể
 * cả trên production, và đó là hành vi ĐÚNG chứ không phải một sự cố: cấu hình
 * nói rõ là không dùng hàng đợi, nên chạy thẳng không giấu giếm điều gì.
 *
 * Khác biệt duy nhất so với nhánh "thiếu Redis" ở trên là ai quyết định. Thiếu
 * `REDIS_URL` là quên; `QUEUE_ENABLED=0` là chọn. Bộ khung chỉ ném lỗi với vế
 * đầu.
 *
 * Cùng biến đó cũng tắt luôn container/tiến trình worker — xem `featureFlag()`
 * trong `src/lib/env.ts` để hiểu vì sao chỉ có MỘT biến.
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
 * @throws Khi `QUEUE_ENABLED` đang bật, đang chạy production, mà thiếu `REDIS_URL`.
 *
 * @example
 * await enqueue("email:send", { to, subject, text });
 */
export async function enqueue<TName extends JobName>(
  name: TName,
  payload: JobPayloads[TName],
  options: EnqueueOptions = {},
): Promise<void> {
  if (!env.QUEUE_ENABLED) {
    /*
     * Hàng đợi bị TẮT CÓ CHỦ ĐÍCH — khác hẳn nhánh "thiếu Redis" ngay bên dưới.
     *
     * Vì vậy ở đây không cảnh báo và cũng không ném lỗi trên production: đây là
     * một lựa chọn cấu hình hợp lệ, không phải cấu hình bỏ sót. Job vẫn chạy
     * đủ, chỉ là chạy ngay tại đây thay vì ở tiến trình khác.
     *
     * Lỗi trong handler được để BUNG RA nguyên vẹn. Nuốt nó đi thì tắt hàng đợi
     * biến thành "job im lặng biến mất" — đúng thứ mà cả file này tồn tại để
     * ngăn. Người gọi thấy lỗi và tự quyết định.
     */
    logger.debug(`QUEUE_ENABLED=0 — chạy job "${name}" ngay trong tiến trình này`);

    await jobHandlers[name](payload);
    return;
  }

  if (!env.REDIS_URL) {
    if (isProduction) {
      throw new Error(
        `Không đẩy được job "${name}": QUEUE_ENABLED đang bật nhưng thiếu REDIS_URL. ` +
          `Trên production, job bị bỏ qua trong im lặng là hành vi nguy hiểm nên ` +
          `phải chọn một trong hai đường, không có đường thứ ba:\n` +
          `  • Đặt REDIS_URL rồi chạy tiến trình worker (xem worker/) — có thử lại tự động.\n` +
          `  • Hoặc đặt QUEUE_ENABLED=0 để job chạy thẳng trong request — không cần Redis, ` +
          `nhưng người dùng phải chờ và không có thử lại.`,
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

/**
 * `true` khi job THẬT SỰ chạy nền — tức là cờ đang bật VÀ có Redis để đẩy vào.
 *
 * Cố ý không chỉ đọc `QUEUE_ENABLED`: bật cờ mà thiếu Redis thì job vẫn chạy
 * đồng bộ (ở dev) chứ không chạy nền, nên trả `true` là nói sai.
 *
 * Dùng để hiển thị trạng thái, không phải để rẽ nhánh nghiệp vụ.
 */
export function isQueueEnabled(): boolean {
  return env.QUEUE_ENABLED && Boolean(env.REDIS_URL);
}

/** Đóng kết nối. Gọi khi script ngắn hạn kết thúc, nếu không tiến trình treo. */
export async function closeQueue(): Promise<void> {
  if (!queuePromise) return;
  const queue = await queuePromise;
  await queue.close();
  queuePromise = null;
}
