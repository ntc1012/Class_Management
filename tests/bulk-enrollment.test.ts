import { before, after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initialize, query, one, now, closeDatabase } from "../src/lib/db";
import {
  createClass,
  createStudent,
  enrollMany,
  createAssignment,
  endEnrollment,
} from "../src/lib/service";
import type { Actor } from "../src/lib/types";
Object.assign(process.env, {
  NODE_ENV: "test",
  SQLITE_PATH: `./data/bulk-enrollment-${randomUUID()}.sqlite`,
});
delete process.env.DATABASE_URL;
const teacher: Actor = {
  id: "teacher",
  center_id: "center",
  role: "teacher",
  name: "Teacher",
  email: "teacher@test.invalid",
};
const other: Actor = {
  ...teacher,
  id: "other",
  center_id: "other-center",
  email: "other@test.invalid",
};
describe("Bulk enrollment", { concurrency: false }, () => {
  let students: string[], external: string;
  before(async () => {
    await initialize();
    for (const a of [teacher, other]) {
      await query("INSERT INTO centers(id,name,created_at) VALUES(?,?,?)", [
        a.center_id,
        a.center_id,
        now(),
      ]);
      await query(
        "INSERT INTO users(id,center_id,name,email,role,created_at) VALUES(?,?,?,?,?,?)",
        [a.id, a.center_id, a.name, a.email, a.role, now()],
      );
    }
    students = [];
    for (const name of ["Student A", "Student B", "Student C"])
      students.push((await createStudent(teacher, { name })).id);
    external = (await createStudent(other, { name: "External" })).id;
  });
  after(async () => {
    await closeDatabase();
  });
  const makeClass = (capacity = 3) =>
    createClass(teacher, { name: "Bulk class", subject: "Math", capacity });
  it("adds several students, deduplicates requests and safely skips existing membership", async () => {
    const c = await makeClass();
    assert.equal(
      (
        await enrollMany(teacher, {
          class_id: c.id,
          student_ids: [students[0], students[1], students[0]],
        })
      ).count,
      2,
    );
    const retry = await enrollMany(teacher, {
      class_id: c.id,
      student_ids: students,
    });
    assert.equal(retry.count, 1);
    assert.equal(retry.skipped, 2);
    assert.equal(
      (
        await one(
          "SELECT COUNT(*) n FROM enrollments WHERE class_id=? AND ended_at IS NULL",
          [c.id],
        )
      ).n,
      3,
    );
  });
  it("leaves the entire class unchanged when capacity is exceeded", async () => {
    const c = await makeClass(1);
    await assert.rejects(
      enrollMany(teacher, { class_id: c.id, student_ids: students }),
    );
    assert.equal(
      (await one("SELECT COUNT(*) n FROM enrollments WHERE class_id=?", [c.id]))
        .n,
      0,
    );
  });
  it("rejects an inaccessible student without inserting the valid students first", async () => {
    const c = await makeClass();
    await assert.rejects(
      enrollMany(teacher, {
        class_id: c.id,
        student_ids: [students[0], external],
      }),
    );
    assert.equal(
      (await one("SELECT COUNT(*) n FROM enrollments WHERE class_id=?", [c.id]))
        .n,
      0,
    );
    await assert.rejects(
      enrollMany(other, { class_id: c.id, student_ids: [external] }),
    );
    await assert.rejects(
      enrollMany(
        { ...teacher, role: "student" },
        { class_id: c.id, student_ids: students },
      ),
    );
  });
  it("requires a nonempty student selection", async () => {
    const c = await makeClass();
    await assert.rejects(
      enrollMany(teacher, { class_id: c.id, student_ids: [] }),
    );
  });
  it("preserves old membership and excludes newly added students from old homework", async () => {
    const c = await makeClass();
    await enrollMany(teacher, { class_id: c.id, student_ids: [students[0]] });
    const assignment = await createAssignment(teacher, {
      class_id: c.id,
      title: "Existing homework",
      description: "",
      due_at: new Date(Date.now() + 86400000).toISOString(),
    });
    await endEnrollment(teacher, { class_id: c.id, student_id: students[0] });
    await enrollMany(teacher, { class_id: c.id, student_ids: students });
    assert.equal(
      (
        await one(
          "SELECT COUNT(*) n FROM enrollments WHERE class_id=? AND student_id=?",
          [c.id, students[0]],
        )
      ).n,
      2,
    );
    assert.equal(
      (
        await one(
          "SELECT COUNT(*) n FROM assignment_targets WHERE assignment_id=?",
          [assignment.id],
        )
      ).n,
      1,
    );
  });
  it("serializes competing batches so they cannot exceed capacity", async () => {
    const c = await makeClass(1);
    const results = await Promise.allSettled(
      students
        .slice(0, 2)
        .map((id) =>
          enrollMany(teacher, { class_id: c.id, student_ids: [id] }),
        ),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      (await one("SELECT COUNT(*) n FROM enrollments WHERE class_id=?", [c.id]))
        .n,
      1,
    );
  });
});
