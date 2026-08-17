import { Worker, type Job } from "bullmq";
import { logger } from "@/lib/logger";
import { jobHandlers } from "@/jobs/handlers";
import type { JobName, JobPayloads } from "@/jobs/types";
import { workerEnv } from "./env";

/**
 * Tiến trình chạy job nền — RIÊNG với web, giống cách `realtime/` tách ra.
 *
 * ---
 * VÌ SAO PHẢI LÀ TIẾN TRÌNH RIÊNG
 *
 * Ba lý do, xếp theo mức quan trọng:
 *
 * 1. **Deploy web không được giết job đang chạy.** Chạy chung tiến trình thì
 *    mỗi lần restart web là một job đang xử lý dở bị cắt ngang.
 * 2. **Job nặng không được làm chậm request.** Xuất một file Excel 50MB mà
 *    chung tiến trình với web thì mọi người dùng khác đều cảm nhận được.
 * 3. **Scale độc lập.** Web cần nhiều instance vì nhiều request; worker cần
 *    nhiều instance vì nhiều job. Hai con số đó không liên quan gì tới nhau.
 *
 * ---
 * NHIỀU WORKER CÙNG LÚC THÌ SAO
 *
 * An toàn. BullMQ dùng Redis để khoá job: một job chỉ được giao cho đúng một
 * worker. Chạy 3 instance worker là xử lý nhanh gấp 3, không phải chạy trùng.
 */

export type WorkerHandle = {
  stop: () => Promise<void>;
};

export function startWorker(): WorkerHandle {
  const worker = new Worker(
    "app",
    async (job: Job) => {
      const name = job.name as JobName;
      const handler = jobHandlers[name];

      if (!handler) {
        // Job lạ = phiên bản worker cũ hơn phiên bản web đang chạy. Ném lỗi để
        // BullMQ giữ job lại trong danh sách thất bại thay vì coi như đã xong
        // — nhờ vậy sau khi deploy worker mới, job vẫn còn để chạy lại.
        throw new Error(`Không có handler cho job "${name}" — worker cũ hơn app?`);
      }

      const startedAt = Date.now();
      await handler(job.data as JobPayloads[JobName]);

      logger.info("Job xong", {
        name,
        jobId: job.id,
        attempt: job.attemptsMade + 1,
        durationMs: Date.now() - startedAt,
      });
    },
    {
      connection: { url: workerEnv.REDIS_URL },
      concurrency: workerEnv.WORKER_CONCURRENCY,
    },
  );

  // Job thất bại là thứ PHẢI thấy được. Không có listener này thì lần thử cuối
  // cùng thất bại rơi vào im lặng, và bạn chỉ phát hiện khi có người hỏi vì sao
  // không nhận được email.
  worker.on("failed", (job, error) => {
    const isFinalAttempt = !job || job.attemptsMade >= (job.opts.attempts ?? 1);
    const context = { name: job?.name, jobId: job?.id, attempt: job?.attemptsMade };

    // Tách hai nhánh thay vì `logger[cond]`: `warn` nhận (message, context)
    // còn `error` nhận (message, error, context) — hai chữ ký khác nhau, gộp
    // lại bằng truy cập theo chỉ số là mất luôn đối số `error`.
    if (isFinalAttempt) {
      logger.error("Job thất bại HẲN, không thử lại nữa", error, context);
    } else {
      logger.warn("Job thất bại, sẽ thử lại", { ...context, message: error.message });
    }
  });

  // Lỗi ở tầng kết nối (Redis rớt), không thuộc job nào. Không nghe thì nó
  // thành unhandled error và giết tiến trình.
  worker.on("error", (error) => {
    logger.error("Worker lỗi", error);
  });

  logger.info("Worker đã chạy", { concurrency: workerEnv.WORKER_CONCURRENCY });

  return {
    // `close()` đợi các job ĐANG chạy xong rồi mới thoát. Đây là điều kiện để
    // deploy không làm mất việc — xem xử lý SIGTERM trong `main.ts`.
    stop: async () => {
      await worker.close();
    },
  };
}
