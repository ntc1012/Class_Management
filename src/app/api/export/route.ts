import { initialize } from "@/lib/db";
import { actor } from "@/lib/security";
import { snapshot } from "@/lib/snapshot";
import { failure } from "@/lib/http";
import { staff } from "@/lib/policy";
export const runtime = "nodejs";
function cell(value: unknown) {
  let s = String(value ?? "");
  if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
export async function GET(request: Request) {
  try {
    await initialize();
    const a = await actor();
    staff(a);
    const data = await snapshot(a);
    const type = new URL(request.url).searchParams.get("type");
    if (type === "json")
      return new Response(JSON.stringify(data, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": "attachment; filename=classflow-export.json",
          "Cache-Control": "no-store",
        },
      });
    const rows =
      type === "students"
        ? [
            ["Họ tên", "Tài khoản", "Trường", "Liên hệ", "Trạng thái"],
            ...data.students.map((s) => [
              s.name,
              s.username,
              s.school,
              s.phone,
              s.status,
            ]),
          ]
        : [
            [
              "Học sinh",
              "Giáo viên",
              "Tháng",
              "Phải thu",
              "Đã nhận",
              "Còn thiếu",
            ],
            ...data.invoices.map((i) => [
              i.student_name,
              i.teacher_name,
              i.period,
              i.total,
              i.paid,
              i.balance,
            ]),
          ];
    return new Response(
      "\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n"),
      {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=classflow-report.csv",
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (e) {
    return failure(e);
  }
}
