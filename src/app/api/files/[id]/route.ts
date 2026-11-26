import { initialize } from "@/lib/db";
import { requestActor } from "@/lib/security";
import { download } from "@/lib/storage";
import { failure } from "@/lib/http";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await initialize();
    const result = await download(
      await requestActor(request),
      (await context.params).id,
    );
    return new Response(new Uint8Array(result.data), {
      headers: {
        "Content-Type": result.file.mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.file.name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
