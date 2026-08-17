import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { startWorker } from "./worker";

/**
 * Entry của tiến trình worker.
 *
 * Tách khỏi `worker.ts` để test gọi được `startWorker()` rồi tự dừng, thay vì
 * import một file là nó tự chạy và không tắt được — giống cách `realtime/` làm.
 */
function main() {
  const worker = startWorker();

  const shutdown = () => {
    logger.info("Đang tắt worker…");

    // `stop()` ĐỢI các job đang chạy dở hoàn tất. Đây là điểm quan trọng nhất
    // của việc tắt gọn gàng: cắt ngang một job đã trừ tiền nhưng chưa ghi nhận
    // là để lại dữ liệu sai. Job chưa bắt đầu vẫn nằm nguyên trong Redis, một
    // worker khác (hoặc chính tiến trình này sau khi khởi động lại) sẽ nhận.
    //
    // ⚠️ Trình quản lý tiến trình phải cho đủ thời gian: mặc định Docker chỉ
    // đợi 10 giây sau SIGTERM rồi SIGKILL. Job dài hơn thế thì nâng
    // `stop_grace_period` trong compose.
    worker
      .stop()
      .then(() => prisma.$disconnect())
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        logger.error("Tắt worker không sạch", error);
        process.exit(1);
      });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

try {
  main();
} catch (error: unknown) {
  logger.error("Worker không khởi động được", error);
  process.exit(1);
}
