/**
 * Rate limiter cửa sổ cố định, lưu trong bộ nhớ tiến trình.
 *
 * GIỚI HẠN CẦN BIẾT: state nằm trong RAM của một instance. Khi chạy nhiều
 * replica (hoặc serverless), mỗi instance đếm riêng nên giới hạn thực tế bị
 * nhân lên theo số instance. Đủ tốt để chặn brute-force đăng nhập ở quy mô 1
 * container; khi scale ngang thì thay `hit()` bằng Redis INCR + EXPIRE mà
 * không phải đụng tới nơi gọi.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Dọn bucket hết hạn để Map không phình vô hạn theo số IP đã từng gọi. */
function evictExpired(now: number) {
  if (buckets.size < 10_000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  success: boolean;
  remaining: number;
  /** Số giây còn lại tới khi cửa sổ reset. */
  retryAfterSeconds: number;
};

export function rateLimit(
  key: string,
  options: { limit: number; windowSeconds: number },
): RateLimitResult {
  const now = Date.now();
  const windowMs = options.windowSeconds * 1000;

  evictExpired(now);

  const existing = buckets.get(key);
  const bucket =
    existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowMs };

  bucket.count += 1;
  buckets.set(key, bucket);

  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

  return {
    success: bucket.count <= options.limit,
    remaining: Math.max(0, options.limit - bucket.count),
    retryAfterSeconds,
  };
}

/** Xoá giới hạn của một key — gọi sau khi đăng nhập thành công. */
export function resetRateLimit(key: string) {
  buckets.delete(key);
}

/** Chỉ dùng trong test. */
export function __clearRateLimits() {
  buckets.clear();
}
