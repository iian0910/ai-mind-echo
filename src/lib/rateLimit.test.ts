import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/lib/rateLimit";

describe("createRateLimiter", () => {
  it("達到上限後回傳等待秒數，視窗結束後解除", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(limiter.retryAfter("a@x.com", t0)).toBe(0);
      limiter.hit("a@x.com", t0);
    }
    expect(limiter.retryAfter("a@x.com", t0 + 1_000)).toBe(59);
    expect(limiter.retryAfter("a@x.com", t0 + 60_000)).toBe(0);
  });

  it("不同的 key 各自計算，reset 會清除紀錄", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    limiter.hit("a@x.com");
    expect(limiter.retryAfter("a@x.com")).toBeGreaterThan(0);
    expect(limiter.retryAfter("b@x.com")).toBe(0);
    limiter.reset("a@x.com");
    expect(limiter.retryAfter("a@x.com")).toBe(0);
  });
});
