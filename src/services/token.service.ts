import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
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

const REFRESH_TOKEN_BYTES = 32;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type IssuedRefreshToken = {
  /** Chuỗi gốc — chỉ tồn tại trong response này, không lưu ở đâu cả. */
  token: string;
  expiresAt: Date;
};

export type RefreshOwner = {
  userId: string;
  email: string;
  role: UserRole;
};

export class TokenService {
  async issue(userId: string, userAgent?: string | null): Promise<IssuedRefreshToken> {
    const token = randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(token),
        userId,
        expiresAt,
        userAgent: userAgent ?? null,
      },
    });

    return { token, expiresAt };
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
      where: { tokenHash: hashToken(token) },
      include: { user: { select: { id: true, email: true, role: true } } },
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
        role: existing.user.role,
      },
      refresh,
    };
  }

  /** Đăng xuất một thiết bị. Token không tồn tại cũng không sao — vẫn coi là thành công. */
  async revoke(token: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
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
