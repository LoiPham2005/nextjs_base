import "server-only";
import { ACCESS_TOKEN_MAX_AGE_SECONDS, signSession } from "@/lib/session";
import { tokenService } from "@/services/token.service";
import type { PublicUser } from "@/services/user.service";

export type TokenPair = {
  accessToken: string;
  /** Số giây còn lại của access token — client dùng để chủ động refresh trước hạn. */
  expiresIn: number;
  tokenType: "Bearer";
  refreshToken: string;
  refreshExpiresAt: string;
  /**
   * Id của phiên vừa cấp.
   *
   * Không phải bí mật — token thật đã băm SHA-256 trước khi lưu, biết id cũng
   * không đăng nhập được. Client lưu lại để đánh dấu "thiết bị này" trên màn
   * `GET /auth/sessions`: access token không mang thông tin gì về refresh
   * token đã sinh ra nó, nên thiếu id thì màn hình đó không tự nhận ra mình.
   *
   * ⚠️ Đổi sau mỗi lần refresh, vì refresh token xoay vòng. Client phải cập
   * nhật lại giá trị này mỗi lần gọi `/auth/refresh`.
   */
  sessionId: string;
};

/**
 * Cấp cặp access + refresh token cho một phiên mobile.
 *
 * Gom vào một chỗ để `login`, `register` và `refresh` không thể lệch nhau về
 * hình dạng response — client Flutter chỉ phải viết một model duy nhất.
 */
export async function issueTokenPair(
  user: Pick<PublicUser, "id" | "email" | "role">,
  userAgent?: string | null,
): Promise<TokenPair> {
  const accessToken = await signSession(
    { sub: user.id, email: user.email, role: user.role },
    ACCESS_TOKEN_MAX_AGE_SECONDS,
  );

  const refresh = await tokenService.issue(user.id, userAgent);

  return {
    accessToken,
    expiresIn: ACCESS_TOKEN_MAX_AGE_SECONDS,
    tokenType: "Bearer",
    refreshToken: refresh.token,
    refreshExpiresAt: refresh.expiresAt.toISOString(),
    sessionId: refresh.id,
  };
}
