import { initialize, one } from "@/lib/db";
import { healthFailure } from "@/lib/health";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  let stage = "initialize";
  try {
    await initialize();
    stage = "query";
    await one("SELECT 1 AS healthy");
    return Response.json(
      { status: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const diagnostic = healthFailure(
      error,
      Boolean(process.env.DATABASE_URL),
      stage,
    );
    console.error("ClassFlow health check failed", diagnostic);
    return Response.json(
      { status: "unavailable", ...diagnostic },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
