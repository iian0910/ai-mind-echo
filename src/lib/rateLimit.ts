/**
 * 簡易固定視窗限流（存在單一伺服器實例的記憶體中）
 * 用於登入失敗次數限制；多實例部署時需改用 Redis 等共用儲存。
 */
import "server-only";

type Bucket = { count: number; resetAt: number };

export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const buckets = new Map<string, Bucket>();

  function active(key: string, now: number): Bucket | undefined {
    const bucket = buckets.get(key);
    if (bucket && bucket.resetAt <= now) {
      buckets.delete(key);
      return undefined;
    }
    return bucket;
  }

  return {
    /** 已達上限時回傳需等待的秒數，否則回傳 0 */
    retryAfter(key: string, now = Date.now()): number {
      const bucket = active(key, now);
      return bucket && bucket.count >= limit ? Math.ceil((bucket.resetAt - now) / 1000) : 0;
    },
    hit(key: string, now = Date.now()): void {
      const bucket = active(key, now);
      if (bucket) bucket.count += 1;
      else buckets.set(key, { count: 1, resetAt: now + windowMs });
    },
    reset(key: string): void {
      buckets.delete(key);
    },
  };
}
