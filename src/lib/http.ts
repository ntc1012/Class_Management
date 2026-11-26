import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./types";
export function failure(e: unknown) {
  if (e instanceof ZodError)
    return NextResponse.json(
      {
        error:
          "Dữ liệu không hợp lệ: " +
          e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      },
      { status: 400 },
    );
  if (e instanceof AppError)
    return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(
    "ClassFlow request failed",
    e instanceof Error ? e.message : "Unknown error",
  );
  return NextResponse.json(
    { error: "Không thể xử lý yêu cầu. Vui lòng thử lại." },
    { status: 500 },
  );
}
export async function jsonBody(request: Request) {
  const max = 300000,
    reader = request.body?.getReader();
  if (!reader) throw new AppError("Yêu cầu không có dữ liệu.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new AppError("Yêu cầu quá lớn.", 413);
    }
    chunks.push(part.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError("JSON không hợp lệ.");
  }
}
