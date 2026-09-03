import { z } from "zod";
import { enforceRateLimit } from "@/lib/api/auth";
import { apiErrors, apiOk, handleApiError, parseJsonBody } from "@/lib/api/response";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { ACCESS_TOKEN_MAX_AGE_SECONDS, signSession } from "@/lib/session";
import { tokenService } from "@/services/token.service";

export const dynamic = "force-dynamic";

const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Thiếu refreshToken"),
});

/**
 * Đổi refresh token lấy cặp token mới.
 *
 * Endpoint này KHÔNG dùng access token: client gọi tới đây chính vì access
 * token đã hết hạn.
 */
export async function POST(request: Request) {
  try {
    await enforceRateLimit(request, "api:refresh", RATE_LIMITS.refresh);

    const { refreshToken } = await parseJsonBody(request, refreshSchema);

    const rotated = await tokenService.rotate(refreshToken, request.headers.get("user-agent"));

    // null = token không tồn tại hoặc đã hết hạn. Trường hợp token bị dùng lại
    // sau khi thu hồi thì service ném RefreshTokenReuseError và huỷ mọi phiên;
    // handleApiError chuyển nó thành 401.
    if (!rotated) {
      throw apiErrors.unauthenticated("Refresh token không hợp lệ hoặc đã hết hạn");
    }

    const accessToken = await signSession(
      {
        sub: rotated.userId,
        email: rotated.user.email,
        roles: rotated.user.roles,
      },
      ACCESS_TOKEN_MAX_AGE_SECONDS,
    );

    return apiOk({
      accessToken,
      expiresIn: ACCESS_TOKEN_MAX_AGE_SECONDS,
      tokenType: "Bearer" as const,
      refreshToken: rotated.refresh.token,
      refreshExpiresAt: rotated.refresh.expiresAt.toISOString(),
      // Refresh token xoay vòng nên id phiên cũng đổi. Client phải ghi đè giá
      // trị cũ, nếu không màn "thiết bị đang đăng nhập" sẽ đánh dấu nhầm.
      sessionId: rotated.refresh.id,
    });
  } catch (error) {
    return handleApiError(error, { route: "POST /api/v1/auth/refresh", request });
  }
}
