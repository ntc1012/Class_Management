import { it } from "node:test";
import assert from "node:assert/strict";
import { healthFailure } from "../src/lib/health";
it("health diagnostics distinguish missing settings, authentication, transport and schema errors", () => {
  assert.equal(
    healthFailure(new Error("secret connection URL"), false, "initialize")
      .reason,
    "DATABASE_NOT_CONFIGURED",
  );
  assert.equal(
    healthFailure({ code: "28P01" }, true, "initialize").reason,
    "DATABASE_AUTH_FAILED",
  );
  assert.equal(
    healthFailure({ code: "ENOTFOUND" }, true, "initialize").reason,
    "DATABASE_CONNECTION_FAILED",
  );
  assert.equal(
    healthFailure({ code: "42601" }, true, "initialize").reason,
    "DATABASE_SCHEMA_FAILED",
  );
  assert.equal(
    healthFailure({ code: "SELF_SIGNED_CERT_IN_CHAIN" }, true, "initialize")
      .reason,
    "DATABASE_TLS_FAILED",
  );
});
it("health diagnostics never return raw messages, connection URLs or arbitrary error codes", () => {
  const secret = "postgresql://name:private-password@example.invalid/database";
  assert.deepEqual(
    healthFailure(
      { code: secret, message: secret, stack: secret },
      true,
      "query",
    ),
    { reason: "DATABASE_UNAVAILABLE", code: undefined, stage: "query" },
  );
});
