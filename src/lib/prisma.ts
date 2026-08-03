import "server-only";
import { PrismaClient } from "@prisma/client";
import { isProduction } from "./env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProduction ? ["error"] : ["warn", "error"],
  });

// Trong dev, HMR load lại module liên tục. Không cache lại thì mỗi lần sửa file
// sẽ sinh thêm một connection pool, tới lúc Postgres từ chối kết nối mới.
if (!isProduction) {
  globalForPrisma.prisma = prisma;
}
