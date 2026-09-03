"use server";
import { AccountBannedError, AccountLockedError, InvalidCredentialsError, InvalidVerificationTokenError, DuplicateFieldError } from "@/lib/errors";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { RATE_LIMITS, rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { safeRedirectPath } from "@/lib/safe-redirect";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "@/schemas/auth.schema";
import { authService } from "@/services/auth.service";

/**
 * Tên các ô trong form xác thực.
 *
 * Union này là hợp đồng giữa ba nơi: `name=` của thẻ input, khoá lỗi Zod trả
 * về, và khoá mà `AuthFields` dùng để tìm lỗi đem hiển thị. Giữ nó khớp với
 * schema chính là thứ chặn lại lỗi cũ — form gửi `email` trong khi schema đòi
 * `identifier`, khiến đăng nhập hỏng hoàn toàn mà không lớp nào bắt được.
 */
export type AuthFieldName = "identifier" | "email" | "username" | "fullName" | "password";

export type AuthFormState = {
  error?: string;
  /**
   * Thông điệp thành công hiển thị TẠI CHỖ, không kèm điều hướng.
   *
   * Cần cho luồng quên mật khẩu: nó cố ý không nói được gì về kết quả thật
   * (email có tồn tại hay không), nên cũng không có trang nào để đá người dùng
   * sang. Câu trả lời chính là toàn bộ phản hồi.
   */
  success?: string;
  fieldErrors?: Partial<Record<AuthFieldName, string[]>>;
};

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
  const limit = await rateLimit(rateLimitKey, RATE_LIMITS.login);

  if (!limit.success) {
    logger.warn("Login rate limit exceeded", { key: rateLimitKey });
    return {
      error: `Bạn đã thử quá nhiều lần. Vui lòng đợi ${limit.retryAfterSeconds} giây.`,
    };
  }

  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  let user;
  try {
    user = await authService.validateCredentials(parsed.data);
  } catch (error) {
    if (
      error instanceof InvalidCredentialsError ||
      error instanceof AccountBannedError ||
      error instanceof AccountLockedError
    ) {
      return { error: error.message };
    }
    logger.error("Login failed unexpectedly", error, { identifier: parsed.data.identifier });
    return { error: "Không thể đăng nhập lúc này. Vui lòng thử lại." };
  }

  await resetRateLimit(rateLimitKey);
  await createSession({ typ: "access" as const, sub: user.id, email: user.email, roles: user.roles });
  logger.info("User logged in", { userId: user.id });

  // redirect() hoạt động bằng cách ném exception — phải nằm ngoài mọi try/catch.
  redirect(safeRedirectPath(formData.get("next"), "/users"));
}

export async function registerAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const rateLimitKey = await getClientKey("register");
  const limit = await rateLimit(rateLimitKey, RATE_LIMITS.register);

  if (!limit.success) {
    return {
      error: `Bạn đã tạo quá nhiều tài khoản. Vui lòng đợi ${limit.retryAfterSeconds} giây.`,
    };
  }

  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    fullName: formData.get("fullName") || undefined,
  });

  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  let user;
  try {
    user = await authService.register(parsed.data);
  } catch (error) {
    if (error instanceof DuplicateFieldError) {
      return { error: error.message };
    }
    logger.error("Registration failed", error, { email: parsed.data.email });
    return { error: "Không thể tạo tài khoản lúc này. Vui lòng thử lại." };
  }

  await createSession({ typ: "access" as const, sub: user.id, email: user.email, roles: user.roles });
  logger.info("User registered", { userId: user.id });

  redirect("/users");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Quên mật khẩu / đặt lại mật khẩu / xác thực email
//
// Ba action dưới đây là cửa vào phía WEB cho những luồng mà trước đó chỉ có
// REST API. Link trong email trỏ tới `/verify-email` và `/reset-password`;
// thiếu chúng thì người dùng bấm link trong thư và nhận 404.
// ---------------------------------------------------------------------------

/**
 * Gửi link đặt lại mật khẩu.
 *
 * Trả về ĐÚNG MỘT thông điệp cho mọi kết cục — email tồn tại, không tồn tại,
 * hay việc gửi thư thất bại. Đây là endpoint công khai, nên bất kỳ khác biệt
 * nào cũng biến nó thành công cụ dò danh sách người dùng.
 *
 * Kể cả lỗi thật cũng bị nuốt, vì để nó bung ra thành thông báo lỗi thì chính
 * thông báo đó là tín hiệu: lỗi gửi thư chỉ xảy ra khi email có thật.
 */
export async function forgotPasswordAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const rateLimitKey = await getClientKey("forgot-password");
  const limit = await rateLimit(rateLimitKey, RATE_LIMITS.passwordResetRequest);

  if (!limit.success) {
    return {
      error: `Bạn đã yêu cầu quá nhiều lần. Vui lòng đợi ${limit.retryAfterSeconds} giây.`,
    };
  }

  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  try {
    await authService.requestPasswordReset(parsed.data.email);
  } catch (error) {
    logger.error("Không gửi được email đặt lại mật khẩu", error);
  }

  return {
    success: "Nếu địa chỉ này có tài khoản, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu.",
  };
}

/**
 * Đặt mật khẩu mới bằng token trong email.
 *
 * Xoá luôn cookie phiên hiện tại. Service đã thu hồi mọi refresh token, nhưng
 * cookie web là JWT đã ký nên không thu hồi được từ phía máy chủ — chỉ có thể
 * xoá nó khỏi trình duyệt đang thao tác. Luồng này thường xuất phát từ nghi
 * ngờ bị chiếm tài khoản, nên để phiên cũ sống tiếp là tự vô hiệu hoá chính
 * việc đổi mật khẩu.
 */
export async function resetPasswordAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const rateLimitKey = await getClientKey("reset-password");
  const limit = await rateLimit(rateLimitKey, RATE_LIMITS.passwordChange);

  if (!limit.success) {
    return {
      error: `Bạn đã thử quá nhiều lần. Vui lòng đợi ${limit.retryAfterSeconds} giây.`,
    };
  }

  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors;

    // Token nằm trong URL chứ không phải ô người dùng nhập được, nên báo lỗi
    // theo field cho nó là vô nghĩa — không có ô nào để sửa.
    if (fieldErrors.token) {
      return { error: "Liên kết không hợp lệ. Hãy yêu cầu gửi lại email." };
    }
    return { fieldErrors };
  }

  try {
    await authService.resetPassword(parsed.data.token, parsed.data.password);
  } catch (error) {
    if (error instanceof InvalidVerificationTokenError) {
      return { error: error.message };
    }
    logger.error("Reset password failed", error);
    return { error: "Không thể đặt lại mật khẩu lúc này. Vui lòng thử lại." };
  }

  await destroySession();
  logger.info("Web reset password thành công");

  redirect("/login?reset=1");
}

/**
 * Xác thực địa chỉ email.
 *
 * ⚠️ Cố ý là một ACTION (POST) chứ không phải việc xảy ra khi mở trang.
 *
 * Token dùng một lần. Nếu tiêu thụ nó ngay lúc GET, thì bộ quét link của
 * Gmail/Outlook — vốn tự mở mọi URL trong thư để kiểm tra an toàn — sẽ đốt
 * mất token trước khi người dùng kịp bấm. Người dùng bấm vào và nhận "liên
 * kết đã hết hạn", còn log thì cho thấy nó vừa được dùng thành công.
 *
 * Nên: mở trang chỉ hiện một nút, tiêu thụ token khi người dùng bấm.
 */
export async function verifyEmailAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const rateLimitKey = await getClientKey("verify-email");
  const limit = await rateLimit(rateLimitKey, RATE_LIMITS.passwordChange);

  if (!limit.success) {
    return {
      error: `Bạn đã thử quá nhiều lần. Vui lòng đợi ${limit.retryAfterSeconds} giây.`,
    };
  }

  const parsed = verifyEmailSchema.safeParse({ token: formData.get("token") });

  if (!parsed.success) {
    return { error: "Liên kết không hợp lệ hoặc đã hết hạn." };
  }

  try {
    const user = await authService.verifyEmail(parsed.data.token);
    logger.info("Web verify email", { userId: user.id });
  } catch (error) {
    if (error instanceof InvalidVerificationTokenError) {
      return { error: error.message };
    }
    logger.error("Verify email failed", error);
    return { error: "Không thể xác thực email lúc này. Vui lòng thử lại." };
  }

  return { success: "Địa chỉ email của bạn đã được xác thực." };
}
