import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Stored as scrypt$<salt hex>$<hash hex>. Same format as the one-liner in supabase/schema.sql. */
export function hashToken(token: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(token, salt, 32).toString("hex")}`;
}

export function verifyToken(token: string, stored: string) {
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  return safeEqual(scryptSync(token, salt, 32).toString("hex"), hash);
}
