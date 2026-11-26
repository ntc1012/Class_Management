import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initialize, one, query, now, closeDatabase } from "../src/lib/db";
import {
  createClass,
  assignClass,
  createStudent,
  enroll,
  createSchedule,
  createAssignment,
  generateInvoices,
} from "../src/lib/service";
import { classAccess, studentAccess } from "../src/lib/policy";
import { snapshot } from "../src/lib/snapshot";
import type { Actor } from "../src/lib/types";
import { localDate } from "../src/lib/rules";
Object.assign(process.env, {
  NODE_ENV: "test",
  SQLITE_PATH: `./data/class-assignment-${randomUUID()}.sqlite`,
});
delete process.env.DATABASE_URL;
const admin: Actor = {
  id: "admin",
  center_id: "center",
  role: "owner",
  name: "Admin",
  email: "admin@test.invalid",
};
const teacher: Actor = {
  id: "teacher",
  center_id: "center",
  role: "teacher",
  name: "Teacher A",
  email: "a@test.invalid",
};
const nextTeacher: Actor = {
  id: "next",
  center_id: "center",
  role: "teacher",
  name: "Teacher B",
  email: "b@test.invalid",
};
const external: Actor = {
  id: "external",
  center_id: "other",
  role: "teacher",
  name: "Other",
  email: "other@test.invalid",
};
let classId: string, studentId: string;
describe("Admin creates and assigns classes", { concurrency: false }, () => {
  before(async () => {
    await initialize();
    for (const id of ["center", "other"])
      await query("INSERT INTO centers(id,name,created_at) VALUES(?,?,?)", [
        id,
        id,
        now(),
      ]);
    for (const a of [admin, teacher, nextTeacher, external])
      await query(
        "INSERT INTO users(id,center_id,name,email,role,created_at) VALUES(?,?,?,?,?,?)",
        [a.id, a.center_id, a.name, a.email, a.role, now()],
      );
  });
  it("creates an unassigned class without making admin its teacher", async () => {
    const c = await createClass(admin, {
      name: "Admin class",
      subject: "Math",
    });
    classId = c.id;
    assert.equal(c.class.teacher_id, null);
    assert.equal(c.class.created_by, admin.id);
    assert.equal(c.class.teacher_name, "Chưa phân công");
    assert.ok((await snapshot(admin)).classes.some((c) => c.id === classId));
    assert.ok(!(await snapshot(teacher)).classes.some((c) => c.id === classId));
    assert.ok(
      (await snapshot(admin)).teachers.every((t) => t.role === "teacher"),
    );
  });
  it("does not accept admin or a teacher from another center as the assigned teacher", async () => {
    await assert.rejects(
      assignClass(admin, { class_id: classId, teacher_id: admin.id }),
      /Giáo viên không hợp lệ/,
    );
    await assert.rejects(
      assignClass(admin, { class_id: classId, teacher_id: external.id }),
      /Giáo viên không hợp lệ/,
    );
    await assert.rejects(
      assignClass(teacher, { class_id: classId, teacher_id: teacher.id }),
      /chủ trung tâm/,
    );
  });
  it("allows admin to prepare a student roster before assigning the class", async () => {
    const s = await createStudent(admin, { name: "Center student" });
    studentId = s.id;
    await enroll(admin, { class_id: classId, student_id: studentId });
    assert.equal(
      Number(
        (await snapshot(admin)).classes.find((c) => c.id === classId)!
          .student_count,
      ),
      1,
    );
    await assert.rejects(studentAccess(teacher, studentId), /Không tìm thấy/);
  });
  it("requires assignment before creating a schedule or homework", async () => {
    const day = localDate();
    await assert.rejects(
      createSchedule(admin, {
        class_id: classId,
        weekday: new Date(day + "T12:00Z").getUTCDay(),
        start_date: day,
        end_date: day,
        start_time: "10:00",
        end_time: "11:00",
      }),
      /phân công/,
    );
    await assert.rejects(
      createAssignment(admin, {
        class_id: classId,
        title: "Homework",
        due_at: new Date(Date.now() + 86400000).toISOString(),
      }),
      /phân công/,
    );
  });
  it("shows the class and center-managed enrolled students to the assigned teacher", async () => {
    const result = await assignClass(admin, {
      class_id: classId,
      teacher_id: teacher.id,
    });
    assert.equal(result.class!.teacher_id, teacher.id);
    const visible = await snapshot(teacher);
    assert.ok(visible.classes.some((c) => c.id === classId));
    assert.ok(visible.students.some((s) => s.id === studentId));
    assert.equal((await studentAccess(teacher, studentId)).id, studentId);
    await assert.rejects(classAccess(nextTeacher, classId), /không được/);
    await assert.rejects(classAccess(external, classId), /Không tìm/);
  });
  it("keeps the completed teaching identity and existing invoices when reassigning", async () => {
    await query(
      "INSERT INTO sessions(id,center_id,class_id,teacher_id,original_date,date,start_time,end_time,fee,status,locked_at) VALUES('completed','center',?,'teacher','2020-01-03','2020-01-03','10:00','11:00',50000,'locked',?)",
      [classId, now()],
    );
    await query(
      "INSERT INTO sessions(id,center_id,class_id,teacher_id,original_date,date,start_time,end_time,fee) VALUES('future','center',?,'teacher','2030-01-03','2030-01-03','10:00','11:00',50000)",
      [classId],
    );
    await query(
      "INSERT INTO attendance(id,center_id,session_id,student_id,status,marked_by,marked_at) VALUES('att','center','completed',?,'present','teacher',?)",
      [studentId, now()],
    );
    await assignClass(admin, { class_id: classId, teacher_id: nextTeacher.id });
    assert.equal(
      (await one("SELECT * FROM sessions WHERE id='completed'")).teacher_id,
      teacher.id,
    );
    assert.equal(
      (await one("SELECT * FROM sessions WHERE id='future'")).teacher_id,
      nextTeacher.id,
    );
    const invoices = await generateInvoices(teacher, { period: "2020-01" });
    assert.equal(invoices.count, 1);
    assert.equal(
      (await one("SELECT * FROM invoices WHERE student_id=?", [studentId]))
        .teacher_id,
      teacher.id,
    );
    await assert.rejects(classAccess(teacher, classId), /không được/);
    assert.equal((await classAccess(nextTeacher, classId)).id, classId);
  });
  it("rejects assignments that conflict with the new teacher schedule", async () => {
    const otherClass = await createClass(teacher, {
      name: "Busy class",
      subject: "Math",
      room: "Other room",
    });
    await query(
      "INSERT INTO sessions(id,center_id,class_id,teacher_id,original_date,date,start_time,end_time,fee) VALUES('busy','center',?,'teacher','2030-01-03','2030-01-03','10:00','11:00',50000)",
      [otherClass.id],
    );
    await assert.rejects(
      assignClass(admin, { class_id: classId, teacher_id: teacher.id }),
      /Trùng lịch/,
    );
    assert.equal(
      (await one("SELECT * FROM classes WHERE id=?", [classId])).teacher_id,
      nextTeacher.id,
    );
  });
  it("can remove a teaching assignment without deleting class or payment history", async () => {
    await assignClass(admin, { class_id: classId, teacher_id: null });
    assert.equal(
      (await one("SELECT * FROM classes WHERE id=?", [classId])).teacher_id,
      null,
    );
    assert.equal(
      (await one("SELECT * FROM sessions WHERE id='completed'")).teacher_id,
      teacher.id,
    );
    assert.equal(
      (await one("SELECT * FROM sessions WHERE id='future'")).teacher_id,
      null,
    );
    assert.equal(
      (await one("SELECT * FROM invoices WHERE student_id=?", [studentId]))
        .amount,
      50000,
    );
  });
  it("migrates legacy admin-owned classes to unassigned while keeping locked history", async () => {
    await query(
      "INSERT INTO classes(id,center_id,teacher_id,name,subject,created_at) VALUES('legacy','center','admin','Legacy admin class','Math',?)",
      [now()],
    );
    await query(
      "INSERT INTO sessions(id,center_id,class_id,original_date,date,start_time,end_time,fee,status) VALUES('legacy-done','center','legacy','2020-02-03','2020-02-03','10:00','11:00',50000,'locked')",
    );
    await query(
      "INSERT INTO sessions(id,center_id,class_id,original_date,date,start_time,end_time,fee) VALUES('legacy-next','center','legacy','2031-02-03','2031-02-03','10:00','11:00',50000)",
    );
    await query(
      "UPDATE app_bootstrap SET completed_at=NULL WHERE id='class-assignment-v1'",
    );
    await closeDatabase();
    await initialize();
    const c = await one("SELECT * FROM classes WHERE id='legacy'");
    assert.equal(c.teacher_id, null);
    assert.equal(c.created_by, admin.id);
    assert.equal(
      (await one("SELECT * FROM sessions WHERE id='legacy-done'")).teacher_id,
      admin.id,
    );
    assert.equal(
      (await one("SELECT * FROM sessions WHERE id='legacy-next'")).teacher_id,
      null,
    );
    assert.equal(
      (await one("SELECT * FROM invoices WHERE student_id=?", [studentId]))
        .amount,
      50000,
    );
  });
});
