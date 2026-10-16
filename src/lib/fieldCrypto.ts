/**
 * 日記欄位加密（AES-256-GCM）
 *
 *   encryptField(明文, userId) → "enc:v1:<base64(iv | tag | ciphertext)>"
 *   decryptField(密文, userId) → 明文
 *
 * - 金鑰來自環境變數 DIARY_ENCRYPTION_KEY（32 bytes，base64 編碼），遺失即無法解密所有日記。
 * - 以 userId 作為 AAD：密文被搬到其他使用者的文件上會解密失敗，無法跨帳號挪用。
 * - 沒有前綴的值視為加密功能上線前寫入的舊明文，原樣回傳，讀取不中斷。
 */
import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getEnv } from "@/lib/env";

const PREFIX = "enc:v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;

let cachedKey: Buffer | undefined;

function getKey(): Buffer {
  cachedKey ??= Buffer.from(getEnv().DIARY_ENCRYPTION_KEY, "base64");
  return cachedKey;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function encryptField(plain: string, userId: string, key: Buffer = getKey()): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(userId, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

export function decryptField(value: string, userId: string, key: Buffer = getKey()): string {
  if (!isEncrypted(value)) return value;
  const raw = Buffer.from(value.slice(PREFIX.length), "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, IV_BYTES));
  decipher.setAAD(Buffer.from(userId, "utf8"));
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([
    decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
    decipher.final(),
  ]).toString("utf8");
}
