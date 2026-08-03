"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { RATE_LIMITS, rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { loginSchema, registerSchema } from "@/schemas/auth.schema";
import { authService, InvalidCredentialsError } from "@/services/auth.service";
import { UserAlreadyExistsError } from "@/services/user.service";

export type AuthFormState = {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "password" | "name", string[]>>;
};

/**
 * Chỉ chấp nhận đường dẫn nội bộ.
 *
 * `//evil.com` là một path hợp lệ về mặt cú pháp nhưng trình duyệt hiểu là
 * protocol-relative URL và sẽ rời khỏi site — đây chính là lỗ hổng open
 * redirect kinh điển trên tham số `?next=`.
 */
function safeRedirectPath(value: FormDataEntryValue | null, fallback: string): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

async function getClientKey(scope: string): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? headerList.get("x-real-ip") ?? "unknown";
  return `${scope}:${ip}`;
}

export async function loginAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const rateLimitKey = await getClientKey("login");
  const limit = rateLimit(rateLimitKey, RATE_LIMITS.login);

  if (!limit.success) {
    logger.warn("Login rate limit exceeded", { key: rateLimitKey });
    return {
      error: `Bạn đã thử quá nhiều lần. Vui lòng đợi ${limit.retryAfterSeconds} giây.`,
    };
  }

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  let user;
  try {
    user = await authService.validateCredentials(parsed.data);
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      return { error: error.message };
    }
    logger.error("Login failed unexpectedly", error, { email: parsed.data.email });
    return { error: "Không thể đăng nhập lúc này. Vui lòng thử lại." };
  }

  resetRateLimit(rateLimitKey);
  await createSession({ sub: user.id, email: user.email, role: user.role });
  logger.info("User logged in", { userId: user.id });

  // redirect() hoạt động bằng cách ném exception — phải nằm ngoài mọi try/catch.
  redirect(safeRedirectPath(formData.get("next"), "/users"));
}

export async function registerAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const rateLimitKey = await getClientKey("register");
  const limit = rateLimit(rateLimitKey, RATE_LIMITS.register);

  if (!limit.success) {
    return {
      error: `Bạn đã tạo quá nhiều tài khoản. Vui lòng đợi ${limit.retryAfterSeconds} giây.`,
    };
  }

  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    name: formData.get("name") || undefined,
  });

  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  let user;
  try {
    user = await authService.register(parsed.data);
  } catch (error) {
    if (error instanceof UserAlreadyExistsError) {
      return { error: error.message };
    }
    logger.error("Registration failed", error, { email: parsed.data.email });
    return { error: "Không thể tạo tài khoản lúc này. Vui lòng thử lại." };
  }

  await createSession({ sub: user.id, email: user.email, role: user.role });
  logger.info("User registered", { userId: user.id });

  redirect("/users");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
