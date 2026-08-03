import { afterEach, describe, expect, it } from "vitest";
import { __clearRateLimits, rateLimit, resetRateLimit } from "./rate-limit";

afterEach(() => {
  __clearRateLimits();
});

describe("rateLimit", () => {
  it("cho qua đúng bằng số lần cho phép rồi mới chặn", () => {
    const options = { limit: 3, windowSeconds: 60 };

    expect(rateLimit("ip-1", options).success).toBe(true);
    expect(rateLimit("ip-1", options).success).toBe(true);
    expect(rateLimit("ip-1", options).success).toBe(true);
    expect(rateLimit("ip-1", options).success).toBe(false);
  });

  it("đếm riêng cho từng key", () => {
    const options = { limit: 1, windowSeconds: 60 };

    expect(rateLimit("ip-1", options).success).toBe(true);
    expect(rateLimit("ip-2", options).success).toBe(true);
    expect(rateLimit("ip-1", options).success).toBe(false);
  });

  it("báo số lần còn lại", () => {
    const options = { limit: 2, windowSeconds: 60 };

    expect(rateLimit("ip-1", options).remaining).toBe(1);
    expect(rateLimit("ip-1", options).remaining).toBe(0);
  });

  it("reset xoá sạch bộ đếm", () => {
    const options = { limit: 1, windowSeconds: 60 };

    rateLimit("ip-1", options);
    expect(rateLimit("ip-1", options).success).toBe(false);

    resetRateLimit("ip-1");
    expect(rateLimit("ip-1", options).success).toBe(true);
  });

  it("luôn trả retryAfterSeconds ít nhất là 1", () => {
    expect(rateLimit("ip-1", { limit: 1, windowSeconds: 1 }).retryAfterSeconds).toBeGreaterThan(0);
  });
});
