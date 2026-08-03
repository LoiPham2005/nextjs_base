import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySession, type SessionPayload } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { apiErrors } from "./response";

/**
 * Xác thực cho route handler.
 *
 * Khác với `@/lib/auth` (chỉ đọc cookie, dành cho web), file này ưu tiên header
 * `Authorization: Bearer` vì client mobile không dùng cookie. Vẫn fallback về
 * cookie để cùng một endpoint phục vụ được cả web lẫn app mà không cần tách
 * đôi route.
 *
 * NHẮC LẠI: Proxy cố tình không chạy trên /api (xem `src/proxy.ts`), nên đây
 * là lớp kiểm quyền DUY NHẤT cho REST API. Mọi route handler phải gọi
 * `requireApiUser` hoặc `requireApiAdmin`.
 */

function bearerToken(request: Request): string | undefined {
  const header = request.headers.get("authorization");
  if (!header) return undefined;

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return undefined;

  return token;
}

export async function getApiSession(request: Request): Promise<SessionPayload | null> {
  const fromHeader = await verifySession(bearerToken(request));
  if (fromHeader) return fromHeader;

  const cookieStore = await cookies();
  return verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

/** Ném ApiError 401 nếu chưa đăng nhập. */
export async function requireApiUser(request: Request): Promise<SessionPayload> {
  const session = await getApiSession(request);
  if (!session) throw apiErrors.unauthenticated();
  return session;
}

/** Ném ApiError 401 nếu chưa đăng nhập, 403 nếu không phải ADMIN. */
export async function requireApiAdmin(request: Request): Promise<SessionPayload> {
  const session = await requireApiUser(request);
  if (session.role !== "ADMIN") throw apiErrors.forbidden();
  return session;
}

/** IP của client, đọc qua các header proxy thường gặp. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Giới hạn tần suất theo IP; ném ApiError 429 khi vượt ngưỡng.
 * Dùng cho các endpoint không cần đăng nhập (login, register, refresh).
 */
export function enforceRateLimit(
  request: Request,
  scope: string,
  options: { limit: number; windowSeconds: number },
): string {
  const key = `${scope}:${clientIp(request)}`;
  const result = rateLimit(key, options);

  if (!result.success) throw apiErrors.rateLimited(result.retryAfterSeconds);

  return key;
}
