import { before, after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initialize, query, now, closeDatabase } from "../src/lib/db";
import {
  accountCookieName,
  issueSession,
  resolveSession,
  revokeSession,
  LEGACY_SESSION_COOKIE,
  tokenDigest,
} from "../src/lib/session-store";
import {
  ACCOUNT_HEADER,
  accountFromRequest,
  accountApiUrl,
  accountFetch,
} from "../src/lib/account-context";

Object.assign(process.env, {
  NODE_ENV: "test",
  SQLITE_PATH: `./data/account-session-${randomUUID()}.sqlite`,
});
delete process.env.DATABASE_URL;

describe(
  "Account sessions remain independent across tabs",
  { concurrency: false },
  () => {
    let a: Awaited<ReturnType<typeof issueSession>>,
      b: Awaited<ReturnType<typeof issueSession>>;
    const cookies = new Map<string, string>();
    const read = (key: string) => cookies.get(key);
    before(async () => {
      await initialize();
      await query("INSERT INTO centers(id,name,created_at) VALUES(?,?,?)", [
        "session-center",
        "Session test",
        now(),
      ]);
      for (const [id, role] of [
        ["account-a", "owner"],
        ["account-b", "teacher"],
      ])
        await query(
          "INSERT INTO users(id,center_id,name,email,role,created_at) VALUES(?,?,?,?,?,?)",
          [id, "session-center", id, `${id}@test.invalid`, role, now()],
        );
      a = await issueSession("account-a");
      b = await issueSession("account-b");
      cookies.set(accountCookieName(a.userId), a.token);
      cookies.set(accountCookieName(b.userId), b.token);
      cookies.set(LEGACY_SESSION_COOKIE, b.token);
    });
    after(async () => {
      await closeDatabase();
    });
    it("keeps account A selected after account B logs in", async () => {
      assert.equal(
        (await resolveSession(read, "account-a"))?.actor.id,
        "account-a",
      );
      assert.equal(
        (await resolveSession(read, "account-b"))?.actor.id,
        "account-b",
      );
      assert.equal((await resolveSession(read))?.actor.id, "account-b");
    });
    it("does not authenticate A with a cookie belonging to B", async () => {
      assert.equal(
        await resolveSession(
          (key) =>
            key === accountCookieName("account-a") ? b.token : read(key),
          "account-a",
        ),
        undefined,
      );
    });
    it("accepts a legacy cookie only for its matching account", async () => {
      const legacyOnly = (key: string) =>
        key === LEGACY_SESSION_COOKIE ? a.token : undefined;
      assert.equal(
        (await resolveSession(legacyOnly, "account-a"))?.fromLegacy,
        true,
      );
      assert.equal(await resolveSession(legacyOnly, "account-b"), undefined);
    });
    it("rejects expired and disabled sessions", async () => {
      const expired = await issueSession("account-a");
      await query("UPDATE auth_sessions SET expires_at=? WHERE token_hash=?", [
        "2000-01-01T00:00:00.000Z",
        tokenDigest(expired.token),
      ]);
      assert.equal(
        await resolveSession(() => expired.token, "account-a"),
        undefined,
      );
      await query("UPDATE users SET active=0 WHERE id=?", ["account-a"]);
      assert.equal(await resolveSession(read, "account-a"), undefined);
      await query("UPDATE users SET active=1 WHERE id=?", ["account-a"]);
    });
    it("logs out A without logging out B", async () => {
      await revokeSession(read, "account-a");
      assert.equal(await resolveSession(read, "account-a"), undefined);
      assert.equal(
        (await resolveSession(read, "account-b"))?.actor.id,
        "account-b",
      );
    });
  },
);

describe("Every protected request carries an explicit account", () => {
  it("accepts a header or a download query parameter", () => {
    assert.equal(
      accountFromRequest(
        new Request("https://test.invalid/api/data", {
          headers: { [ACCOUNT_HEADER]: "account-a" },
        }),
      ),
      "account-a",
    );
    assert.equal(
      accountFromRequest(
        new Request("https://test.invalid/api/files/f?account=account-b"),
      ),
      "account-b",
    );
  });
  it("rejects missing, conflicting, or duplicate account hints", () => {
    for (const request of [
      new Request("https://test.invalid/api/data"),
      new Request("https://test.invalid/api/data?account=a", {
        headers: { [ACCOUNT_HEADER]: "b" },
      }),
      new Request("https://test.invalid/api/data?account=a&account=b"),
    ])
      assert.throws(() => accountFromRequest(request));
  });
  it("preserves export options while attaching the account", () => {
    assert.equal(
      accountApiUrl("/api/export?type=students", "account-a"),
      "/api/export?type=students&account=account-a",
    );
    assert.throws(() =>
      accountApiUrl("https://external.invalid/api/data", "account-a"),
    );
  });
  it("sends independent account headers for parallel tab requests", async () => {
    const original = globalThis.fetch,
      seen: string[] = [];
    globalThis.fetch = async (_input, init) => {
      seen.push(new Headers(init?.headers).get(ACCOUNT_HEADER)!);
      assert.equal(init?.credentials, "same-origin");
      assert.equal(init?.cache, "no-store");
      return new Response("{}");
    };
    try {
      await Promise.all([
        accountFetch("account-a", "/api/data"),
        accountFetch("account-b", "/api/actions", { method: "POST" }),
      ]);
      assert.deepEqual(seen, ["account-a", "account-b"]);
    } finally {
      globalThis.fetch = original;
    }
  });
});
