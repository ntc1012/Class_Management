import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { initialize, query } from "@/lib/db";
import { generateInvoices } from "@/lib/service";
import { reconcile } from "@/lib/payments";
import { localDate } from "@/lib/rules";
import { failure } from "@/lib/http";
import { AppError, type Actor } from "@/lib/types";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`),
      received = Buffer.from(request.headers.get("authorization") || "");
    if (
      !process.env.CRON_SECRET ||
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    )
      throw new AppError("Không được phép.", 401);
    await initialize();
    const today = localDate(),
      [y, m] = today.split("-").map(Number),
      previous = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
    const actors = await query(
      "SELECT id,center_id,role,name,email FROM users WHERE role IN ('teacher','owner') AND active=1",
    );
    const results = [];
    for (const teacher of actors) {
      try {
        const r = await generateInvoices(teacher as Actor, {
          period: previous,
        });
        results.push({ teacher_id: teacher.id, ...r });
      } catch (e) {
        results.push({
          teacher_id: teacher.id,
          error: e instanceof Error ? e.message : "Lỗi",
        });
      }
    }
    const pending = await query(
      "SELECT DISTINCT r.invoice_id,r.teacher_id FROM payment_requests r WHERE r.mode='payos' AND r.status IN ('pending','paid','superseded') AND r.created_at>?",
      [new Date(Date.now() - 7 * 86400000).toISOString()],
    );
    for (const r of pending) {
      const a = actors.find((t) => t.id === r.teacher_id);
      if (a)
        try {
          await reconcile(a as Actor, r.invoice_id);
        } catch {
          results.push({
            invoice_id: r.invoice_id,
            error: "Đối soát chưa hoàn tất",
          });
        }
    }
    return NextResponse.json({ results });
  } catch (e) {
    return failure(e);
  }
}
