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
  DIRECT_DATABASE_URL: z.string().min(1).optional(),

  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET phải dài tối thiểu 32 ký tự (dùng: openssl rand -base64 48)"),

  SESSION_MAX_AGE_DAYS: z.coerce.number().int().positive().max(365).default(7),

  ADMIN_EMAIL: z.email("ADMIN_EMAIL không hợp lệ").optional(),
  ADMIN_PASSWORD: z.string().min(8, "ADMIN_PASSWORD tối thiểu 8 ký tự").optional(),

  NEXT_PUBLIC_APP_URL: z.url().optional(),
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
