import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("hashPassword / verifyPassword", () => {
  it("正確密碼通過、錯誤密碼不通過", async () => {
    const stored = await hashPassword("secret123");
    expect(await verifyPassword("secret123", stored)).toBe(true);
    expect(await verifyPassword("secret124", stored)).toBe(false);
  });

  it("同一密碼每次雜湊結果不同（隨機 salt），且不含原文", async () => {
    const [a, b] = await Promise.all([hashPassword("secret123"), hashPassword("secret123")]);
    expect(a).not.toBe(b);
    expect(a).not.toContain("secret123");
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$/);
  });

  it("全形與半形視為相同密碼（NFKC 正規化）", async () => {
    const stored = await hashPassword("abc123");
    expect(await verifyPassword("ａｂｃ１２３", stored)).toBe(true);
  });

  it("格式錯誤的雜湊字串一律不通過", async () => {
    expect(await verifyPassword("secret123", "")).toBe(false);
    expect(await verifyPassword("secret123", "bcrypt$xx")).toBe(false);
  });
});
