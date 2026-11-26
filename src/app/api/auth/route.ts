import { NextResponse } from "next/server";
import { z } from "zod";
import { initialize } from "@/lib/db";
import { login, logout, activate, checkOrigin } from "@/lib/security";
import { failure, jsonBody } from "@/lib/http";
import { accountFromRequest } from "@/lib/account-context";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    await initialize();
    const body = await jsonBody(request);
    if (body.action === "logout") await logout(accountFromRequest(request));
    else if (body.action === "activate") {
      const d = z
        .object({
          code: z.string().min(16).max(100),
          password: z.string().min(10).max(128),
        })
        .parse(body);
      await activate(d.code, d.password);
    } else {
      const d = z
        .object({
          email: z.string().trim().min(3).max(200),
          password: z.string().min(1).max(128),
        })
        .parse(body);
      const result = await login(d.email, d.password);
      return NextResponse.json(
        { ok: true, ...result },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
