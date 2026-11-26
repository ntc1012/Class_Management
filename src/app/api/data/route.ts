import { NextResponse } from "next/server";
import { initialize } from "@/lib/db";
import { requestActor } from "@/lib/security";
import { snapshot } from "@/lib/snapshot";
import { failure } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await initialize();
    return NextResponse.json(await snapshot(await requestActor(request)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
