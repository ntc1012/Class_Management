import { randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { digest, hashPassword } from "./security";
import { initialize, query, one, lock, transaction, now } from "./db";
import { audit } from "./service";
import { AppError, type Actor } from "./types";

const setupInput = z
  .object({
    token: z.string().min(32).max(256),
    center_name: z.string().trim().min(2).max(120),
    name: z.string().trim().min(2).max(120),
    email: z
      .string()
      .trim()
      .email()
      .max(200)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(12).max(128),
    confirm_password: z.string().max(128),
  })
  .refine((v) => v.password === v.confirm_password, {
    message: "Mật khẩu xác nhận không khớp.",
    path: ["confirm_password"],
  });

export async function setupOwner(input: unknown) {
  const configured = process.env.ADMIN_SETUP_TOKEN;
  if (!configured || configured.length < 32 || configured.length > 256)
    throw new AppError(
      "Chưa bật thiết lập admin. Thêm ADMIN_SETUP_TOKEN (từ 32 ký tự) trong Vercel rồi redeploy.",
      503,
    );
  const d = setupInput.parse(input);
  if (
    !timingSafeEqual(
      Buffer.from(digest(d.token), "hex"),
      Buffer.from(digest(configured), "hex"),
    )
  )
    throw new AppError("Mã thiết lập không hợp lệ.", 403);
  await initialize();
  return transaction(async () => {
    await query(
      "INSERT INTO app_bootstrap(id,completed_at) VALUES('first-owner',NULL) ON CONFLICT(id) DO NOTHING",
    );
    const state = await lock(
      "SELECT * FROM app_bootstrap WHERE id='first-owner'",
      [],
    );
    if (
      state.completed_at ||
      (await one("SELECT id FROM users WHERE role='owner' LIMIT 1"))
    )
      throw new AppError(
        "Admin đã được tạo. Trang thiết lập đã khóa; hãy quay lại đăng nhập.",
        409,
      );
    if (await one("SELECT id FROM users WHERE email=?", [d.email]))
      throw new AppError("Email này đã được sử dụng.");
    const centerId = randomUUID(),
      userId = randomUUID(),
      stamp = now();
    await query("INSERT INTO centers(id,name,created_at) VALUES(?,?,?)", [
      centerId,
      d.center_name,
      stamp,
    ]);
    await query(
      "INSERT INTO users(id,center_id,name,email,role,password_hash,created_at) VALUES(?,?,?,?,?,?,?)",
      [
        userId,
        centerId,
        d.name,
        d.email,
        "owner",
        hashPassword(d.password),
        stamp,
      ],
    );
    await query(
      "UPDATE app_bootstrap SET completed_at=? WHERE id='first-owner'",
      [stamp],
    );
    const actor: Actor = {
      id: userId,
      center_id: centerId,
      name: d.name,
      email: d.email,
      role: "owner",
    };
    await audit(actor, "owner.setup", "user", userId);
    return { ok: true };
  });
}
