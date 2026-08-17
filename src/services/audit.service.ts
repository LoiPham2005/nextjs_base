import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * Nhật ký thao tác — ai đổi gì, lúc nào.
 *
 * ---
 * VÌ SAO DỰ ÁN NÀY CẦN NÓ HƠN PHẦN LỚN DỰ ÁN KHÁC
 *
 * Phân quyền ở đây sửa được lúc chạy. Một người có `role:update` có thể tự cấp
 * thêm quyền cho vai trò của chính mình — hợp lệ về mặt kỹ thuật, và không có
 * bảng này thì không cách nào biết chuyện đó đã xảy ra, cũng không biết lúc nào.
 *
 * ---
 * GHI NHẬT KÝ KHÔNG BAO GIỜ ĐƯỢC LÀM HỎNG THAO TÁC CHÍNH
 *
 * Đây là quyết định thiết kế quan trọng nhất của file này: `record()` **nuốt
 * mọi lỗi**. Database nhật ký đầy đĩa, hay một cột bị đổi kiểu, thì người dùng
 * vẫn phải xoá được vai trò của họ.
 *
 * Đánh đổi rõ ràng: có thể MẤT bản ghi nhật ký. Chấp nhận được với nhật ký vận
 * hành. KHÔNG chấp nhận được nếu bạn cần nhật ký cho mục đích pháp lý hoặc
 * tuân thủ — lúc đó phải ghi trong CÙNG transaction với thao tác chính, và để
 * thao tác thất bại theo. Xem `recordOrThrow` bên dưới.
 *
 * ---
 * ĐỪNG GHI DỮ LIỆU NHẠY CẢM VÀO `metadata`
 *
 * Nhật ký sống rất lâu và thường được xuất ra để điều tra. Mật khẩu, token,
 * số thẻ, thông tin cá nhân — không thứ nào được vào đây. Ghi "đã đổi mật
 * khẩu", đừng ghi mật khẩu.
 */

export type AuditEntry = {
  /** Việc gì, quy ước `<tài-nguyên>.<hành-động>` — ví dụ `role.permissions_updated`. */
  action: string;
  /** Loại đối tượng: `role`, `user`… */
  entity: string;
  entityId?: string | null;
  /** Ai làm. Bỏ trống = tiến trình hệ thống (seed, cron, worker). */
  actorId?: string | null;
  actorEmail?: string | null;
  /** Chi tiết đủ để hiểu chuyện gì đã xảy ra. KHÔNG chứa dữ liệu nhạy cảm. */
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
};

export class AuditService {
  /**
   * Ghi một bản ghi nhật ký. **Không bao giờ ném lỗi.**
   *
   * Gọi SAU khi thao tác chính đã thành công — ghi trước rồi thao tác thất bại
   * thì nhật ký nói dối.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          actorId: entry.actorId ?? null,
          actorEmail: entry.actorEmail ?? null,
          metadata: entry.metadata,
          ip: entry.ip ?? null,
          userAgent: entry.userAgent ?? null,
        },
      });
    } catch (error) {
      // Vẫn phải để lại dấu vết ở đâu đó — log ứng dụng là nơi cuối cùng.
      logger.error("Không ghi được nhật ký thao tác", error, {
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
      });
    }
  }

  /**
   * Bản NÉM LỖI khi ghi thất bại.
   *
   * Dùng cho những thao tác mà "không có nhật ký" là không chấp nhận được —
   * nghiệp vụ tiền bạc, hoặc yêu cầu tuân thủ. Gọi trong cùng transaction với
   * thao tác chính để hoặc cả hai cùng thành công, hoặc cả hai cùng huỷ.
   */
  async recordOrThrow(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? prisma;

    await client.auditLog.create({
      data: {
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        actorId: entry.actorId ?? null,
        actorEmail: entry.actorEmail ?? null,
        metadata: entry.metadata,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  }

  /**
   * Đọc nhật ký, mới nhất trước. Phân trang kiểu cursor.
   *
   * Cố ý KHÔNG dùng offset: bảng này chỉ tăng, và `OFFSET 10000` buộc Postgres
   * đọc rồi bỏ đi 10000 dòng ở mỗi lần lật trang.
   */
  async list(options: {
    actorId?: string;
    entity?: string;
    entityId?: string;
    cursor?: string;
    perPage?: number;
  }): Promise<{ entries: AuditLogRow[]; nextCursor: string | null }> {
    const perPage = Math.min(options.perPage ?? 50, 200);

    const rows = await prisma.auditLog.findMany({
      where: {
        ...(options.actorId ? { actorId: options.actorId } : {}),
        ...(options.entity ? { entity: options.entity } : {}),
        ...(options.entityId ? { entityId: options.entityId } : {}),
      },
      orderBy: { createdAt: "desc" },
      // Lấy dư MỘT dòng để biết còn trang sau hay không, mà không phải chạy
      // thêm một câu `count` trên bảng lớn.
      take: perPage + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > perPage;
    const entries = hasMore ? rows.slice(0, perPage) : rows;

    return {
      entries,
      nextCursor: hasMore ? (entries.at(-1)?.id ?? null) : null,
    };
  }

  /**
   * Xoá bản ghi cũ hơn N ngày.
   *
   * Gọi định kỳ bằng cron — bảng này chỉ tăng. Giữ bao lâu là quyết định
   * nghiệp vụ: 90 ngày đủ cho vận hành, nhưng yêu cầu tuân thủ có thể đòi
   * nhiều năm. Đừng hạ con số xuống chỉ vì database đang đầy.
   */
  async purgeOlderThan(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    return result.count;
  }
}

export type AuditLogRow = Prisma.AuditLogGetPayload<object>;

export const auditService = new AuditService();
