import { it } from "node:test";
import assert from "node:assert/strict";
import { isTrustedOrigin } from "../src/lib/origin";
const env = {
  NODE_ENV: "production",
  APP_URL: "https://classmanagement-omega.vercel.app",
  VERCEL_URL: "classmanagement-deployment-team.vercel.app",
  VERCEL_BRANCH_URL: "classmanagement-git-main-team.vercel.app",
  VERCEL_PROJECT_PRODUCTION_URL: "classmanagement-omega.vercel.app",
};
function request(
  origin?: string,
  host = "classmanagement-deployment-team.vercel.app",
) {
  return new Request("https://" + host + "/api/auth", {
    method: "POST",
    headers: origin ? { Origin: origin, Host: host } : { Host: host },
  });
}
it("accepts the configured app and exact Vercel deployment and branch origins", () => {
  for (const origin of [
    "https://classmanagement-omega.vercel.app",
    "https://classmanagement-deployment-team.vercel.app",
    "https://classmanagement-git-main-team.vercel.app",
  ])
    assert.equal(isTrustedOrigin(request(origin), env), true);
});
it("rejects other Vercel projects, lookalike domains and untrusted schemes", () => {
  for (const origin of [
    "https://attacker.vercel.app",
    "https://classmanagement-omega.vercel.app.evil.example",
    "http://classmanagement-deployment-team.vercel.app",
    "null",
    "https://evil.example",
  ])
    assert.equal(isTrustedOrigin(request(origin), env), false);
  assert.equal(isTrustedOrigin(request(), env), false);
});
it("does not trust request Host headers or malformed system configuration on production", () => {
  assert.equal(
    isTrustedOrigin(request("https://evil.example", "evil.example"), env),
    false,
  );
  assert.equal(
    isTrustedOrigin(request("https://evil.example", "evil.example"), {
      NODE_ENV: "production",
      APP_URL: "not a URL",
      VERCEL_URL: "evil.example/path",
    }),
    false,
  );
});
it("retains local development same-origin checks without hosted configuration", () => {
  const local = new Request("http://localhost:3000/api/auth", {
    method: "POST",
    headers: { Origin: "http://127.0.0.1:3000", Host: "127.0.0.1:3000" },
  });
  assert.equal(isTrustedOrigin(local, { NODE_ENV: "development" }), true);
  assert.equal(
    isTrustedOrigin(request("https://evil.example"), {
      NODE_ENV: "development",
    }),
    false,
  );
});
