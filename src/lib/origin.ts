type OriginEnvironment = Record<string, string | undefined>;

export function isTrustedOrigin(
  request: Request,
  env: OriginEnvironment = process.env,
) {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  const allowed = new Set<string>();
  function add(value: string | undefined) {
    if (!value) return;
    try {
      const url = new URL(value);
      if (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password
      )
        allowed.add(url.origin);
    } catch {
      /* Invalid configuration must not broaden access. */
    }
  }
  add(env.APP_URL);
  for (const key of [
    "VERCEL_URL",
    "VERCEL_BRANCH_URL",
    "VERCEL_PROJECT_PRODUCTION_URL",
  ]) {
    const host = env[key];
    if (host && /^[a-z0-9.-]+$/i.test(host)) add(`https://${host}`);
  }
  if (!allowed.size && env.NODE_ENV !== "production") {
    const url = new URL(request.url);
    add(`${url.protocol}//${request.headers.get("host") || url.host}`);
  }
  return allowed.has(origin);
}
