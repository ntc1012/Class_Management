import { query } from "./db";
import type { Actor, Row } from "./types";
import { invoiceTotals } from "./service";
import { isDemo } from "./payments";
export async function snapshot(a: Actor) {
  const args: unknown[] = [a.center_id];
  let condition = "c.center_id=?";
  if (a.role === "teacher") {
    condition += " AND c.teacher_id=?";
    args.push(a.id);
  }
  if (a.role === "student") {
    condition +=
      " AND EXISTS (SELECT 1 FROM enrollments e JOIN students st ON st.id=e.student_id WHERE e.class_id=c.id AND st.user_id=? AND e.ended_at IS NULL)";
    args.push(a.id);
  }
  const classes = await query(
    `SELECT c.*,u.name teacher_name,(SELECT COUNT(*) FROM enrollments en WHERE en.class_id=c.id AND en.ended_at IS NULL) student_count FROM classes c JOIN users u ON u.id=c.teacher_id WHERE ${condition} ORDER BY c.created_at DESC`,
    args,
  );
  const classIds = classes.map((c) => c.id);
  const inList = (ids: string[]) =>
    ids.length ? ids.map(() => "?").join(",") : "NULL";
  let students: Row[];
  if (a.role === "student")
    students = await query(
      "SELECT s.*,u.email username FROM students s JOIN users u ON u.id=s.user_id WHERE s.center_id=? AND s.user_id=?",
      [a.center_id, a.id],
    );
  else
    students = await query(
      `SELECT s.*,u.email username FROM students s LEFT JOIN users u ON u.id=s.user_id WHERE s.center_id=? ${a.role === "teacher" ? "AND s.teacher_id=?" : ""} ORDER BY s.created_at DESC`,
      a.role === "teacher" ? [a.center_id, a.id] : [a.center_id],
    );
  const studentIds = students.map((s) => s.id);
  const enrollments = await query(
    `SELECT * FROM enrollments WHERE center_id=? AND class_id IN (${inList(classIds)}) ${a.role === "student" ? `AND student_id IN (${inList(studentIds)})` : ""}`,
    [a.center_id, ...classIds, ...(a.role === "student" ? studentIds : [])],
  );
  const sessions = await query(
    `SELECT s.*,c.name class_name,c.teacher_id,c.room FROM sessions s JOIN classes c ON c.id=s.class_id WHERE s.center_id=? AND s.class_id IN (${inList(classIds)}) ORDER BY s.date,s.start_time`,
    [a.center_id, ...classIds],
  );
  const attendance = await query(
    `SELECT at.* FROM attendance at JOIN sessions s ON s.id=at.session_id WHERE at.center_id=? AND s.class_id IN (${inList(classIds)}) ${a.role === "student" ? `AND at.student_id IN (${inList(studentIds)})` : ""}`,
    [a.center_id, ...classIds, ...(a.role === "student" ? studentIds : [])],
  );
  const invArgs: unknown[] = [a.center_id];
  let invCondition = "i.center_id=?";
  if (a.role === "teacher") {
    invCondition += " AND i.teacher_id=?";
    invArgs.push(a.id);
  }
  if (a.role === "student") {
    invCondition += " AND st.user_id=?";
    invArgs.push(a.id);
  }
  const invoices = await query(
    `SELECT i.*,st.name student_name,u.name teacher_name FROM invoices i JOIN students st ON st.id=i.student_id JOIN users u ON u.id=i.teacher_id WHERE ${invCondition} ORDER BY i.period DESC,st.name`,
    invArgs,
  );
  for (const inv of invoices) Object.assign(inv, await invoiceTotals(inv.id));
  const invoiceIds = invoices.map((i) => i.id);
  const payments = await query(
    `SELECT p.* FROM payments p WHERE p.center_id=? AND p.invoice_id IN (${inList(invoiceIds)}) ORDER BY p.paid_at DESC`,
    [a.center_id, ...invoiceIds],
  );
  const adjustments = await query(
    `SELECT ad.*,u.name actor_name FROM adjustments ad JOIN users u ON u.id=ad.actor_id WHERE ad.center_id=? AND ad.invoice_id IN (${inList(invoiceIds)}) ORDER BY ad.created_at DESC`,
    [a.center_id, ...invoiceIds],
  );
  const invoice_lines = await query(
    `SELECT * FROM invoice_lines WHERE invoice_id IN (${inList(invoiceIds)})`,
    invoiceIds,
  );
  const assignments = await query(
    `SELECT ass.*,c.name class_name FROM assignments ass JOIN classes c ON c.id=ass.class_id WHERE ass.center_id=? ${a.role === "student" ? `AND EXISTS(SELECT 1 FROM assignment_targets t JOIN students st ON st.id=t.student_id WHERE t.assignment_id=ass.id AND st.user_id=?)` : `AND ass.class_id IN (${inList(classIds)})`} ORDER BY ass.created_at DESC`,
    [a.center_id, ...(a.role === "student" ? [a.id] : classIds)],
  );
  const assignmentIds = assignments.map((x) => x.id);
  const targets = await query(
    `SELECT t.* FROM assignment_targets t WHERE t.assignment_id IN (${inList(assignmentIds)}) ${a.role === "student" ? `AND t.student_id IN (${inList(studentIds)})` : ""}`,
    [...assignmentIds, ...(a.role === "student" ? studentIds : [])],
  );
  const submissions = await query(
    `SELECT sub.*,st.name student_name FROM submissions sub JOIN students st ON st.id=sub.student_id WHERE sub.center_id=? AND sub.assignment_id IN (${inList(assignmentIds)}) ${a.role === "student" ? "AND st.user_id=?" : ""} ORDER BY sub.version DESC`,
    [a.center_id, ...assignmentIds, ...(a.role === "student" ? [a.id] : [])],
  );
  const files = await query(
    `SELECT id,assignment_id,submission_id,name,mime,size,uploaded_by FROM files WHERE center_id=? AND assignment_id IN (${inList(assignmentIds)}) ${a.role === "student" ? "AND (submission_id IS NULL OR uploaded_by=?)" : ""}`,
    [a.center_id, ...assignmentIds, ...(a.role === "student" ? [a.id] : [])],
  );
  const teachers =
    a.role === "student"
      ? []
      : await query(
          `SELECT id,name,email,role FROM users WHERE center_id=? AND role IN ('owner','teacher') ${a.role === "teacher" ? "AND id=?" : ""} ORDER BY name`,
          a.role === "teacher" ? [a.center_id, a.id] : [a.center_id],
        );
  const banks =
    a.role === "student"
      ? []
      : await query(
          `SELECT teacher_id,bank,account_number,account_name,CASE WHEN credentials IS NULL THEN 0 ELSE 1 END connected FROM bank_accounts WHERE center_id=? ${a.role === "teacher" ? "AND teacher_id=?" : ""}`,
          a.role === "teacher" ? [a.center_id, a.id] : [a.center_id],
        );
  const notifications = await query(
    "SELECT * FROM notifications WHERE center_id=? AND user_id=? ORDER BY created_at DESC LIMIT 100",
    [a.center_id, a.id],
  );
  const audit_logs =
    a.role === "student"
      ? []
      : await query(
          `SELECT l.*,u.name actor_name FROM audit_logs l LEFT JOIN users u ON u.id=l.actor_id WHERE l.center_id=? ${a.role === "teacher" ? "AND l.actor_id=?" : ""} ORDER BY l.created_at DESC LIMIT 150`,
          a.role === "teacher" ? [a.center_id, a.id] : [a.center_id],
        );
  const payment_events =
    a.role === "owner"
      ? await query(
          "SELECT e.*,i.period,s.name student_name FROM payment_events e JOIN payment_requests r ON r.id=e.request_id JOIN invoices i ON i.id=r.invoice_id JOIN students s ON s.id=i.student_id WHERE e.center_id=? AND e.status='review' ORDER BY e.created_at DESC",
          [a.center_id],
        )
      : [];
  const center = (
    await query("SELECT id,name FROM centers WHERE id=?", [a.center_id])
  )[0];
  return {
    actor: a,
    center,
    classes,
    students,
    enrollments,
    sessions,
    attendance,
    invoices,
    invoice_lines,
    payments,
    adjustments,
    assignments,
    targets,
    submissions,
    files,
    teachers,
    banks,
    notifications,
    audit_logs,
    payment_events,
    demo: isDemo(),
  };
}
