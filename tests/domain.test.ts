import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { initialize, query, one, now } from "../src/lib/db";
import { hashPassword, verifyPassword, activate } from "../src/lib/security";
import { classAccess, assignmentAccess } from "../src/lib/policy";
import {
  sessionCharge,
  assertSubmissionOpen,
  localDate,
} from "../src/lib/rules";
import * as service from "../src/lib/service";
import {
  recordPayment,
  webhook,
  checkout,
  paymentMode,
  isDemo,
} from "../src/lib/payments";
import { snapshot } from "../src/lib/snapshot";
import { upload, download } from "../src/lib/storage";
import type { Actor } from "../src/lib/types";
import { parseStudentsCsv } from "../src/lib/csv";

process.env.SQLITE_PATH = `./data/tests-${randomUUID()}.sqlite`;
Object.assign(process.env, { NODE_ENV: "test" });
delete process.env.DATABASE_URL;
process.env.PAYMENT_MODE = "demo";
const teacher: Actor = {
  id: "t1",
  center_id: "c1",
  role: "teacher",
  name: "Teacher 1",
  email: "t1@test.local",
};
const otherTeacher: Actor = {
  id: "t2",
  center_id: "c1",
  role: "teacher",
  name: "Teacher 2",
  email: "t2@test.local",
};
const outsider: Actor = {
  id: "t3",
  center_id: "c2",
  role: "teacher",
  name: "Teacher 3",
  email: "t3@test.local",
};
const owner: Actor = {
  id: "o1",
  center_id: "c1",
  role: "owner",
  name: "Owner",
  email: "o@test.local",
};
describe("Hosted payment configuration", () => {
  it("supports explicit demo on production without enabling local storage", () => {
    const previous = {
      NODE_ENV: process.env.NODE_ENV,
      PAYMENT_MODE: process.env.PAYMENT_MODE,
      ALLOW_LOCAL_PRODUCTION: process.env.ALLOW_LOCAL_PRODUCTION,
    };
    try {
      Object.assign(process.env, {
        NODE_ENV: "production",
        PAYMENT_MODE: "demo",
      });
      delete process.env.ALLOW_LOCAL_PRODUCTION;
      assert.equal(isDemo(), true);
      assert.equal(paymentMode(), "demo");
      delete process.env.PAYMENT_MODE;
      assert.equal(paymentMode(), "disabled");
      process.env.PAYMENT_MODE = "invalid";
      assert.equal(paymentMode(), "disabled");
      process.env.PAYMENT_MODE = "live";
      assert.equal(isDemo(), false);
      assert.equal(paymentMode(), "live");
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
let classId: string,
  studentId: string,
  student: Actor,
  assignmentId: string,
  invoiceId: string;
describe(
  "ClassFlow business rules and isolation",
  { concurrency: false },
  () => {
    before(async () => {
      await initialize();
      for (const cid of ["c1", "c2"])
        await query("INSERT INTO centers(id,name,created_at) VALUES(?,?,?)", [
          cid,
          cid,
          now(),
        ]);
      for (const a of [teacher, otherTeacher, outsider, owner])
        await query(
          "INSERT INTO users(id,center_id,email,name,role,password_hash,created_at) VALUES(?,?,?,?,?,?,?)",
          [
            a.id,
            a.center_id,
            a.email,
            a.name,
            a.role,
            hashPassword("Password!123"),
            now(),
          ],
        );
      classId = (
        await service.createClass(teacher, {
          name: "Math 9",
          subject: "Math",
          room: "R1",
        })
      ).id;
      const s = await service.createStudent(teacher, {
        name: "Student 1",
        class_id: classId,
      });
      studentId = s.id;
      await query(
        "UPDATE enrollments SET joined_at='2020-01-01T00:00:00.000Z' WHERE student_id=?",
        [studentId],
      );
      const record = await one("SELECT * FROM students WHERE id=?", [
        studentId,
      ]);
      student = {
        id: record.user_id,
        center_id: "c1",
        role: "student",
        name: "Student 1",
        email: s.username,
      };
      await activate(s.activation_code, "Password!123");
      await assert.rejects(
        activate(s.activation_code, "Another!1234"),
        /không hợp lệ/,
      );
    });
    it("password hashing rejects the wrong password", () => {
      const hash = hashPassword("Secret!123");
      assert.ok(verifyPassword("Secret!123", hash));
      assert.equal(verifyPassword("bad", hash), false);
    });
    it("charges present and unexcused, exempts excused, rejects lateness", () => {
      assert.equal(sessionCharge("present", 50000), 50000);
      assert.equal(sessionCharge("absent", 50000), 50000);
      assert.equal(sessionCharge("excused", 50000), 0);
      assert.throws(() => sessionCharge("late", 50000));
    });
    it("denies both another teacher and another center", async () => {
      await assert.rejects(classAccess(otherTeacher, classId), /không được/);
      await assert.rejects(classAccess(outsider, classId), /Không tìm/);
      assert.equal((await classAccess(owner, classId)).id, classId);
    });
    it("does not expose rosters across teachers or tenants", async () => {
      const mine = await snapshot(teacher),
        other = await snapshot(otherTeacher),
        outside = await snapshot(outsider);
      assert.equal(mine.students.length, 1);
      assert.equal(other.students.length, 0);
      assert.equal(outside.classes.length, 0);
      assert.equal((await snapshot(student)).students.length, 1);
    });
    it("rejects duplicate enrollment", async () => {
      await assert.rejects(
        service.enroll(teacher, { class_id: classId, student_id: studentId }),
        /đã có/,
      );
    });
    it("parses quoted CSV and rejects malformed rows", () => {
      const rows = parseStudentsCsv(
        'ho_ten,truong,dien_thoai,ghi_chu\n"Nguyễn, An",School,0900000000,"Line 1\nLine 2"',
      );
      assert.equal(rows[0].name, "Nguyễn, An");
      assert.equal(rows[0].notes, "Line 1\nLine 2");
      assert.throws(() => parseStudentsCsv("bad\nName"), /ho_ten/);
      assert.throws(() => parseStudentsCsv('ho_ten\n"unclosed'), /chưa đóng/);
    });
    it("updates profiles without granting access to another teacher", async () => {
      await service.updateStudent(teacher, {
        student_id: studentId,
        name: "Updated student",
        school: "Updated school",
      });
      assert.equal(
        (await one("SELECT name FROM users WHERE id=?", [student.id])).name,
        "Updated student",
      );
      await assert.rejects(
        service.updateStudent(otherTeacher, {
          student_id: studentId,
          name: "Forged",
        }),
        /Không tìm/,
      );
    });
    it("keeps past enrollment when a student leaves and returns", async () => {
      await service.endEnrollment(teacher, {
        class_id: classId,
        student_id: studentId,
      });
      await service.enroll(teacher, {
        class_id: classId,
        student_id: studentId,
      });
      assert.equal(
        (
          await query("SELECT * FROM enrollments WHERE student_id=?", [
            studentId,
          ])
        ).length,
        2,
      );
      await query(
        "UPDATE enrollments SET joined_at='2020-01-01T00:00:00.000Z' WHERE student_id=? AND ended_at IS NULL",
        [studentId],
      );
    });
    it("detects conflicts and rolls back the entire recurring schedule", async () => {
      const start = localDate(),
        end = new Date(Date.parse(start) + 21 * 86400000)
          .toISOString()
          .slice(0, 10),
        weekday = new Date(start + "T12:00:00Z").getUTCDay();
      const input = {
        class_id: classId,
        start_date: start,
        end_date: end,
        weekday,
        start_time: "18:00",
        end_time: "19:00",
      };
      const made = await service.createSchedule(teacher, input);
      assert.equal(made.count, 4);
      await assert.rejects(
        service.createSchedule(teacher, input),
        /Trùng lịch/,
      );
      assert.equal(
        Number((await one("SELECT COUNT(*) n FROM schedules")).n),
        1,
      );
    });
    it("can move one future session while preserving the others", async () => {
      const sessions = await query("SELECT * FROM sessions ORDER BY date");
      const s = sessions[0],
        day = new Date(Date.parse(s.date) + 86400000)
          .toISOString()
          .slice(0, 10);
      await service.moveSession(teacher, {
        session_id: s.id,
        scope: "single",
        date: day,
        start_time: "18:00",
        end_time: "19:00",
      });
      assert.equal(
        (await one("SELECT * FROM sessions WHERE id=?", [s.id])).date,
        day,
      );
      assert.equal(
        (await one("SELECT * FROM sessions WHERE id=?", [sessions[1].id])).date,
        sessions[1].date,
      );
    });
    it("can move the remainder of a series without creating sessions", async () => {
      const sessions = await query(
          "SELECT * FROM sessions WHERE status='scheduled' ORDER BY date",
        ),
        s = sessions[1];
      const day = new Date(Date.parse(s.date) + 86400000)
        .toISOString()
        .slice(0, 10);
      const result = await service.moveSession(teacher, {
        session_id: s.id,
        scope: "series",
        date: day,
        start_time: "19:00",
        end_time: "20:00",
      });
      assert.equal(result.count, 3);
      assert.equal(Number((await one("SELECT COUNT(*) n FROM sessions")).n), 4);
    });
    it("locks completed attendance, rejects changes and future locking", async () => {
      await query(
        "INSERT INTO sessions(id,center_id,class_id,original_date,date,start_time,end_time,fee) VALUES('past','c1',?,'2020-02-03','2020-02-03','17:00','18:00',50000)",
        [classId],
      );
      await service.attendanceSave(teacher, {
        session_id: "past",
        entries: [{ student_id: studentId, status: "absent" }],
        lock: true,
      });
      await assert.rejects(
        service.attendanceSave(teacher, {
          session_id: "past",
          entries: [{ student_id: studentId, status: "excused" }],
        }),
        /đã khóa/,
      );
      await assert.rejects(
        service.moveSession(teacher, {
          session_id: "past",
          scope: "single",
          date: localDate(),
          start_time: "10:00",
          end_time: "11:00",
        }),
        /chưa học/,
      );
      const future = await one(
        "SELECT * FROM sessions WHERE status='scheduled' ORDER BY date DESC LIMIT 1",
      );
      await assert.rejects(
        service.attendanceSave(teacher, {
          session_id: future.id,
          entries: [{ student_id: studentId, status: "present" }],
          lock: true,
        }),
        /giờ kết thúc/,
      );
    });
    it("creates monthly invoices idempotently from frozen fees", async () => {
      const first = await service.generateInvoices(teacher, {
          period: "2020-02",
        }),
        second = await service.generateInvoices(teacher, { period: "2020-02" });
      assert.equal(first.count, 1);
      assert.equal(second.count, 0);
      const inv = await one("SELECT * FROM invoices");
      invoiceId = inv.id;
      assert.equal(inv.amount, 50000);
      await assert.rejects(
        service.adjustInvoice(teacher, {
          invoice_id: invoiceId,
          amount: -10000,
          reason: "Test reason",
        }),
        /chủ trung tâm/,
      );
      await service.adjustInvoice(owner, {
        invoice_id: invoiceId,
        amount: -10000,
        reason: "Điều chỉnh được duyệt",
      });
      assert.equal((await service.invoiceTotals(invoiceId)).total, 40000);
      assert.equal(
        (await one("SELECT * FROM attendance WHERE session_id='past'")).status,
        "absent",
      );
    });
    it("records partial payments, ignores duplicates and flags excess", async () => {
      await query(
        "INSERT INTO payment_requests(id,center_id,invoice_id,teacher_id,order_code,amount,mode,status,created_at) VALUES('req','c1',?,'t1',123,40000,'demo','pending',?)",
        [invoiceId, now()],
      );
      await recordPayment("req", "txn1", 10000, "demo", now());
      const duplicate = await recordPayment(
        "req",
        "txn1",
        10000,
        "demo",
        now(),
      );
      assert.ok(duplicate.duplicate);
      assert.equal((await service.invoiceTotals(invoiceId)).paid, 10000);
      const review = await recordPayment("req", "txn2", 40000, "demo", now());
      assert.ok(review.review);
      assert.equal((await service.invoiceTotals(invoiceId)).paid, 10000);
      await recordPayment("req", "txn3", 30000, "demo", now());
      assert.equal((await service.invoiceTotals(invoiceId)).status, "paid");
    });
    it("validates payOS signatures, recipient and replay without contacting the bank", async () => {
      process.env.ENCRYPTION_KEY = "a".repeat(64);
      await service.saveBank(teacher, {
        bank: "Techcombank",
        account_number: "12345678",
        account_name: "TEST TEACHER",
        client_id: "test-client",
        api_key: "test-api",
        checksum_key: "test-checksum",
      });
      const inv = "webhook-invoice";
      await query(
        "INSERT INTO invoices(id,center_id,student_id,teacher_id,period,amount,created_at) VALUES(?,?,?,?,?,?,?)",
        [inv, "c1", studentId, "t1", "2020-03", 50000, now()],
      );
      await query(
        "INSERT INTO payment_requests(id,center_id,invoice_id,teacher_id,order_code,amount,mode,status,provider_id,created_at) VALUES('live-req','c1',?,'t1',987,50000,'payos','pending','link-test',?)",
        [inv, now()],
      );
      const bank = await one(
        "SELECT credentials FROM bank_accounts WHERE teacher_id=?",
        [teacher.id],
      );
      await query(
        "UPDATE payment_requests SET provider_account=?,provider_credentials=? WHERE id='live-req'",
        ["99999999", bank.credentials],
      );
      const data = {
        orderCode: 987,
        amount: 50000,
        description: "Test payment",
        accountNumber: "99999999",
        reference: "verified-reference",
        transactionDateTime: "2026-11-26 10:00:00",
        currency: "VND",
        paymentLinkId: "link-test",
        code: "00",
        desc: "success",
      };
      const signature = (v: Record<string, unknown>) =>
        createHmac("sha256", "test-checksum")
          .update(
            Object.keys(v)
              .sort()
              .map((k) => `${k}=${v[k]}`)
              .join("&"),
          )
          .digest("hex");
      await assert.rejects(
        webhook(teacher.id, {
          code: "00",
          desc: "success",
          success: true,
          data,
          signature: "forged",
        }),
        /Chữ ký/,
      );
      const wrong = { ...data, accountNumber: "87654321" };
      await assert.rejects(
        webhook(teacher.id, {
          code: "00",
          desc: "success",
          success: true,
          data: wrong,
          signature: signature(wrong),
        }),
        /người nhận/,
      );
      await webhook(teacher.id, {
        code: "00",
        desc: "success",
        success: true,
        data,
        signature: signature(data),
      });
      await service.saveBank(teacher, {
        bank: "Techcombank",
        account_number: "12345678",
        account_name: "TEST TEACHER",
        client_id: "new-client",
        api_key: "new-api",
        checksum_key: "rotated-checksum",
      });
      const again = await webhook(teacher.id, {
        code: "00",
        desc: "success",
        success: true,
        data,
        signature: signature(data),
      });
      assert.ok("duplicate" in again && again.duplicate);
      assert.equal((await service.invoiceTotals(inv)).paid, 50000);
    });
    it("blocks live checkout until the receiving account is verified", async () => {
      const inv = "unverified-invoice";
      await query(
        "INSERT INTO invoices(id,center_id,student_id,teacher_id,period,amount,created_at) VALUES(?,?,?,?,?,?,?)",
        [inv, "c1", studentId, "t1", "2020-04", 50000, now()],
      );
      const oldUrl = process.env.APP_URL;
      process.env.APP_URL = "https://classflow.example";
      process.env.PAYMENT_MODE = "live";
      try {
        await assert.rejects(checkout(teacher, inv), /xác minh tài khoản/);
      } finally {
        process.env.PAYMENT_MODE = "demo";
        if (oldUrl) process.env.APP_URL = oldUrl;
        else delete process.env.APP_URL;
      }
    });
    it("does not grant old assignments to new students", async () => {
      assignmentId = (
        await service.createAssignment(teacher, {
          class_id: classId,
          title: "Old assignment",
          description: "Homework",
          due_at: new Date(Date.now() + 86400000).toISOString(),
        })
      ).id;
      const newcomer = await service.createStudent(teacher, {
        name: "New student",
        class_id: classId,
      });
      const s = await one("SELECT * FROM students WHERE id=?", [newcomer.id]);
      await assert.rejects(
        assignmentAccess(
          {
            id: s.user_id,
            center_id: "c1",
            name: s.name,
            email: "new",
            role: "student",
          },
          assignmentId,
        ),
        /không được giao/,
      );
    });
    it("keeps all submission versions and blocks submissions after teacher closes", async () => {
      const first = await service.submit(student, {
          assignment_id: assignmentId,
          body: "Version 1",
        }),
        second = await service.submit(student, {
          assignment_id: assignmentId,
          body: "Version 2",
        });
      assert.equal(first.version, 1);
      assert.equal(second.version, 2);
      await service.grade(teacher, {
        submission_id: first.id,
        score: 8,
        feedback: "Good",
      });
      assert.equal(
        (await one("SELECT * FROM submissions WHERE id=?", [first.id])).score,
        8,
      );
      await assert.rejects(
        service.grade(teacher, { submission_id: second.id, score: 11 }),
        /thang điểm/,
      );
      const file = new File([Buffer.from("%PDF-1.4\nTest file")], "test.pdf", {
        type: "application/pdf",
      });
      const f = await upload(student, assignmentId, second.id, file);
      assert.equal((await download(student, f.id)).file.name, "test.pdf");
      await assert.rejects(download(outsider, f.id), /Không tìm/);
      await assert.rejects(
        upload(
          student,
          assignmentId,
          second.id,
          new File(["<script>evil</script>"], "fake.pdf", {
            type: "application/pdf",
          }),
        ),
        /nội dung hợp lệ/,
      );
      await service.closeAssignment(teacher, assignmentId);
      await assert.rejects(
        service.submit(student, { assignment_id: assignmentId, body: "Late" }),
        /đã khóa/,
      );
    });
    it("rejects submissions at and after the deadline", () => {
      assert.throws(() => assertSubmissionOpen("2020-01-01T00:00:00Z", null));
      assert.throws(() =>
        assertSubmissionOpen("2030-01-01T00:00:00Z", "2026-01-01T00:00:00Z"),
      );
    });
    it("prevents students from creating classes or accessing unrelated fees", async () => {
      await assert.rejects(
        service.createClass(student, { name: "Forbidden", subject: "Test" }),
        /không có quyền/,
      );
      await assert.rejects(
        service.adjustInvoice(outsider, {
          invoice_id: invoiceId,
          amount: 1,
          reason: "Forged change",
        }),
        /chủ trung tâm/,
      );
    });
  },
);
