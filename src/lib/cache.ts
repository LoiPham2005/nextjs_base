import type { createClient } from "redis";
import { env } from "./env";
import { logger } from "./logger";

/**
 * Cache khoá–giá trị có TTL, store cắm được.
 *
 * ---
 * DÙNG KHI NÀO
 *
 * Cho truy vấn ĐẮT mà dữ liệu ĐỔI CHẬM: bảng danh mục, cấu hình, kết quả tổng
 * hợp báo cáo, phản hồi từ API bên thứ ba.
 *
 * KHÔNG dùng cho dữ liệu người dùng vừa sửa xong — họ sẽ thấy giá trị cũ và
 * nghĩ là hệ thống hỏng. Với loại đó, hoặc đừng cache, hoặc xoá khoá ngay
 * trong chính thao tác ghi.
 *
 * ---
 * VÌ SAO KHÔNG DÙNG CHO CACHE PHÂN QUYỀN
 *
 * `permissionService` giữ cache RIÊNG trong RAM, và cố ý không chuyển sang
 * đây. Lý do: nó được đọc ở gần như MỌI request, nên đi qua Redis là thêm một
 * vòng mạng vào đường đi nóng — chậm hơn hẳn bản in-process. Đánh đổi của nó
 * (TTL 60 giây, mỗi replica một bản) đã được ghi rõ trong file đó.
 *
 * Cache ở đây phục vụ thứ khác: truy vấn nặng mà không phải request nào cũng
 * chạm tới.
 *
 * ---
 * QUY TẮC AN TOÀN
 *
 * Store hỏng thì coi như CACHE MISS, không bao giờ ném lỗi lên trên. Redis
 * chết không được phép làm sập trang — cùng nguyên tắc với `rate-limit.ts`.
 */

/**
 * Chỉ import KIỂU của client Redis. `import type` bị xoá lúc biên dịch, nên
 * thư viện chỉ được nạp qua `await import()` bên dưới khi thật sự có Redis.
 */
type RedisClient = ReturnType<typeof createClient>;

/** Tiền tố riêng, để không giẫm lên khoá của rate limit (`rl:`). */
const PREFIX = "cache:";

type CacheStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  clear(): Promise<void>;
};

// ---------------------------------------------------------------------------
// Store trong RAM — mặc định khi không có REDIS_URL
// ---------------------------------------------------------------------------

function createMemoryStore(): CacheStore {
  const entries = new Map<string, { value: string; expiresAt: number }>();

  /**
   * Dọn khoá hết hạn khi Map phình to.
   *
   * Bản RAM không có cơ chế hết hạn tự động như Redis, nên nếu chỉ kiểm tra
   * lúc đọc thì khoá không ai đọc lại sẽ nằm mãi trong bộ nhớ.
   */
  function evictExpired(now: number) {
    if (entries.size < 5_000) return;
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(key);
    }
  }

  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return Promise.resolve(null);

      if (entry.expiresAt <= Date.now()) {
        entries.delete(key);
        return Promise.resolve(null);
      }

      return Promise.resolve(entry.value);
    },

    set(key, value, ttlSeconds) {
      evictExpired(Date.now());
      entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
      return Promise.resolve();
    },

    del(key) {
      entries.delete(key);
      return Promise.resolve();
    },

    clear() {
      entries.clear();
      return Promise.resolve();
    },
  };
}

// ---------------------------------------------------------------------------
// Store trên Redis
// ---------------------------------------------------------------------------

function createRedisStore(url: string): CacheStore {
  let clientPromise: Promise<RedisClient> | null = null;

  async function getClient() {
    clientPromise ??= (async () => {
      const { createClient } = await import("redis");
      const client: RedisClient = createClient({ url });

      // node-redis phát sự kiện 'error' mỗi lần mất kết nối; không ai nghe thì
      // nó thành unhandled error và giết tiến trình.
      client.on("error", (error: unknown) => {
        logger.error("Cache: lỗi kết nối Redis", error);
      });

      await client.connect();
      logger.info("Cache: dùng Redis");
      return client;
    })();

    return clientPromise;
  }

  return {
    async get(key) {
      const client = await getClient();
      return client.get(`${PREFIX}${key}`);
    },

    async set(key, value, ttlSeconds) {
      const client = await getClient();
      // `EX` để Redis tự xoá khi hết hạn — không cần tiến trình dọn dẹp nào.
      await client.set(`${PREFIX}${key}`, value, { expiration: { type: "EX", value: ttlSeconds } });
    },

    async del(key) {
      const client = await getClient();
      await client.del(`${PREFIX}${key}`);
    },

    async clear() {
      const client = await getClient();
      // Dùng SCAN chứ KHÔNG dùng KEYS: `KEYS *` khoá cả Redis lại trong lúc
      // quét, và trên production với vài trăm nghìn khoá thì đó là một sự cố.
      for await (const keys of client.scanIterator({ MATCH: `${PREFIX}*`, COUNT: 100 })) {
        if (keys.length > 0) await client.del(keys);
      }
    },
  };
}

// ---------------------------------------------------------------------------

let store: CacheStore | null = null;

function getStore(): CacheStore {
  if (store) return store;

  store = env.REDIS_URL ? createRedisStore(env.REDIS_URL) : createMemoryStore();
  return store;
}

/**
 * Đọc giá trị đã cache. Trả `null` khi chưa có, đã hết hạn, hoặc store lỗi.
 *
 * Kiểu `T` là LỜI HỨA của người gọi, không phải điều được kiểm chứng — giá trị
 * đi qua JSON nên không còn kiểu. Cache một hình dạng rồi đổi hình dạng đó ở
 * bản deploy sau mà không đổi tên khoá thì giá trị cũ vẫn được trả về nguyên
 * hình dạng cũ. Đổi hình dạng thì đổi luôn tên khoá (`user:v2:...`).
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await getStore().get(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch (error) {
    // Bao gồm cả JSON hỏng: coi như miss và tính lại, chứ không ném lỗi ra
    // trang chỉ vì một khoá cache bị rác.
    logger.error("Cache: đọc thất bại, coi như miss", error, { key });
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    await getStore().set(key, JSON.stringify(value), ttlSeconds);
  } catch (error) {
    logger.error("Cache: ghi thất bại", error, { key });
  }
}

/** Xoá một khoá. Gọi ngay trong thao tác ghi làm dữ liệu đó cũ đi. */
export async function cacheDel(key: string): Promise<void> {
  try {
    await getStore().del(key);
  } catch (error) {
    logger.error("Cache: xoá thất bại", error, { key });
  }
}

/**
 * Đọc từ cache, thiếu thì tính rồi ghi lại. Đây là API nên dùng trong 90%
 * trường hợp.
 *
 * @example
 * const stats = await cached("dashboard:stats", 300, () =>
 *   reportService.buildDashboard(),
 * );
 *
 * ⚠️ KHÔNG chống được "cache stampede": nếu 100 request cùng đến lúc khoá vừa
 * hết hạn, cả 100 đều tính lại. Chấp nhận vì việc chống nó cần khoá phân tán —
 * phức tạp hơn nhiều so với lợi ích ở quy mô thông thường. Nếu truy vấn của
 * bạn nặng tới mức không chịu được điều đó, hãy tính sẵn bằng job nền
 * (`worker/`) rồi chỉ đọc kết quả ra.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;

  const value = await compute();

  // Không cache `undefined`: JSON.stringify(undefined) cho ra `undefined` chứ
  // không phải chuỗi, ghi vào là hỏng khoá.
  if (value !== undefined) await cacheSet(key, value, ttlSeconds);

  return value;
}

/** Chỉ dùng trong test. */
export async function __clearCache(): Promise<void> {
  await getStore().clear();
}
