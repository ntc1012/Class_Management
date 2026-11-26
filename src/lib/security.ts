import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { cookies } from "next/headers";
import { one, query, transaction, now, lock } from "./db";
import { AppError, type Actor } from "./types";
import { isTrustedOrigin } from "./origin";
import { accountFromRequest } from "./account-context";
import {
  LEGACY_SESSION_COOKIE,
  accountCookieName,
  resolveSession,
  issueSession,
  revokeSession,
  tokenDigest,
} from "./session-store";

export const digest = tokenDigest;
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, stored: string) {
  try {
    const [salt, hash] = stored.split(":");
    const actual = scryptSync(password, salt, 64),
      expected = Buffer.from(hash, "hex");
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}
export async function actor(accountId?: string): Promise<Actor> {
  const jar = await cookies(),
    selected = await resolveSession((name) => jar.get(name)?.value, accountId);
  if (!selected) throw new AppError("Vui lòng đăng nhập.", 401);
  return selected.actor;
}
function cookieOptions(expiresAt: string) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: new Date(expiresAt),
  };
}
export async function requestActor(request: Request): Promise<Actor> {
  const accountId = accountFromRequest(request),
    jar = await cookies(),
    selected = await resolveSession((name) => jar.get(name)?.value, accountId);
  if (!selected)
    throw new AppError(
      "Phiên đăng nhập của tài khoản trong tab này đã hết hạn.",
      401,
    );
  if (selected.fromLegacy)
    jar.set(
      accountCookieName(accountId),
      selected.token,
      cookieOptions(selected.expiresAt),
    );
  return selected.actor;
}
export async function login(email: string, password: string) {
  const key = `login:${email.toLowerCase()}`;
  await transaction(async () => {
    await query(
      "INSERT INTO auth_limits(key,attempts,window_start) VALUES(?,0,?) ON CONFLICT(key) DO NOTHING",
      [key, now()],
    );
    const limit = await lock("SELECT * FROM auth_limits WHERE key=?", [key]);
    if (
      Date.now() - new Date(limit.window_start).getTime() < 15 * 60_000 &&
      limit.attempts >= 8
    )
      throw new AppError("Đăng nhập sai nhiều lần. Thử lại sau 15 phút.", 429);
    if (Date.now() - new Date(limit.window_start).getTime() >= 15 * 60_000)
      await query(
        "UPDATE auth_limits SET attempts=0,window_start=? WHERE key=?",
        [now(), key],
      );
    await query("UPDATE auth_limits SET attempts=attempts+1 WHERE key=?", [
      key,
    ]);
  });
  const user = await one("SELECT * FROM users WHERE email=? AND active=1", [
    email.toLowerCase(),
  ]);
  const valid = verifyPassword(
    password,
    user?.password_hash ||
      "00000000000000000000000000000000:" + "0".repeat(128),
  );
  if (!user || !valid)
    throw new AppError("Tài khoản hoặc mật khẩu không đúng.", 401);
  await query("DELETE FROM auth_limits WHERE key=?", [key]);
  await startSession(user.id);
  return { accountId: user.id };
}
export async function startSession(userId: string) {
  const jar = await cookies(),
    read = (name: string) => jar.get(name)?.value;
  const previous = await resolveSession(read);
  if (previous) {
    const bound = await resolveSession(read, previous.userId);
    if (bound?.fromLegacy)
      jar.set(
        accountCookieName(bound.userId),
        bound.token,
        cookieOptions(bound.expiresAt),
      );
  }
  const session = await issueSession(userId);
  jar.set(
    accountCookieName(userId),
    session.token,
    cookieOptions(session.expiresAt),
  );
  jar.set(
    LEGACY_SESSION_COOKIE,
    session.token,
    cookieOptions(session.expiresAt),
  );
}
export async function logout(accountId: string) {
  const jar = await cookies(),
    selected = await revokeSession((name) => jar.get(name)?.value, accountId);
  jar.delete(accountCookieName(accountId));
  if (selected && jar.get(LEGACY_SESSION_COOKIE)?.value === selected.token)
    jar.delete(LEGACY_SESSION_COOKIE);
}
export async function activation(userId: string) {
  const code = randomBytes(16).toString("hex");
  await query("DELETE FROM activations WHERE user_id=? AND used_at IS NULL", [
    userId,
  ]);
  await query(
    "INSERT INTO activations(token_hash,user_id,expires_at) VALUES(?,?,?)",
    [digest(code), userId, new Date(Date.now() + 48 * 3600_000).toISOString()],
  );
  return code;
}
export async function activate(code: string, password: string) {
  await transaction(async () => {
    const token = await lock(
      "SELECT * FROM activations WHERE token_hash=? AND used_at IS NULL AND expires_at>?",
      [digest(code), now()],
    );
    if (!token)
      throw new AppError("Mã kích hoạt không hợp lệ hoặc đã hết hạn.");
    await query("UPDATE users SET password_hash=? WHERE id=?", [
      hashPassword(password),
      token.user_id,
    ]);
    await query("UPDATE activations SET used_at=? WHERE token_hash=?", [
      now(),
      digest(code),
    ]);
    await query("DELETE FROM auth_sessions WHERE user_id=?", [token.user_id]);
  });
}
function encryptionKey() {
  if (!/^[a-f0-9]{64}$/i.test(process.env.ENCRYPTION_KEY || ""))
    throw new AppError(
      "Cần cấu hình ENCRYPTION_KEY để lưu thông tin kết nối thanh toán.",
    );
  return Buffer.from(process.env.ENCRYPTION_KEY!, "hex");
}
export function encrypt(value: unknown) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), data]
    .map((x) => x.toString("base64"))
    .join(".");
}
export function decrypt(value: string) {
  const [iv, tag, data] = value.split(".").map((x) => Buffer.from(x, "base64"));
  const cipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8"),
  );
}
export function checkOrigin(request: Request) {
  if (!isTrustedOrigin(request))
    throw new AppError("Nguồn yêu cầu không hợp lệ.", 403);
}
