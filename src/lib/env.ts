import { z } from "zod";

/**
 * Validate biến môi trường một lần, ngay lúc module được load.
 *
 * Lý do tồn tại: nếu không có lớp này, một `DATABASE_URL` gõ sai chỉ lộ ra khi
 * request đầu tiên chạm tới database — thường là trên production, vài phút sau
 * khi deploy. Ở đây nó fail ngay lúc khởi động, kèm thông báo chỉ rõ biến nào sai.
 *
 * Trong Docker build không có secret thật, nên đặt SKIP_ENV_VALIDATION=1 cho
 * bước `next build` (xem Dockerfile).
 */
/**
 * Coi chuỗi RỖNG như "không khai báo".
 *
 * `.optional()` và `.default()` của Zod chỉ nhảy vào khi giá trị là
 * `undefined`. Nhưng có ba đường rất phổ biến đưa chuỗi rỗng vào thay vì
 * `undefined`:
 *
 *   - dòng `ADMIN_EMAIL=` bỏ trống trong file `.env`
 *   - `ARG`/`ENV` của Dockerfile không được truyền giá trị
 *   - `${BIEN:-}` trong docker-compose khi biến chưa set
 *
 * Không có lớp này thì app chết ngay lúc khởi động kèm thông báo gây hiểu lầm
 * ("ADMIN_EMAIL không hợp lệ") cho một biến vốn là tuỳ chọn — và nó chỉ xảy ra
 * trên Docker/CI chứ không xảy ra trên máy dev, nên rất tốn thời gian truy.
 */
function emptyAsUndefined<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema);
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL là bắt buộc")
    .refine(
      (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
      "DATABASE_URL phải là chuỗi kết nối PostgreSQL (postgresql://...)",
    ),

  /** Kết nối trực tiếp, bỏ qua pooler. Chỉ cần khi dùng PgBouncer/Neon/Supabase. */
  DIRECT_DATABASE_URL: emptyAsUndefined(z.string().min(1).optional()),

  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET phải dài tối thiểu 32 ký tự (dùng: openssl rand -base64 48)"),

  /** Hạn của cookie session trên web. */
  SESSION_MAX_AGE_DAYS: z.coerce.number().int().positive().max(365).default(7),

  /**
   * Hạn access token cấp cho client mobile. Ngắn có chủ đích: JWT đã ký thì
   * không thu hồi được, nên thứ giới hạn thiệt hại khi lộ token chính là hạn
   * của nó. Việc giữ đăng nhập lâu dài do refresh token đảm nhiệm.
   */
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().max(1440).default(15),

  /** Hạn refresh token. Thu hồi được vì nó nằm trong database. */
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().max(365).default(30),

  /**
   * Hạn của link xác thực email.
   *
   * Dài hơn hẳn link đặt lại mật khẩu vì mức thiệt hại khác nhau: link xác thực
   * bị lộ chỉ giúp kẻ khác xác nhận hộ một địa chỉ, còn link đặt lại mật khẩu
   * bị lộ là mất tài khoản.
   */
  EMAIL_VERIFICATION_TTL_HOURS: z.coerce.number().int().positive().max(168).default(24),

  /** Hạn của link đặt lại mật khẩu. Ngắn có chủ đích — xem lý do ở trên. */
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().max(1440).default(60),

  /** Địa chỉ người gửi trên email hệ thống. */
  MAIL_FROM: emptyAsUndefined(z.string().min(1).optional()),

  ADMIN_EMAIL: emptyAsUndefined(z.email("ADMIN_EMAIL không hợp lệ").optional()),
  ADMIN_PASSWORD: emptyAsUndefined(
    z.string().min(8, "ADMIN_PASSWORD tối thiểu 8 ký tự").optional(),
  ),

  NEXT_PUBLIC_APP_URL: emptyAsUndefined(z.url().optional()),
});

export type Env = z.infer<typeof envSchema>;

/** Giá trị giả dùng cho bước build — không bao giờ chạm tới ở runtime. */
const buildTimePlaceholders = {
  DATABASE_URL: "postgresql://build:build@localhost:5432/build",
  SESSION_SECRET: "build-time-placeholder-secret-not-used-at-runtime",
} satisfies Partial<Record<keyof Env, string>>;

function loadEnv(): Env {
  const skipValidation = process.env.SKIP_ENV_VALIDATION === "1";

  const source = skipValidation ? { ...buildTimePlaceholders, ...process.env } : process.env;

  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Cấu hình môi trường không hợp lệ:\n${details}\n\n` +
        `Kiểm tra file .env của bạn (tham chiếu: .env.example).`,
    );
  }

  return parsed.data;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
