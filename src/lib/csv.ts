import { AppError } from "./types";
export function parseStudentsCsv(source: string) {
  if (source.length > 200000) throw new AppError("CSV vượt giới hạn 200 KB.");
  const input = source.replace(/^\uFEFF/, ""),
    delimiter = input.split(/\r?\n/)[0]?.includes(";") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      if (quoted && input[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (quoted) throw new AppError("CSV có dấu ngoặc kép chưa đóng.");
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2 || rows.length > 501)
    throw new AppError("CSV cần tiêu đề và từ 1 đến 500 học sinh.");
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .toLowerCase()
      .replace(/[ _]/g, "");
  const headers = rows.shift()!.map(normalize);
  const pick = (names: string[]) => headers.findIndex((h) => names.includes(h));
  const name = pick(["hoten", "name", "hovaten"]),
    school = pick(["truong", "truonghoc", "school"]),
    phone = pick(["dienthoai", "lienhe", "phone"]),
    notes = pick(["ghichu", "notes"]);
  if (name < 0) throw new AppError("CSV phải có cột ho_ten.");
  return rows.map((r, index) => {
    if (!r[name]) throw new AppError(`Dòng ${index + 2} thiếu họ tên.`);
    return {
      name: r[name],
      school: school < 0 ? "" : r[school] || "",
      phone: phone < 0 ? "" : r[phone] || "",
      notes: notes < 0 ? "" : r[notes] || "",
    };
  });
}
