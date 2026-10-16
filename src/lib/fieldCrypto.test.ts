import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptField, encryptField, isEncrypted } from "@/lib/fieldCrypto";

const key = randomBytes(32);
const userId = "6650a1b2c3d4e5f601234567";

describe("fieldCrypto", () => {
  it("加密後可還原，且密文不含原文", () => {
    const plain = "今天又被王經理罵了，陳志明也不幫我";
    const cipher = encryptField(plain, userId, key);
    expect(isEncrypted(cipher)).toBe(true);
    expect(cipher).not.toContain("王經理");
    expect(decryptField(cipher, userId, key)).toBe(plain);
  });

  it("同一段文字每次加密結果不同（隨機 IV）", () => {
    expect(encryptField("同樣的內容", userId, key)).not.toBe(encryptField("同樣的內容", userId, key));
  });

  it("空字串也能加解密", () => {
    expect(decryptField(encryptField("", userId, key), userId, key)).toBe("");
  });

  it("換成其他使用者的 userId 無法解密", () => {
    const cipher = encryptField("私密內容", userId, key);
    expect(() => decryptField(cipher, "6650a1b2c3d4e5f601234568", key)).toThrow();
  });

  it("金鑰錯誤或密文被竄改時解密失敗", () => {
    const cipher = encryptField("私密內容", userId, key);
    expect(() => decryptField(cipher, userId, randomBytes(32))).toThrow();
    const tampered = cipher.slice(0, -4) + (cipher.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(() => decryptField(tampered, userId, key)).toThrow();
  });

  it("加密上線前的舊明文原樣回傳", () => {
    expect(decryptField("舊的明文日記", userId, key)).toBe("舊的明文日記");
  });
});
