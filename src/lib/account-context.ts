import { AppError } from "./types";
export const ACCOUNT_HEADER = "X-ClassFlow-Account";
const STORAGE_KEY = "classflow.active-account";
export function validAccountId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
}
export function workspacePath(accountId: string) {
  if (!validAccountId(accountId)) throw new Error("Tài khoản không hợp lệ.");
  return `/workspace/${encodeURIComponent(accountId)}`;
}
export function accountFromRequest(request: Request) {
  const header = request.headers.get(ACCOUNT_HEADER),
    values = new URL(request.url).searchParams.getAll("account"),
    parameter = values[0];
  if (values.length > 1 || (header && parameter && header !== parameter))
    throw new AppError("Thông tin tài khoản không khớp.", 400);
  const selected = header || parameter;
  if (!validAccountId(selected))
    throw new AppError(
      "Vui lòng mở lại trang và đăng nhập tài khoản cho tab này.",
      401,
    );
  return selected;
}
export function accountApiUrl(path: string, accountId: string) {
  if (!path.startsWith("/api/") || !validAccountId(accountId))
    throw new Error("Yêu cầu tài khoản không hợp lệ.");
  const url = new URL(path, "https://classflow.invalid");
  url.searchParams.set("account", accountId);
  return url.pathname + url.search;
}
export function accountFetch(
  accountId: string,
  path: string,
  init: RequestInit = {},
) {
  if (!path.startsWith("/api/") || !validAccountId(accountId))
    throw new Error("Yêu cầu tài khoản không hợp lệ.");
  const headers = new Headers(init.headers);
  headers.set(ACCOUNT_HEADER, accountId);
  return fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });
}
export function rememberedAccount() {
  try {
    const id = sessionStorage.getItem(STORAGE_KEY);
    return validAccountId(id) ? id : null;
  } catch {
    return null;
  }
}
export function rememberAccount(id: string) {
  if (!validAccountId(id)) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* The account-specific URL remains authoritative when browser storage is unavailable. */
  }
}
export function forgetAccount(id: string) {
  try {
    if (sessionStorage.getItem(STORAGE_KEY) === id)
      sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* No persistent credentials are stored here. */
  }
}
