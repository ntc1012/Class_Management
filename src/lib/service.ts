import { randomUUID } from "node:crypto";
import { z } from "zod";
import { query, one, transaction, lock, now } from "./db";
import { AppError, type Actor, type Row } from "./types";
import { activation, encrypt } from "./security";
import {
  classAccess,
  studentAccess,
  invoiceAccess,
  assignmentAccess,
  staff,
  owner,
} from "./policy";
import {
  datesBetween,
  localDate,
  overlap,
  sessionCharge,
  assertSubmissionOpen,
} from "./rules";
import { parseStudentsCsv } from "./csv";

export const id = () => randomUUID();
const text = z.string().trim().min(1).max(200);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Ngày không hợp lệ",
  );
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export async function audit(
  a: Actor,
  action: string,
  entity: string,
  entityId: string,
  details: unknown = {},
) {
  await query(
    "INSERT INTO audit_logs(id,center_id,actor_id,action,entity,entity_id,details,created_at) VALUES(?,?,?,?,?,?,?,?)",
    [
      id(),
      a.center_id,
      a.id,
      action,
      entity,
      entityId,
      JSON.stringify(details),
      now(),
    ],
  );
}
export async function notify(
  a: Actor,
  userId: string,
  title: string,
  body: string,
) {
  await query(
    "INSERT INTO notifications(id,center_id,user_id,title,body,created_at) VALUES(?,?,?,?,?,?)",
    [id(), a.center_id, userId, title, body, now()],
  );
}
async function teacherFor(a: Actor, teacherId?: string) {
  staff(a);
  const target = a.role === "owner" ? teacherId || a.id : a.id;
  if (
    !(await one(
      "SELECT id FROM users WHERE id=? AND center_id=? AND role IN ('teacher','owner') AND active=1",
      [target, a.center_id],
    ))
  )
    throw new AppError("Giáo viên không hợp lệ.");
  return target;
}
async function conflict(
  a: Actor,
  c: Row,
  dateValue: string,
  start: string,
  end: string,
  exclude?: string,
) {
  if (start >= end) throw new AppError("Giờ kết thúc phải sau giờ bắt đầu.");
  const rows = await query(
    "SELECT s.*,c.teacher_id,c.room,c.name FROM sessions s JOIN classes c ON c.id=s.class_id WHERE s.center_id=? AND s.date=? AND s.status<>'cancelled'",
    [a.center_id, dateValue],
  );
  const hit = rows.find(
    (s) =>
      s.id !== exclude &&
      (s.teacher_id === c.teacher_id || (c.room && s.room === c.room)) &&
      overlap(start, end, s.start_time, s.end_time),
  );
  if (hit)
    throw new AppError(
      `Trùng lịch giáo viên hoặc phòng với lớp ${hit.name} ngày ${dateValue}.`,
    );
}
export async function createStudent(a: Actor, input: unknown) {
  const d = z
    .object({
      name: text,
      school: z.string().max(200).default(""),
      phone: z.string().max(30).default(""),
      notes: z.string().max(2000).default(""),
      teacher_id: z.string().optional(),
      class_id: z.string().optional(),
    })
    .parse(input);
  const teacher = await teacherFor(a, d.teacher_id);
  if (d.class_id) {
    const c = await classAccess(a, d.class_id, true);
    if (c.teacher_id !== teacher)
      throw new AppError("Học sinh và lớp phải cùng giáo viên quản lý.");
  }
  return transaction(async () => {
    const studentId = id(),
      userId = id(),
      username = `hs${Date.now().toString(36)}${studentId.slice(0, 4)}`;
    await query(
      "INSERT INTO users(id,center_id,email,name,role,created_at) VALUES(?,?,?,?,?,?)",
      [userId, a.center_id, username, d.name, "student", now()],
    );
    await query(
      "INSERT INTO students(id,center_id,teacher_id,user_id,name,school,phone,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
      [
        studentId,
        a.center_id,
        teacher,
        userId,
        d.name,
        d.school,
        d.phone,
        d.notes,
        now(),
      ],
    );
    if (d.class_id)
      await enroll(a, { class_id: d.class_id, student_id: studentId });
    const code = await activation(userId);
    await audit(a, "student.create", "student", studentId);
    return { id: studentId, username, activation_code: code };
  });
}
export async function createClass(a: Actor, input: unknown) {
  const d = z
    .object({
      name: text,
      subject: text,
      level: z.string().max(100).default(""),
      room: z.string().max(100).default(""),
      capacity: z.coerce.number().int().min(1).max(200).default(30),
      teacher_id: z.string().optional(),
    })
    .parse(input);
  const teacher = await teacherFor(a, d.teacher_id),
    classId = id();
  const createdClass = await transaction(async () => {
    await query(
      "INSERT INTO classes(id,center_id,teacher_id,name,subject,level,room,capacity,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
      [
        classId,
        a.center_id,
        teacher,
        d.name,
        d.subject,
        d.level,
        d.room,
        d.capacity,
        now(),
      ],
    );
    await audit(a, "class.create", "class", classId);
    const record = await one(
      "SELECT c.*,u.name teacher_name,0 AS student_count FROM classes c JOIN users u ON u.id=c.teacher_id WHERE c.id=? AND c.center_id=?",
      [classId, a.center_id],
    );
    if (!record) throw new AppError("Chưa thể đọc lại lớp vừa tạo.", 500);
    return record;
  });
  return { id: classId, class: createdClass };
}
export async function enroll(a: Actor, input: unknown) {
  staff(a);
  const d = z.object({ class_id: text, student_id: text }).parse(input);
  return transaction(async () => {
    const c = await classAccess(a, d.class_id, true),
      s = await studentAccess(a, d.student_id);
    if (c.teacher_id !== s.teacher_id)
      throw new AppError("Học sinh và lớp phải cùng giáo viên quản lý.");
    await lock("SELECT id FROM classes WHERE id=?", [c.id]);
    if (
      await one(
        "SELECT id FROM enrollments WHERE class_id=? AND student_id=? AND ended_at IS NULL",
        [c.id, s.id],
      )
    )
      throw new AppError("Học sinh đã có trong lớp.");
    const count = await one(
      "SELECT COUNT(*) n FROM enrollments WHERE class_id=? AND ended_at IS NULL",
      [c.id],
    );
    if (Number(count.n) >= c.capacity) throw new AppError("Lớp đã đủ sĩ số.");
    await query(
      "INSERT INTO enrollments(id,center_id,class_id,student_id,joined_at) VALUES(?,?,?,?,?)",
      [id(), a.center_id, c.id, s.id, now()],
    );
    await audit(a, "class.enroll", "class", c.id, { student_id: s.id });
    return { ok: true };
  });
}
export async function createSchedule(a: Actor, input: unknown) {
  const d = z
    .object({
      class_id: text,
      weekday: z.coerce.number().int().min(0).max(6),
      start_time: time,
      end_time: time,
      start_date: date,
      end_date: date,
    })
    .parse(input);
  const c = await classAccess(a, d.class_id, true);
  const dates = datesBetween(d.start_date, d.end_date, d.weekday);
  if (!dates.length || d.start_date < localDate())
    throw new AppError(
      "Lịch mới phải bắt đầu từ hôm nay và có ít nhất một buổi.",
    );
  return transaction(async () => {
    await lock("SELECT id FROM centers WHERE id=?", [a.center_id]);
    const scheduleId = id();
    for (const day of dates)
      await conflict(a, c, day, d.start_time, d.end_time);
    await query(
      "INSERT INTO schedules(id,center_id,class_id,weekday,start_time,end_time,start_date,end_date) VALUES(?,?,?,?,?,?,?,?)",
      [
        scheduleId,
        a.center_id,
        c.id,
        d.weekday,
        d.start_time,
        d.end_time,
        d.start_date,
        d.end_date,
      ],
    );
    for (const day of dates)
      await query(
        "INSERT INTO sessions(id,center_id,class_id,schedule_id,original_date,date,start_time,end_time,fee) VALUES(?,?,?,?,?,?,?,?,?)",
        [
          id(),
          a.center_id,
          c.id,
          scheduleId,
          day,
          day,
          d.start_time,
          d.end_time,
          c.fee,
        ],
      );
    await audit(a, "schedule.create", "schedule", scheduleId, {
      count: dates.length,
    });
    return { count: dates.length };
  });
}
export async function moveSession(a: Actor, input: unknown) {
  const d = z
    .object({
      session_id: text,
      scope: z.enum(["single", "series"]),
      date,
      start_time: time,
      end_time: time,
    })
    .parse(input);
  return transaction(async () => {
    await lock("SELECT id FROM centers WHERE id=?", [a.center_id]);
    const s = await lock("SELECT * FROM sessions WHERE id=? AND center_id=?", [
      d.session_id,
      a.center_id,
    ]);
    if (!s) throw new AppError("Không tìm thấy buổi học.");
    const c = await classAccess(a, s.class_id, true);
    if (
      s.status !== "scheduled" ||
      s.date < localDate() ||
      d.date < localDate()
    )
      throw new AppError("Chỉ đổi các buổi chưa học từ hôm nay trở đi.");
    const sessions =
      d.scope === "series" && s.schedule_id
        ? await query(
            "SELECT * FROM sessions WHERE schedule_id=? AND date>=? AND status='scheduled' ORDER BY date",
            [s.schedule_id, s.date],
          )
        : [s];
    const shift = Date.parse(d.date) - Date.parse(s.date);
    const moving = new Set(sessions.map((x) => x.id));
    // Temporarily exclude all moving sessions from conflict checks, inside the same transaction.
    for (const item of sessions) {
      const fresh = await lock("SELECT * FROM sessions WHERE id=?", [item.id]);
      if (fresh.status !== "scheduled")
        throw new AppError(
          "Một buổi học vừa được khóa. Vui lòng tải lại lịch.",
        );
      await query("UPDATE sessions SET status='cancelled' WHERE id=?", [
        item.id,
      ]);
    }
    for (const item of sessions) {
      const day = new Date(Date.parse(item.date) + shift)
        .toISOString()
        .slice(0, 10);
      await conflict(a, c, day, d.start_time, d.end_time);
      await query(
        "UPDATE sessions SET date=?,start_time=?,end_time=?,status='scheduled' WHERE id=?",
        [day, d.start_time, d.end_time, item.id],
      );
    }
    await audit(a, "session.move", "session", s.id, {
      ...d,
      count: moving.size,
    });
    return { count: moving.size };
  });
}
export async function attendanceSave(a: Actor, input: unknown) {
  const d = z
    .object({
      session_id: text,
      entries: z
        .array(
          z.object({
            student_id: text,
            status: z.enum(["present", "excused", "absent"]),
            note: z.string().max(500).default(""),
          }),
        )
        .min(1)
        .max(200),
      lock: z.boolean().default(false),
    })
    .parse(input);
  return transaction(async () => {
    const s = await lock("SELECT * FROM sessions WHERE id=? AND center_id=?", [
      d.session_id,
      a.center_id,
    ]);
    if (!s) throw new AppError("Không tìm thấy buổi học.");
    await classAccess(a, s.class_id, true);
    if (s.status !== "scheduled")
      throw new AppError("Buổi đã khóa hoặc đã hủy, không thể sửa.");
    const end = Date.parse(`${s.date}T${s.end_time}:00+07:00`);
    if (d.lock && end > Date.now())
      throw new AppError("Chỉ khóa buổi sau giờ kết thúc.");
    const members = await query(
      "SELECT student_id FROM enrollments WHERE class_id=? AND substr(joined_at,1,10)<=? AND (ended_at IS NULL OR substr(ended_at,1,10)>?)",
      [s.class_id, s.date, s.date],
    );
    const eligible = new Set(members.map((x) => x.student_id));
    if (
      new Set(d.entries.map((e) => e.student_id)).size !== d.entries.length ||
      d.entries.some((e) => !eligible.has(e.student_id))
    )
      throw new AppError("Danh sách điểm danh không hợp lệ.");
    for (const e of d.entries)
      await query(
        "INSERT INTO attendance(id,center_id,session_id,student_id,status,note,marked_by,marked_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(session_id,student_id) DO UPDATE SET status=excluded.status,note=excluded.note,marked_by=excluded.marked_by,marked_at=excluded.marked_at",
        [id(), a.center_id, s.id, e.student_id, e.status, e.note, a.id, now()],
      );
    if (d.lock) {
      const count = await one(
        "SELECT COUNT(*) n FROM attendance WHERE session_id=?",
        [s.id],
      );
      if (Number(count.n) !== eligible.size)
        throw new AppError("Cần điểm danh đủ học sinh trước khi khóa.");
      await query(
        "UPDATE sessions SET status='locked',locked_at=? WHERE id=?",
        [now(), s.id],
      );
    }
    await audit(
      a,
      d.lock ? "session.lock" : "attendance.save",
      "session",
      s.id,
    );
    return { ok: true };
  });
}
export async function cancelSession(a: Actor, sessionId: string) {
  return transaction(async () => {
    const s = await lock("SELECT * FROM sessions WHERE id=? AND center_id=?", [
      sessionId,
      a.center_id,
    ]);
    if (!s) throw new AppError("Không tìm thấy buổi học.");
    await classAccess(a, s.class_id, true);
    if (s.status !== "scheduled") throw new AppError("Buổi đã khóa hoặc hủy.");
    await query("UPDATE sessions SET status='cancelled' WHERE id=?", [s.id]);
    await audit(a, "session.cancel", "session", s.id);
    return { ok: true };
  });
}
export async function invoiceTotals(invoiceId: string) {
  const invoice = await one("SELECT * FROM invoices WHERE id=?", [invoiceId]);
  const adjusted = await one(
    "SELECT COALESCE(SUM(amount),0) n FROM adjustments WHERE invoice_id=?",
    [invoiceId],
  );
  const paid = await one(
    "SELECT COALESCE(SUM(amount),0) n FROM payments WHERE invoice_id=?",
    [invoiceId],
  );
  const total = Number(invoice.amount) + Number(adjusted.n),
    received = Number(paid.n);
  return {
    total,
    paid: received,
    balance: total - received,
    status: received >= total ? "paid" : received > 0 ? "partial" : "unpaid",
  };
}
export async function generateInvoices(a: Actor, input: unknown) {
  staff(a);
  const d = z
    .object({ period, teacher_id: z.string().optional() })
    .parse(input);
  const teacher = await teacherFor(a, d.teacher_id);
  const [year, month] = d.period.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(year, month, 0))
    .toISOString()
    .slice(0, 10);
  if (localDate() < monthEnd)
    throw new AppError("Chỉ chốt học phí từ ngày cuối tháng trở đi.");
  return transaction(async () => {
    await lock("SELECT id FROM users WHERE id=?", [teacher]);
    const pending = await one(
      "SELECT COUNT(*) n FROM sessions s JOIN classes c ON c.id=s.class_id WHERE c.center_id=? AND c.teacher_id=? AND substr(s.date,1,7)=? AND s.status='scheduled'",
      [a.center_id, teacher, d.period],
    );
    if (Number(pending.n))
      throw new AppError(
        "Cần khóa hoặc hủy tất cả buổi trong tháng trước khi chốt học phí.",
      );
    const rows = await query(
      "SELECT at.student_id,at.status,s.id session_id,s.fee,s.date,c.name,su.user_id FROM attendance at JOIN sessions s ON s.id=at.session_id JOIN classes c ON c.id=s.class_id JOIN students su ON su.id=at.student_id WHERE c.center_id=? AND c.teacher_id=? AND substr(s.date,1,7)=? AND s.status='locked' ORDER BY s.date",
      [a.center_id, teacher, d.period],
    );
    const groups = new Map<string, Row[]>();
    for (const r of rows)
      groups.set(r.student_id, [...(groups.get(r.student_id) || []), r]);
    let created = 0;
    for (const [student, entries] of groups) {
      const exists = await one(
        "SELECT id FROM invoices WHERE teacher_id=? AND student_id=? AND period=?",
        [teacher, student, d.period],
      );
      if (exists) continue;
      const invoiceId = id(),
        amount = entries.reduce(
          (sum, r) => sum + sessionCharge(r.status, Number(r.fee)),
          0,
        );
      await query(
        "INSERT INTO invoices(id,center_id,student_id,teacher_id,period,amount,created_at) VALUES(?,?,?,?,?,?,?)",
        [invoiceId, a.center_id, student, teacher, d.period, amount, now()],
      );
      for (const e of entries)
        await query(
          "INSERT INTO invoice_lines(id,invoice_id,session_id,label,amount) VALUES(?,?,?,?,?)",
          [
            id(),
            invoiceId,
            e.session_id,
            `${e.name} · ${e.date}${e.status === "excused" ? " · Vắng có phép" : ""}`,
            sessionCharge(e.status, Number(e.fee)),
          ],
        );
      if (entries[0].user_id)
        await notify(
          a,
          entries[0].user_id,
          "Học phí tháng " + d.period,
          `Khoản phải thu: ${amount.toLocaleString("vi-VN")}đ.`,
        );
      created++;
    }
    await audit(a, "invoice.generate", "period", d.period, {
      teacher,
      created,
    });
    return { count: created };
  });
}
export async function adjustInvoice(a: Actor, input: unknown) {
  owner(a);
  const d = z
    .object({
      invoice_id: text,
      amount: z.coerce
        .number()
        .int()
        .min(-100000000)
        .max(100000000)
        .refine((x) => x !== 0),
      reason: z.string().trim().min(5).max(1000),
    })
    .parse(input);
  return transaction(async () => {
    await invoiceAccess(a, d.invoice_id);
    await lock("SELECT id FROM invoices WHERE id=?", [d.invoice_id]);
    const t = await invoiceTotals(d.invoice_id);
    if (t.total + d.amount < 0)
      throw new AppError("Tổng phải thu không được âm.");
    const adjustmentId = id();
    await query(
      "INSERT INTO adjustments(id,center_id,invoice_id,amount,reason,actor_id,created_at) VALUES(?,?,?,?,?,?,?)",
      [
        adjustmentId,
        a.center_id,
        d.invoice_id,
        d.amount,
        d.reason,
        a.id,
        now(),
      ],
    );
    await audit(a, "invoice.adjust", "invoice", d.invoice_id, d);
    return { ok: true };
  });
}
export async function createAssignment(a: Actor, input: unknown) {
  const d = z
    .object({
      class_id: text,
      title: text,
      description: z.string().max(10000).default(""),
      due_at: z.string().datetime({ offset: true }),
      max_score: z.coerce.number().int().min(1).max(100).default(10),
    })
    .parse(input);
  const c = await classAccess(a, d.class_id, true);
  if (Date.parse(d.due_at) <= Date.now())
    throw new AppError("Hạn nộp phải ở tương lai.");
  return transaction(async () => {
    await lock("SELECT id FROM classes WHERE id=?", [c.id]);
    const assignmentId = id();
    await query(
      "INSERT INTO assignments(id,center_id,class_id,teacher_id,title,description,due_at,max_score,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
      [
        assignmentId,
        a.center_id,
        c.id,
        c.teacher_id,
        d.title,
        d.description,
        d.due_at,
        d.max_score,
        now(),
      ],
    );
    const members = await query(
      "SELECT e.student_id,s.user_id FROM enrollments e JOIN students s ON s.id=e.student_id WHERE e.class_id=? AND e.ended_at IS NULL",
      [c.id],
    );
    for (const m of members) {
      await query(
        "INSERT INTO assignment_targets(assignment_id,student_id) VALUES(?,?)",
        [assignmentId, m.student_id],
      );
      if (m.user_id) await notify(a, m.user_id, "Bài tập mới", d.title);
    }
    await audit(a, "assignment.create", "assignment", assignmentId);
    return { id: assignmentId };
  });
}
export async function submit(a: Actor, input: unknown) {
  if (a.role !== "student")
    throw new AppError("Chỉ học sinh được nộp bài.", 403);
  const d = z
    .object({ assignment_id: text, body: z.string().trim().max(20000) })
    .parse(input);
  return transaction(async () => {
    const assignment = await assignmentAccess(a, d.assignment_id);
    await lock("SELECT id FROM assignments WHERE id=?", [assignment.id]);
    const latest = await one("SELECT * FROM assignments WHERE id=?", [
      assignment.id,
    ]);
    assertSubmissionOpen(latest.due_at, latest.closed_at);
    const s = await one(
      "SELECT id FROM students WHERE user_id=? AND center_id=?",
      [a.id, a.center_id],
    );
    const previous = await one(
      "SELECT COALESCE(MAX(version),0) n FROM submissions WHERE assignment_id=? AND student_id=?",
      [assignment.id, s.id],
    );
    const submissionId = id();
    await query(
      "INSERT INTO submissions(id,center_id,assignment_id,student_id,version,body,submitted_at) VALUES(?,?,?,?,?,?,?)",
      [
        submissionId,
        a.center_id,
        assignment.id,
        s.id,
        Number(previous.n) + 1,
        d.body,
        now(),
      ],
    );
    await audit(a, "submission.create", "submission", submissionId);
    return { id: submissionId, version: Number(previous.n) + 1 };
  });
}
export async function closeAssignment(a: Actor, assignmentId: string) {
  staff(a);
  return transaction(async () => {
    await assignmentAccess(a, assignmentId);
    await lock("SELECT id FROM assignments WHERE id=?", [assignmentId]);
    await query(
      "UPDATE assignments SET closed_at=? WHERE id=? AND closed_at IS NULL",
      [now(), assignmentId],
    );
    await audit(a, "assignment.close", "assignment", assignmentId);
    return { ok: true };
  });
}
export async function grade(a: Actor, input: unknown) {
  staff(a);
  const d = z
    .object({
      submission_id: text,
      score: z.coerce.number().min(0).max(100),
      feedback: z.string().max(5000).default(""),
    })
    .parse(input);
  return transaction(async () => {
    const s = await one(
      "SELECT * FROM submissions WHERE id=? AND center_id=?",
      [d.submission_id, a.center_id],
    );
    if (!s) throw new AppError("Không tìm thấy bài nộp.");
    const assignment = await assignmentAccess(a, s.assignment_id);
    if (d.score > assignment.max_score)
      throw new AppError("Điểm vượt thang điểm.");
    await query(
      "UPDATE submissions SET score=?,feedback=?,graded_by=?,graded_at=? WHERE id=?",
      [d.score, d.feedback, a.id, now(), s.id],
    );
    await audit(a, "submission.grade", "submission", s.id, {
      score: d.score,
      feedback: d.feedback,
    });
    return { ok: true };
  });
}
export async function saveBank(a: Actor, input: unknown) {
  const d = z
    .object({
      teacher_id: z.string().optional(),
      bank: z.enum(["Agribank", "Techcombank"]),
      account_number: z.string().regex(/^\d{6,30}$/),
      account_name: text,
      client_id: z.string().max(300).optional(),
      api_key: z.string().max(300).optional(),
      checksum_key: z.string().max(300).optional(),
    })
    .parse(input);
  const teacher = await teacherFor(a, d.teacher_id);
  const old = await one(
    "SELECT credentials FROM bank_accounts WHERE teacher_id=? AND center_id=?",
    [teacher, a.center_id],
  );
  const hasAny = d.client_id || d.api_key || d.checksum_key;
  if (hasAny && !(d.client_id && d.api_key && d.checksum_key))
    throw new AppError("Cần nhập đủ ba khóa kết nối payOS.");
  const credentials = hasAny
    ? encrypt({
        clientId: d.client_id,
        apiKey: d.api_key,
        checksumKey: d.checksum_key,
      })
    : old?.credentials || null;
  await transaction(async () => {
    await query(
      "INSERT INTO bank_accounts(teacher_id,center_id,bank,account_number,account_name,credentials,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(teacher_id) DO UPDATE SET bank=excluded.bank,account_number=excluded.account_number,account_name=excluded.account_name,credentials=excluded.credentials,verified_at=NULL,updated_at=excluded.updated_at",
      [
        teacher,
        a.center_id,
        d.bank,
        d.account_number,
        d.account_name,
        credentials,
        now(),
      ],
    );
    await audit(a, "bank.update", "teacher", teacher);
  });
  return { ok: true };
}
export async function createTeacher(a: Actor, input: unknown) {
  owner(a);
  const d = z
    .object({ name: text, email: z.string().email().max(200) })
    .parse(input);
  const userId = id();
  return transaction(async () => {
    if (
      await one("SELECT id FROM users WHERE email=?", [d.email.toLowerCase()])
    )
      throw new AppError("Email đã được sử dụng.");
    await query(
      "INSERT INTO users(id,center_id,email,name,role,created_at) VALUES(?,?,?,?,?,?)",
      [userId, a.center_id, d.email.toLowerCase(), d.name, "teacher", now()],
    );
    const code = await activation(userId);
    await audit(a, "teacher.create", "user", userId);
    return { username: d.email, activation_code: code };
  });
}
export async function reissueActivation(a: Actor, studentId: string) {
  staff(a);
  const s = await studentAccess(a, studentId);
  return transaction(async () => {
    const code = await activation(s.user_id);
    await audit(a, "activation.reissue", "student", s.id);
    return { activation_code: code };
  });
}
export async function endEnrollment(a: Actor, input: unknown) {
  staff(a);
  const d = z.object({ class_id: text, student_id: text }).parse(input);
  return transaction(async () => {
    await classAccess(a, d.class_id, true);
    await studentAccess(a, d.student_id);
    await query(
      "UPDATE enrollments SET ended_at=? WHERE class_id=? AND student_id=? AND ended_at IS NULL",
      [now(), d.class_id, d.student_id],
    );
    await audit(a, "class.unenroll", "class", d.class_id, {
      student_id: d.student_id,
    });
    return { ok: true };
  });
}
export async function updateStudent(a: Actor, input: unknown) {
  staff(a);
  const d = z
    .object({
      student_id: text,
      name: text,
      school: z.string().max(200).default(""),
      phone: z.string().max(30).default(""),
      notes: z.string().max(2000).default(""),
      status: z.enum(["active", "paused", "left"]).default("active"),
    })
    .parse(input);
  return transaction(async () => {
    const s = await studentAccess(a, d.student_id);
    await query(
      "UPDATE students SET name=?,school=?,phone=?,notes=?,status=? WHERE id=?",
      [d.name, d.school, d.phone, d.notes, d.status, s.id],
    );
    await query("UPDATE users SET name=? WHERE id=?", [d.name, s.user_id]);
    await audit(a, "student.update", "student", s.id);
    return { ok: true };
  });
}
export async function importStudents(a: Actor, input: unknown) {
  staff(a);
  const d = z
    .object({ csv: z.string().max(200000), teacher_id: z.string().optional() })
    .parse(input);
  const rows = parseStudentsCsv(d.csv);
  const teacher = await teacherFor(a, d.teacher_id);
  return transaction(async () => {
    const created = [];
    for (const r of rows) {
      const record = await createStudent(a, { ...r, teacher_id: teacher });
      created.push({ name: r.name, ...record });
    }
    await audit(a, "student.import", "teacher", teacher, {
      count: created.length,
    });
    return { count: created.length, students: created };
  });
}
export async function teacherActivation(a: Actor, userId: string) {
  owner(a);
  const u = await one(
    "SELECT id,email FROM users WHERE id=? AND center_id=? AND role='teacher'",
    [userId, a.center_id],
  );
  if (!u) throw new AppError("Không tìm thấy giáo viên.");
  return transaction(async () => {
    const code = await activation(userId);
    await audit(a, "teacher.activation", "user", userId);
    return { username: u.email, activation_code: code };
  });
}
export async function updateClass(a: Actor, input: unknown) {
  const d = z
    .object({
      class_id: text,
      name: text,
      subject: text,
      level: z.string().max(100).default(""),
      room: z.string().max(100).default(""),
      capacity: z.coerce.number().int().min(1).max(200),
    })
    .parse(input);
  return transaction(async () => {
    await lock("SELECT id FROM centers WHERE id=?", [a.center_id]);
    const c = await classAccess(a, d.class_id, true);
    await lock("SELECT id FROM classes WHERE id=?", [c.id]);
    const members = await one(
      "SELECT COUNT(*) n FROM enrollments WHERE class_id=? AND ended_at IS NULL",
      [c.id],
    );
    if (Number(members.n) > d.capacity)
      throw new AppError("Sĩ số tối đa nhỏ hơn số học sinh hiện tại.");
    const sessions = await query(
      "SELECT * FROM sessions WHERE class_id=? AND status='scheduled'",
      [c.id],
    );
    for (const s of sessions)
      await conflict(
        a,
        { ...c, room: d.room },
        s.date,
        s.start_time,
        s.end_time,
        s.id,
      );
    await query(
      "UPDATE classes SET name=?,subject=?,level=?,room=?,capacity=? WHERE id=?",
      [d.name, d.subject, d.level, d.room, d.capacity, c.id],
    );
    await audit(a, "class.update", "class", c.id);
    return { ok: true };
  });
}
