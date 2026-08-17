import type { createClient } from "redis";
import { env } from "./env";
import { logger } from "./logger";

/**
 * Chỉ import KIỂU của client Redis, không import giá trị.
 *
 * `import type` bị xoá sạch khi biên dịch, nên thư viện `redis` vẫn chỉ được
 * nạp lúc chạy qua `await import()` bên dưới — máy không cấu hình Redis thì nó
 * không bao giờ vào bộ nhớ.
 */
type RedisClient = ReturnType<typeof createClient>;

/**
 * Rate limiter cửa sổ cố định, có store cắm được.
 *
 * ---
 * VÌ SAO CẦN REDIS
 *
 * Bản trước đếm trong RAM của tiến trình. Điều đó đủ cho đúng một container,
 * nhưng hỏng theo hai cách khi lên thật:
 *
 *   - Chạy 2 replica → mỗi replica đếm riêng → ngưỡng thực tế nhân đôi. Kẻ dò
 *     mật khẩu chỉ cần bắn qua load balancer là được gấp N lần số lần thử.
 *   - Deploy hoặc restart → bộ đếm về 0. Đúng lúc bị dò, việc restart lại là
 *     món quà cho phía tấn công.
 *
 * ---
 * VÌ SAO VẪN GIỮ BẢN RAM
 *
 * Không phải dự án nào cũng có Redis, và bắt buộc phải có Redis mới chạy được
 * `pnpm dev` là một rào cản vô nghĩa. Nên: có `REDIS_URL` thì dùng Redis, không
 * có thì dùng RAM và ghi log cảnh báo một lần.
 *
 * ---
 * VÌ SAO HÀM TRỞ THÀNH ASYNC
 *
 * Redis là I/O. Giữ chữ ký đồng bộ đồng nghĩa với việc không bao giờ cắm được
 * Redis vào. Mọi nơi gọi đều đã nằm trong hàm async sẵn, nên cái giá chỉ là
 * thêm một từ khoá `await`.
 */
export type RateLimitOptions = { limit: number; windowSeconds: number };

/**
 * Ngưỡng cho từng loại thao tác, khai báo một lần duy nhất.
 *
 * Web và mobile là hai cửa vào khác nhau nhưng phải chịu chung một chính
 * sách. Trước đây các con số này nằm rải rác ở cả Server Action lẫn route
 * handler, nên siết ngưỡng đăng nhập mà quên một chỗ là cửa còn lại vẫn mở.
 */
export const RATE_LIMITS = {
  login: { limit: 5, windowSeconds: 300 },
  register: { limit: 5, windowSeconds: 3600 },
  refresh: { limit: 30, windowSeconds: 300 },

  /**
   * Gửi email: siết chặt hơn hẳn các endpoint khác.
   *
   * Không phải để chống dò mật khẩu, mà để không bị biến thành công cụ dội thư
   * rác — mỗi lần gọi là một email gửi tới địa chỉ do người gọi chỉ định. Chi
   * phí nằm ở hộp thư người khác và ở uy tín tên miền gửi của bạn.
   */
  passwordResetRequest: { limit: 3, windowSeconds: 900 },
  emailVerificationRequest: { limit: 3, windowSeconds: 900 },

  /**
   * Đổi/đặt lại mật khẩu bằng token.
   *
   * Token là 256 bit ngẫu nhiên nên không dò được, nhưng mỗi lần gọi đều tốn
   * một phép băm Argon2id — vốn cố tình ngốn bộ nhớ. Không giới hạn thì chính
   * endpoint này là đường tấn công từ chối dịch vụ rẻ nhất của hệ thống.
   */
  passwordChange: { limit: 10, windowSeconds: 900 },
} as const satisfies Record<string, RateLimitOptions>;

export type RateLimitResult = {
  success: boolean;
  remaining: number;
  /** Số giây còn lại tới khi cửa sổ reset. */
  retryAfterSeconds: number;
};

/**
 * Hợp đồng của một store.
 *
 * `hit` trả về số lần đã dùng trong cửa sổ hiện tại và thời điểm cửa sổ reset.
 * Phần quyết định cho qua hay chặn nằm ngoài store — nhờ vậy chính sách chỉ
 * tồn tại ở một chỗ, dù đang chạy trên RAM hay trên Redis.
 */
type RateLimitStore = {
  hit(key: string, windowSeconds: number): Promise<{ count: number; resetAt: number }>;
  reset(key: string): Promise<void>;
  clear(): Promise<void>;
};

// ---------------------------------------------------------------------------
// Store trong RAM — mặc định khi không có REDIS_URL
// ---------------------------------------------------------------------------

type Bucket = { count: number; resetAt: number };

function createMemoryStore(): RateLimitStore {
  const buckets = new Map<string, Bucket>();

  /** Dọn bucket hết hạn để Map không phình vô hạn theo số IP đã từng gọi. */
  function evictExpired(now: number) {
    if (buckets.size < 10_000) return;
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }

  return {
    hit(key, windowSeconds) {
      const now = Date.now();
      evictExpired(now);

      const existing = buckets.get(key);
      const bucket =
        existing && existing.resetAt > now
          ? existing
          : { count: 0, resetAt: now + windowSeconds * 1000 };

      bucket.count += 1;
      buckets.set(key, bucket);

      return Promise.resolve({ count: bucket.count, resetAt: bucket.resetAt });
    },

    reset(key) {
      buckets.delete(key);
      return Promise.resolve();
    },

    clear() {
      buckets.clear();
      return Promise.resolve();
    },
  };
}

// ---------------------------------------------------------------------------
// Store trên Redis — dùng khi có REDIS_URL
// ---------------------------------------------------------------------------

const REDIS_PREFIX = "rl:";

function createRedisStore(url: string): RateLimitStore {
  // Nạp `redis` bằng import động: máy không cấu hình Redis thì thư viện không
  // bao giờ được kéo vào bộ nhớ, và bundle của Next cũng không phải mang nó.
  let clientPromise: Promise<RedisClient> | null = null;

  async function getClient() {
    clientPromise ??= (async () => {
      const { createClient } = await import("redis");
      const client: RedisClient = createClient({ url });

      // Không để lỗi kết nối thành unhandled error — node-redis phát 'error'
      // trên mọi lần mất kết nối, và một sự kiện không ai nghe sẽ giết tiến trình.
      client.on("error", (error: unknown) => {
        logger.error("Rate limit: lỗi kết nối Redis", error);
      });

      await client.connect();
      logger.info("Rate limit: dùng Redis", { url: redactUrl(url) });
      return client;
    })();

    return clientPromise;
  }

  return {
    async hit(key, windowSeconds) {
      const client = await getClient();
      const redisKey = `${REDIS_PREFIX}${key}`;

      /*
       * INCR rồi mới EXPIRE, và chỉ EXPIRE ở lần đầu tiên.
       *
       * Thứ tự này quan trọng: đặt lại TTL ở mỗi lần gọi sẽ biến cửa sổ cố
       * định thành cửa sổ trượt vô hạn — kẻ tấn công gõ đều tay thì khoá không
       * bao giờ hết hạn, kể cả sau khi họ đã dừng.
       *
       * Gộp vào một pipeline để chỉ đi một vòng mạng.
       */
      const replies: unknown[] = await client
        .multi()
        .incr(redisKey)
        .expire(redisKey, windowSeconds, "NX")
        .ttl(redisKey)
        .exec();

      const count = Number(replies[0]);
      const ttl = Number(replies[2]);

      // TTL âm nghĩa là khoá không có hạn (-1) hoặc vừa biến mất (-2). Cả hai
      // đều bất thường; coi như cửa sổ vừa mở để không chặn oan người dùng.
      const remainingSeconds = Number.isFinite(ttl) && ttl >= 0 ? ttl : windowSeconds;

      return { count, resetAt: Date.now() + remainingSeconds * 1000 };
    },

    async reset(key) {
      const client = await getClient();
      await client.del(`${REDIS_PREFIX}${key}`);
    },

    async clear() {
      const client = await getClient();
      // Chỉ xoá khoá của rate limit, không đụng tới phần còn lại của Redis —
      // instance này có thể đang được dùng chung với adapter của realtime.
      const keys = await client.keys(`${REDIS_PREFIX}*`);
      if (keys.length > 0) await client.del(keys);
    },
  };
}

/** Bỏ mật khẩu khỏi connection string trước khi đưa vào log. */
function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "***";
    return parsed.toString();
  } catch {
    return "(không đọc được)";
  }
}

// ---------------------------------------------------------------------------

let store: RateLimitStore | null = null;

function getStore(): RateLimitStore {
  if (store) return store;

  if (env.REDIS_URL) {
    store = createRedisStore(env.REDIS_URL);
  } else {
    store = createMemoryStore();
    logger.warn(
      "Rate limit chạy trong RAM (chưa set REDIS_URL). " +
        "Đủ cho một instance; từ instance thứ hai trở đi mỗi bản đếm riêng nên " +
        "ngưỡng thực tế bị nhân lên theo số instance.",
    );
  }

  return store;
}

export async function rateLimit(key: string, options: RateLimitOptions): Promise<RateLimitResult> {
  let hit: { count: number; resetAt: number };

  try {
    hit = await getStore().hit(key, options.windowSeconds);
  } catch (error) {
    /*
     * FAIL-OPEN, có chủ đích.
     *
     * Redis chết mà ta chặn hết mọi request thì một sự cố hạ tầng biến thành
     * sập dịch vụ toàn phần — đăng nhập, đăng ký, quên mật khẩu, tất cả đứng
     * im. Đổi lại là một cửa sổ không có rate limit, đúng bằng thời gian Redis
     * chết. Đánh đổi này CÓ THẬT: nếu hệ thống của bạn coi brute-force nguy
     * hiểm hơn downtime, hãy đổi chỗ này thành chặn.
     */
    logger.error("Rate limit: store lỗi, tạm cho qua", error, { key });
    return { success: true, remaining: options.limit, retryAfterSeconds: 0 };
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((hit.resetAt - Date.now()) / 1000));

  return {
    success: hit.count <= options.limit,
    remaining: Math.max(0, options.limit - hit.count),
    retryAfterSeconds,
  };
}

/** Xoá giới hạn của một key — gọi sau khi đăng nhập thành công. */
export async function resetRateLimit(key: string): Promise<void> {
  try {
    await getStore().reset(key);
  } catch (error) {
    // Không ném lên: người dùng vừa đăng nhập THÀNH CÔNG. Chặn họ chỉ vì dọn
    // bộ đếm thất bại là biến một thao tác nền thành lỗi nhìn thấy được.
    logger.error("Rate limit: không xoá được bộ đếm", error, { key });
  }
}

/** Chỉ dùng trong test. */
export async function __clearRateLimits(): Promise<void> {
  await getStore().clear();
}
