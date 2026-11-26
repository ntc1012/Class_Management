export function healthFailure(
  error: unknown,
  databaseConfigured: boolean,
  stage: string,
) {
  const candidate =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
  const code =
    /^(?:[A-Z0-9]{5}|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE|CERT_HAS_EXPIRED)$/.test(
      candidate,
    )
      ? candidate
      : undefined;
  let reason = "DATABASE_UNAVAILABLE";
  if (!databaseConfigured) reason = "DATABASE_NOT_CONFIGURED";
  else if (code === "28P01" || code === "28000")
    reason = "DATABASE_AUTH_FAILED";
  else if (code?.includes("CERT") || code?.includes("SIGNATURE"))
    reason = "DATABASE_TLS_FAILED";
  else if (code?.startsWith("42") || code === "42501")
    reason = "DATABASE_SCHEMA_FAILED";
  else if (
    code &&
    [
      "ECONNREFUSED",
      "ECONNRESET",
      "ETIMEDOUT",
      "ENOTFOUND",
      "EHOSTUNREACH",
    ].includes(code)
  )
    reason = "DATABASE_CONNECTION_FAILED";
  return { reason, code, stage };
}
