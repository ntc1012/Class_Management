import { before, after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initialize, query, one, now, closeDatabase } from "../src/lib/db";
import {
  createClass,
  createStudent,
  enrollMany,
  attendanceSave,
  generateInvoices,
  assignClass,
} from "../src/lib/service";
import { snapshot } from "../src/lib/snapshot";
import type { Actor } from "../src/lib/types";
Object.assign(process.env, {
  NODE_ENV: "test",
  SQLITE_PATH: `./data/attendance-workflow-${randomUUID()}.sqlite`,
});
delete process.env.DATABASE_URL;
const teacher: Actor = {
  id: "teacher",
  center_id: "center",
  name: "Teacher",
  email: "teacher@test.invalid",
  role: "teacher",
};
const admin: Actor = {
  ...teacher,
  id: "admin",
  email: "admin@test.invalid",
  role: "owner",
};
describe("Attendance without session locking", { concurrency: false }, () => {
  let students: string[];
  before(async () => {
    await initialize();
    await query("INSERT INTO centers(id,name,created_at) VALUES(?,?,?)", [
      "center",
      "Test",
      now(),
    ]);
    for (const a of [teacher, admin])
      await query(
        "INSERT INTO users(id,center_id,name,email,role,created_at) VALUES(?,?,?,?,?,?)",
        [a.id, a.center_id, a.name, a.email, a.role, now()],
      );
    students = [];
    for (const name of ["A", "B"])
      students.push((await createStudent(teacher, { name })).id);
  });
  after(async () => {
    await closeDatabase();
  });
  async function session(date: string, status = "scheduled") {
    const c = await createClass(teacher, { name: date, subject: "Math" });
    await enrollMany(teacher, { class_id: c.id, student_ids: students });
    await query("UPDATE enrollments SET joined_at=? WHERE class_id=?", [
      "2019-01-01T00:00:00.000Z",
      c.id,
    ]);
    const id = randomUUID();
    await query(
      "INSERT INTO sessions(id,center_id,class_id,teacher_id,original_date,date,start_time,end_time,fee,status) VALUES(?,?,?,?,?,?,?,?,?,?)",
      [
        id,
        "center",
        c.id,
        teacher.id,
        date,
        date,
        "10:00",
        "11:00",
        50000,
        status,
      ],
    );
    return { id, classId: c.id };
  }
  const entries = (status = "present") =>
    students.map((student_id) => ({ student_id, status }));
  it("turns on the saved flag only after a successful full save and permits later edits", async () => {
    const s = await session("2020-01-06");
    assert.equal(
      (await snapshot(teacher)).sessions.find((x) => x.id === s.id)
        ?.attendance_saved,
      0,
    );
    await assert.rejects(
      attendanceSave(teacher, {
        session_id: s.id,
        entries: entries().slice(0, 1),
      }),
    );
    assert.equal(
      (await snapshot(teacher)).sessions.find((x) => x.id === s.id)
        ?.attendance_saved,
      0,
    );
    await attendanceSave(teacher, {
      session_id: s.id,
      entries: entries(),
      lock: true,
    });
    assert.equal(
      (await one("SELECT status FROM sessions WHERE id=?", [s.id])).status,
      "scheduled",
    );
    assert.equal(
      (await snapshot(teacher)).sessions.find((x) => x.id === s.id)
        ?.attendance_saved,
      1,
    );
    await attendanceSave(teacher, {
      session_id: s.id,
      entries: entries("excused"),
    });
    assert.equal(
      (await one("SELECT status FROM attendance WHERE session_id=?", [s.id]))
        .status,
      "excused",
    );
    await assignClass(admin, { class_id: s.classId, teacher_id: null });
    assert.equal(
      (await one("SELECT teacher_id FROM sessions WHERE id=?", [s.id]))
        .teacher_id,
      teacher.id,
    );
  });
  it("permits editing legacy locked sessions, while rejecting cancelled sessions", async () => {
    const legacy = await session("2020-02-03", "locked");
    await attendanceSave(teacher, {
      session_id: legacy.id,
      entries: entries(),
    });
    await attendanceSave(teacher, {
      session_id: legacy.id,
      entries: entries("absent"),
    });
    const cancelled = await session("2020-02-10", "cancelled");
    await assert.rejects(
      attendanceSave(teacher, { session_id: cancelled.id, entries: entries() }),
      /hủy/,
    );
  });
  it("bills complete attendance without locking, rejects missing attendance and preserves billed amounts on edits", async () => {
    const s = await session("2020-03-02");
    await assert.rejects(
      generateInvoices(teacher, { period: "2020-03" }),
      /điểm danh/,
    );
    await attendanceSave(teacher, {
      session_id: s.id,
      entries: [
        { student_id: students[0], status: "present" },
        { student_id: students[1], status: "excused" },
      ],
    });
    assert.equal(
      (await generateInvoices(teacher, { period: "2020-03" })).count,
      2,
    );
    const invoice = await one(
      "SELECT * FROM invoices WHERE period=? AND student_id=?",
      ["2020-03", students[0]],
    );
    assert.equal(invoice.amount, 50000);
    await attendanceSave(teacher, {
      session_id: s.id,
      entries: entries("excused"),
    });
    assert.equal(
      (await one("SELECT amount FROM invoices WHERE id=?", [invoice.id]))
        .amount,
      50000,
    );
    assert.equal(
      (await generateInvoices(teacher, { period: "2020-03" })).count,
      0,
    );
  });
});
