import { NextResponse } from "next/server";
import { initialize } from "@/lib/db";
import { webhook } from "@/lib/payments";
import { failure, jsonBody } from "@/lib/http";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ teacherId: string }> },
) {
  try {
    await initialize();
    const { teacherId } = await context.params;
    return NextResponse.json(await webhook(teacherId, await jsonBody(request)));
  } catch (e) {
    return failure(e);
  }
}
