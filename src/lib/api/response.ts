import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { InvalidCredentialsError } from "@/services/auth.service";
import { RefreshTokenReuseError } from "@/services/token.service";
import { UserAlreadyExistsError, UserNotFoundError } from "@/services/user.service";

/**
 * Định dạng response thống nhất cho toàn bộ REST API.
 *
 * Thành công:  { "data": ... }
 * Thất bại:    { "error": { "code": "...", "message": "...", "fields"?: {...} } }
 *
 * `code` là thứ client Flutter nên switch-case, không phải `message`. Message
 * để hiển thị cho người dùng và có thể đổi lời văn bất cứ lúc nào; code là hợp
 * đồng giữa hai bên.
 */

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const apiErrors = {
  unauthenticated: (message = "Cần đăng nhập để truy cập") =>
    new ApiError(401, "UNAUTHENTICATED", message),

  // Trả 403 chứ không phải 404 như bên web. Trang web dùng 404 để giấu sự tồn
  // tại của tài nguyên khỏi trình duyệt; còn API thì client cần phân biệt
  // "chưa đăng nhập" với "đăng nhập rồi nhưng không đủ quyền" để xử lý khác nhau.
  forbidden: (message = "Bạn không có quyền thực hiện thao tác này") =>
    new ApiError(403, "FORBIDDEN", message),

  notFound: (message = "Không tìm thấy tài nguyên") => new ApiError(404, "NOT_FOUND", message),

  conflict: (message: string) => new ApiError(409, "CONFLICT", message),

  rateLimited: (retryAfterSeconds: number) =>
    new ApiError(429, "RATE_LIMITED", `Quá nhiều yêu cầu. Thử lại sau ${retryAfterSeconds} giây.`),

  validation: (fields: Record<string, string[]>) =>
    new ApiError(422, "VALIDATION_ERROR", "Dữ liệu gửi lên không hợp lệ", fields),
};

export function apiOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

/** Parse JSON body theo Zod schema; ném ApiError 422 nếu sai. */
export async function parseJsonBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", "Body phải là JSON hợp lệ");
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const flattened = z.flattenError(parsed.error).fieldErrors;
    throw apiErrors.validation(flattened as Record<string, string[]>);
  }

  return parsed.data;
}

/**
 * Đổi exception thành response JSON.
 *
 * Lỗi nghiệp vụ đã có kiểu rõ ràng ở tầng service được ánh xạ sang status
 * tương ứng; mọi thứ còn lại thành 500 và KHÔNG lộ nội dung lỗi ra ngoài —
 * thông điệp gốc chỉ đi vào log.
 */
export function handleApiError(error: unknown, context?: Record<string, unknown>): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.fields ? { fields: error.fields } : {}),
        },
      },
      { status: error.status },
    );
  }

  if (error instanceof InvalidCredentialsError) {
    return handleApiError(new ApiError(401, "UNAUTHENTICATED", error.message));
  }

  if (error instanceof RefreshTokenReuseError) {
    logger.warn("Refresh token reuse detected", { userId: error.userId });
    return handleApiError(
      apiErrors.unauthenticated("Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại."),
    );
  }

  if (error instanceof UserAlreadyExistsError) {
    return handleApiError(apiErrors.conflict(error.message));
  }

  if (error instanceof UserNotFoundError) {
    return handleApiError(apiErrors.notFound(error.message));
  }

  logger.error("Unhandled API error", error, context);

  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Lỗi máy chủ. Vui lòng thử lại." } },
    { status: 500 },
  );
}
