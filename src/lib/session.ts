import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { env, isProduction } from "./env";

/**
 * Ký và xác thực session token.
 *
 * File này cố ý KHÔNG import `next/headers` hay Prisma: nó cũng chạy trong
 * middleware (Edge runtime), nơi cả hai đều không dùng được.
 */

export const SESSION_COOKIE_NAME = "session";

const ALGORITHM = "HS256";
const secretKey = new TextEncoder().encode(env.SESSION_SECRET);

export const SESSION_MAX_AGE_SECONDS = env.SESSION_MAX_AGE_DAYS * 24 * 60 * 60;

const sessionPayloadSchema = z.object({
  sub: z.string().min(1),
  email: z.email(),
  role: z.enum(["USER", "ADMIN"]),
});

export type SessionPayload = z.infer<typeof sessionPayloadSchema>;
export type UserRole = SessionPayload["role"];

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ email: payload.email, role: payload.role })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${env.SESSION_MAX_AGE_DAYS}d`)
    .sign(secretKey);
}

/** Trả về null cho mọi token hỏng, hết hạn, sai chữ ký hoặc sai cấu trúc. */
export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: [ALGORITHM],
    });

    const parsed = sessionPayloadSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    // Chữ ký sai / hết hạn / rác. Không log ở đây: endpoint public bị dò sẽ
    // làm ngập log mà không mang thêm thông tin gì.
    return null;
  }
}

/** Tuỳ chọn cookie dùng chung cho cả lúc set và lúc xoá. */
export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: isProduction,
  path: "/",
} as const;
