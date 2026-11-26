import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { cookies } from "next/headers";
import { one, query, transaction, now, lock } from "./db";
import { AppError, type Actor } from "./types";

export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
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
export async function actor(): Promise<Actor> {
  const token = (await cookies()).get("classflow_session")?.value;
  const user =
    token &&
    (await one(
      `SELECT u.id,u.center_id,u.role,u.name,u.email FROM users u JOIN auth_sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1`,
      [digest(token), now()],
    ));
  if (!user) throw new AppError("Vui lòng đăng nhập.", 401);
  return user as Actor;
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
}
export async function startSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  await query(
    "INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
    [digest(token), userId, new Date(Date.now() + 7 * 86400_000).toISOString()],
  );
  (await cookies()).set("classflow_session", token, {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === "production" &&
      !process.env.ALLOW_LOCAL_PRODUCTION,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 86400,
  });
}
export async function logout() {
  const cookie = (await cookies()).get("classflow_session");
  if (cookie)
    await query("DELETE FROM auth_sessions WHERE token_hash=?", [
      digest(cookie.value),
    ]);
  (await cookies()).delete("classflow_session");
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
  const origin = request.headers.get("origin");
  const allowed = process.env.APP_URL
    ? new URL(process.env.APP_URL).origin
    : `${new URL(request.url).protocol}//${request.headers.get("host") || new URL(request.url).host}`;
  if (!origin || origin !== allowed)
    throw new AppError("Nguồn yêu cầu không hợp lệ.", 403);
}
