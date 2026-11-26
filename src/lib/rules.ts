import { AppError } from "./types";
export function sessionCharge(status: string, fee: number) {
  if (!["present", "absent", "excused"].includes(status))
    throw new AppError("Trạng thái điểm danh không hợp lệ.");
  return status === "excused" ? 0 : fee;
}
export const localDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function assertSubmissionOpen(
  due: string,
  closed: string | null,
  at = Date.now(),
) {
  if (closed || new Date(due).getTime() <= at)
    throw new AppError("Bài tập đã khóa hoặc hết hạn nộp.");
}
export function datesBetween(start: string, end: string, weekday: number) {
  const dates: string[] = [],
    cursor = new Date(start + "T00:00:00Z"),
    stop = new Date(end + "T00:00:00Z");
  if (
    Number.isNaN(+cursor) ||
    Number.isNaN(+stop) ||
    cursor > stop ||
    +stop - +cursor > 366 * 86400_000
  )
    throw new AppError("Khoảng lịch phải hợp lệ và không quá một năm.");
  while (cursor <= stop) {
    if (cursor.getUTCDay() === weekday)
      dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
export function overlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
) {
  return aStart < bEnd && aEnd > bStart;
}
