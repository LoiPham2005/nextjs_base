import { logger } from "@/lib/logger";
import { startRealtime } from "./server";

/**
 * Entry của tiến trình realtime.
 *
 * Tách khỏi server.ts để test có thể gọi `startRealtime()` rồi tự dừng, thay vì
 * import một file là nó tự chạy và không tắt được.
 */
async function main() {
  const realtime = await startRealtime();

  const shutdown = () => {
    logger.info("Đang tắt realtime…");
    realtime
      .stop()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  };

  // Container bị dừng thì đóng kết nối gọn gàng, không cắt ngang giữa chừng.
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error: unknown) => {
  logger.error("Realtime không khởi động được", error);
  process.exit(1);
});
