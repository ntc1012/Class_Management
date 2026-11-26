import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initialize, one, query } from "../src/lib/db";
import { setupOwner } from "../src/lib/setup";
import { verifyPassword } from "../src/lib/security";
Object.assign(process.env, {
  NODE_ENV: "test",
  SQLITE_PATH: `./data/setup-test-${randomUUID()}.sqlite`,
});
delete process.env.DATABASE_URL;
const secret = "test-setup-secret-" + randomUUID();
const input = {
  token: secret,
  center_name: "Test center",
  name: "Test admin",
  email: "ADMIN@example.test",
  password: "SetupPassword!2026",
  confirm_password: "SetupPassword!2026",
};
describe("First owner setup", { concurrency: false }, () => {
  before(initialize);
  it("requires a configured setup secret and never creates users with a wrong token", async () => {
    delete process.env.ADMIN_SETUP_TOKEN;
    await assert.rejects(setupOwner(input), /Chưa bật thiết lập/);
    process.env.ADMIN_SETUP_TOKEN = secret;
    await assert.rejects(
      setupOwner({ ...input, token: "wrong-token-".repeat(4) }),
      /Mã thiết lập/,
    );
    assert.equal(Number((await one("SELECT COUNT(*) n FROM users")).n), 0);
  });
  it("validates password confirmation before creating an account", async () => {
    await assert.rejects(
      setupOwner({ ...input, confirm_password: "DifferentPassword!" }),
      /không khớp/,
    );
    await assert.rejects(
      setupOwner({ ...input, password: "short", confirm_password: "short" }),
    );
    assert.equal(Number((await one("SELECT COUNT(*) n FROM centers")).n), 0);
  });
  it("creates exactly one owner even for concurrent requests and stores only a hash", async () => {
    const results = await Promise.allSettled([
      setupOwner(input),
      setupOwner(input),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.filter((r) => r.status === "rejected").length, 1);
    const user = await one("SELECT * FROM users WHERE role='owner'");
    assert.equal(user.email, "admin@example.test");
    assert.notEqual(user.password_hash, input.password);
    assert.ok(verifyPassword(input.password, user.password_hash));
    assert.equal(Number((await one("SELECT COUNT(*) n FROM centers")).n), 1);
    assert.equal(
      Number(
        (
          await one(
            "SELECT COUNT(*) n FROM audit_logs WHERE action='owner.setup'",
          )
        ).n,
      ),
      1,
    );
    const state = await one(
      "SELECT * FROM app_bootstrap WHERE id='first-owner'",
    );
    assert.ok(state.completed_at);
  });
  it("stays closed after the initial owner is removed", async () => {
    await query("DELETE FROM users WHERE role='owner'");
    await assert.rejects(
      setupOwner({ ...input, email: "another@example.test" }),
      /đã khóa/,
    );
  });
});
