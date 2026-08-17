import "server-only";
import { prisma } from "@/lib/prisma";
import { generateOpaqueToken, hashOpaqueToken } from "@/lib/opaque-token";
import { env } from "@/lib/env";
import type { UserRole } from "@/lib/session";

/**
 * Vòng đời refresh token cho client mobile.
 *
 * Ba tính chất quan trọng, theo đúng thứ tự ưu tiên:
 *
 * 1. Database chỉ lưu SHA-256 của token. Rò database không đồng nghĩa với rò
 *    phiên đăng nhập.
 * 2. Token xoay vòng mỗi lần refresh — token cũ bị thu hồi ngay.
 * 3. Dùng lại một token đã bị thu hồi sẽ huỷ TOÀN BỘ phiên của tài khoản đó.
 *    Token đã xoay vòng mà còn được dùng lại chỉ có một cách giải thích hợp
 *    lý: nó đã bị đánh cắp. Lúc đó không thể biết bên nào là kẻ trộm, nên đá
 *    cả hai ra là phản ứng đúng.
 */

export type IssuedRefreshToken = {
  /** Chuỗi gốc — chỉ tồn tại trong response này, không lưu ở đâu cả. */
  token: string;
  expiresAt: Date;
  /**
   * Id của bản ghi refresh token.
   *
   * KHÔNG phải bí mật — biết id cũng không đăng nhập được, vì token thật đã
   * băm SHA-256 trước khi lưu. Trả nó về để client biết đâu là phiên của
   * CHÍNH NÓ trong danh sách "thiết bị đang đăng nhập": access token không
   * mang thông tin gì về refresh token đã sinh ra nó, nên không có id thì màn
   * hình đó không đánh dấu được "thiết bị này".
   */
  id: string;
};

/** Một phiên đăng nhập còn hiệu lực, dùng cho màn "thiết bị đang đăng nhập". */
export type ActiveSession = {
  id: string;
  /** Chuỗi User-Agent thô. Việc dịch sang "iPhone · Safari" để client lo. */
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
};

export type RefreshOwner = {
  userId: string;
  email: string;
  role: UserRole;
};

export class TokenService {
  async issue(userId: string, userAgent?: string | null): Promise<IssuedRefreshToken> {
    const token = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    const created = await prisma.refreshToken.create({
      data: {
        tokenHash: hashOpaqueToken(token),
        userId,
        expiresAt,
        userAgent: userAgent ?? null,
      },
      select: { id: true },
    });

    return { token, expiresAt, id: created.id };
  }

  /**
   * Đổi refresh token lấy token mới. Trả về null nếu token không hợp lệ vì
   * bất kỳ lý do gì — nơi gọi chỉ cần biết "không dùng được".
   */
  async rotate(
    token: string,
    userAgent?: string | null,
  ): Promise<{ owner: RefreshOwner; refresh: IssuedRefreshToken } | null> {
    const existing = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashOpaqueToken(token) },
      include: { user: { select: { id: true, email: true, role: { select: { key: true } } } } },
    });

    if (!existing) return null;

    if (existing.revokedAt) {
      // Token đã xoay vòng nhưng vẫn được dùng lại → coi như bị đánh cắp.
      await this.revokeAllForUser(existing.userId);
      throw new RefreshTokenReuseError(existing.userId);
    }

    if (existing.expiresAt <= new Date()) return null;

    await prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    const refresh = await this.issue(existing.userId, userAgent);

    return {
      owner: {
        userId: existing.user.id,
        email: existing.user.email,
        role: existing.user.role.key,
      },
      refresh,
    };
  }

  /** Đăng xuất một thiết bị. Token không tồn tại cũng không sao — vẫn coi là thành công. */
  async revoke(token: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashOpaqueToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Danh sách phiên còn hiệu lực của một người dùng.
   *
   * "Còn hiệu lực" = chưa thu hồi VÀ chưa hết hạn. Token đã xoay vòng vẫn nằm
   * trong bảng (có `revokedAt`) nhưng KHÔNG được hiện ra: mỗi lần refresh sinh
   * một dòng mới, nên hiện hết thì một chiếc điện thoại dùng một tháng sẽ xuất
   * hiện thành hàng trăm "thiết bị".
   */
  async listActive(userId: string): Promise<ActiveSession[]> {
    return prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, userAgent: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Thu hồi MỘT phiên theo id — nút "đăng xuất thiết bị này".
   *
   * ⚠️ `userId` là tham số BẮT BUỘC, và nó nằm trong điều kiện `where` chứ
   * không phải một phép kiểm tra riêng phía trên. Đây là điểm mấu chốt: id
   * phiên đến từ client, nên không có ràng buộc này thì bất kỳ ai cũng đăng
   * xuất được thiết bị của người khác chỉ bằng cách đoán id.
   *
   * Trả `false` khi không có gì bị thu hồi — id không tồn tại, thuộc người
   * khác, hoặc đã thu hồi rồi. Cố ý KHÔNG phân biệt ba trường hợp đó: nói rõ
   * "id này của người khác" là xác nhận cho người hỏi biết id đó có thật.
   */
  async revokeById(id: string, userId: string): Promise<boolean> {
    const result = await prisma.refreshToken.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return result.count > 0;
  }

  /** Đăng xuất mọi thiết bị. Dùng khi đổi mật khẩu hoặc phát hiện token bị dùng lại. */
  async revokeAllForUser(userId: string): Promise<number> {
    const result = await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  /**
   * Dọn token đã hết hạn. Gọi định kỳ bằng cron — bảng này chỉ tăng, mỗi lần
   * đăng nhập lại thêm một dòng.
   */
  async purgeExpired(): Promise<number> {
    const result = await prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }
}

export class RefreshTokenReuseError extends Error {
  constructor(readonly userId: string) {
    super("Refresh token đã bị thu hồi được dùng lại — toàn bộ phiên đã bị huỷ");
    this.name = "RefreshTokenReuseError";
  }
}

export const tokenService = new TokenService();
