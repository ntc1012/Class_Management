import { createHash, randomBytes } from "node:crypto";
import { one, query, now } from "./db";
import { validAccountId } from "./account-context";
import { AppError, type Actor } from "./types";
export const LEGACY_SESSION_COOKIE = "classflow_session";
export const tokenDigest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function accountCookieName(id: string) {
  if (!validAccountId(id)) throw new AppError("Tài khoản không hợp lệ.", 401);
  return `classflow_account_${id}`;
}
type Reader = (name: string) => string | undefined;
export type AccountSession = {
  token: string;
  userId: string;
  expiresAt: string;
  actor: Actor;
  fromLegacy: boolean;
};
async function lookup(
  token: string | undefined,
  expected?: string,
): Promise<AccountSession | undefined> {
  if (!token) return;
  const row = await one(
    "SELECT u.id,u.center_id,u.role,u.name,u.email,s.expires_at FROM users u JOIN auth_sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1",
    [tokenDigest(token), now()],
  );
  if (!row || (expected && row.id !== expected)) return;
  const actor: Actor = {
    id: row.id,
    center_id: row.center_id,
    role: row.role,
    name: row.name,
    email: row.email,
  };
  return {
    token,
    userId: row.id,
    expiresAt: row.expires_at,
    actor,
    fromLegacy: false,
  };
}
export async function resolveSession(read: Reader, expected?: string) {
  if (expected) {
    const selected = await lookup(read(accountCookieName(expected)), expected);
    if (selected) return selected;
  }
  const legacy = await lookup(read(LEGACY_SESSION_COOKIE), expected);
  return legacy ? { ...legacy, fromLegacy: true } : undefined;
}
export async function issueSession(userId: string) {
  const token = randomBytes(32).toString("hex"),
    expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
  await query(
    "INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
    [tokenDigest(token), userId, expiresAt],
  );
  return { token, userId, expiresAt };
}
export async function revokeSession(read: Reader, accountId: string) {
  const selected = await resolveSession(read, accountId);
  if (selected)
    await query("DELETE FROM auth_sessions WHERE token_hash=?", [
      tokenDigest(selected.token),
    ]);
  return selected;
}
