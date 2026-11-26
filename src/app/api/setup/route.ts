import { NextResponse } from "next/server";
import { checkOrigin } from "@/lib/security";
import { jsonBody, failure } from "@/lib/http";
import { setupOwner } from "@/lib/setup";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    return NextResponse.json(await setupOwner(await jsonBody(request)), {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
