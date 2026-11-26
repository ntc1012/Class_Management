import { one } from "./db";
import { AppError, type Actor } from "./types";
export function staff(a: Actor) {
  if (a.role === "student")
    throw new AppError("Bạn không có quyền thực hiện thao tác này.", 403);
}
export function owner(a: Actor) {
  if (a.role !== "owner")
    throw new AppError("Chỉ chủ trung tâm được thực hiện thao tác này.", 403);
}
export async function classAccess(a: Actor, id: string, write = false) {
  const c = await one("SELECT * FROM classes WHERE id=? AND center_id=?", [
    id,
    a.center_id,
  ]);
  if (!c) throw new AppError("Không tìm thấy lớp.", 404);
  if (a.role === "teacher" && c.teacher_id !== a.id)
    throw new AppError("Bạn không được truy cập lớp này.", 403);
  if (a.role === "student") {
    if (write) throw new AppError("Bạn không có quyền quản lý lớp.", 403);
    const enrolled = await one(
      "SELECT e.id FROM enrollments e JOIN students s ON s.id=e.student_id WHERE e.class_id=? AND s.user_id=? AND s.center_id=? AND e.ended_at IS NULL",
      [id, a.id, a.center_id],
    );
    if (!enrolled) throw new AppError("Bạn không thuộc lớp này.", 403);
  }
  return c;
}
export async function studentAccess(a: Actor, id: string) {
  const s = await one("SELECT * FROM students WHERE id=? AND center_id=?", [
    id,
    a.center_id,
  ]);
  if (
    !s ||
    (a.role === "teacher" && s.teacher_id !== a.id) ||
    (a.role === "student" && s.user_id !== a.id)
  )
    throw new AppError("Không tìm thấy học sinh.", 404);
  return s;
}
export async function invoiceAccess(a: Actor, id: string) {
  const i = await one(
    "SELECT i.*,s.name student_name,s.user_id FROM invoices i JOIN students s ON s.id=i.student_id WHERE i.id=? AND i.center_id=?",
    [id, a.center_id],
  );
  if (
    !i ||
    (a.role === "teacher" && i.teacher_id !== a.id) ||
    (a.role === "student" && i.user_id !== a.id)
  )
    throw new AppError("Không tìm thấy khoản phải thu.", 404);
  return i;
}
export async function assignmentAccess(a: Actor, id: string) {
  const assignment = await one(
    "SELECT * FROM assignments WHERE id=? AND center_id=?",
    [id, a.center_id],
  );
  if (!assignment) throw new AppError("Không tìm thấy bài tập.", 404);
  if (a.role !== "student") await classAccess(a, assignment.class_id, true);
  else if (
    !(await one(
      "SELECT t.student_id FROM assignment_targets t JOIN students s ON s.id=t.student_id WHERE t.assignment_id=? AND s.user_id=? AND s.center_id=?",
      [id, a.id, a.center_id],
    ))
  )
    throw new AppError("Bài tập không được giao cho bạn.", 403);
  return assignment;
}
