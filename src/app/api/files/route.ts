import { NextResponse } from "next/server";
import { initialize } from "@/lib/db";
import { requestActor, checkOrigin } from "@/lib/security";
import { upload } from "@/lib/storage";
import { failure } from "@/lib/http";
import { AppError } from "@/lib/types";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    await initialize();
    const a = await requestActor(request);
    const max = Number(process.env.MAX_FILE_MB || 10) * 1024 * 1024;
    if (Number(request.headers.get("content-length") || 0) > max + 100000)
      throw new AppError("File vượt giới hạn dung lượng.", 413);
    const reader = request.body?.getReader();
    if (!reader) throw new AppError("Yêu cầu không có file.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > max + 100000) {
        await reader.cancel();
        throw new AppError("File vượt giới hạn dung lượng.", 413);
      }
      chunks.push(part.value);
    }
    const buffered = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: Buffer.concat(chunks),
    });
    const form = await buffered.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("Chưa chọn file.");
    return NextResponse.json(
      await upload(
        a,
        String(form.get("assignment_id") || ""),
        form.get("submission_id") ? String(form.get("submission_id")) : null,
        file,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
