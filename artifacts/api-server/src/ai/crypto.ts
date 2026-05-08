import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCM,
  type DecipherGCM,
} from "node:crypto";

const ALGO = "aes-256-gcm";
const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("APP_ENCRYPTION_KEY env var is required (32 bytes base64).");
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== KEY_LEN) {
    throw new Error(
      `APP_ENCRYPTION_KEY must decode to ${KEY_LEN} bytes (got ${buf.length}).`,
    );
  }
  return buf;
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv) as CipherGCM;
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt(stored: string): string {
  const key = getKey();
  const buf = Buffer.from(stored, "base64");
  if (buf.length < IV_LEN + TAG_LEN) {
    throw new Error("Ciphertext too short.");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv) as DecipherGCM;
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}

export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return `••••${key.slice(-2)}`;
  return `${key.slice(0, 3)}••••${key.slice(-4)}`;
}
