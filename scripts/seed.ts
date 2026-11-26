import { randomUUID } from "node:crypto";
import {
  initialize,
  query,
  one,
  transaction,
  now,
  closeDatabase,
} from "../src/lib/db";
import { hashPassword } from "../src/lib/security";
import { localDate } from "../src/lib/rules";
async function main() {
  if (
    process.env.NODE_ENV === "production" &&
    !process.env.ALLOW_LOCAL_PRODUCTION
  )
    throw new Error("Demo seed is disabled in production");
  await initialize();
  if (await one("SELECT id FROM centers WHERE id='demo-center'")) {
    console.log("Demo data already exists.");
    return;
  }
  await transaction(async () => {
    const stamp = now(),
      password = hashPassword("ClassFlow!2026"),
      day = localDate(),
      [year, month] = day.split("-").map(Number),
      previous = new Date(Date.UTC(year, month - 2, 1))
        .toISOString()
        .slice(0, 7);
    for (const [cid, name] of [
      ["demo-center", "Lớp học Hạnh Phúc"],
      ["other-center", "Trung tâm kiểm thử cách ly"],
    ])
      await query("INSERT INTO centers(id,name,created_at) VALUES(?,?,?)", [
        cid,
        name,
        stamp,
      ]);
    const users = [
      [
        "owner",
        "demo-center",
        "admin@classflow.local",
        "Nguyễn Thu Hà",
        "owner",
      ],
      [
        "teacher-linh",
        "demo-center",
        "linh@classflow.local",
        "Trần Khánh Linh",
        "teacher",
      ],
      [
        "teacher-minh",
        "demo-center",
        "minh@classflow.local",
        "Lê Hoàng Minh",
        "teacher",
      ],
      [
        "other-teacher",
        "other-center",
        "other@classflow.local",
        "Giáo viên trung tâm khác",
        "teacher",
      ],
    ];
    for (const [uid, cid, email, name, role] of users)
      await query(
        "INSERT INTO users(id,center_id,email,name,role,password_hash,created_at) VALUES(?,?,?,?,?,?,?)",
        [uid, cid, email, name, role, password, stamp],
      );
    const studentNames = [
      "Nguyễn Minh Anh",
      "Trần Gia Bảo",
      "Lê Ngọc Hà",
      "Phạm Đức Huy",
      "Hoàng Thảo Nhi",
      "Vũ Tuấn Kiệt",
      "Đặng Hải Yến",
      "Bùi Khánh An",
      "Đỗ Nhật Nam",
      "Nguyễn Hà My",
      "Trần Quang Huy",
      "Phan Bảo Ngọc",
    ];
    const joined = new Date(Date.UTC(year, month - 3, 1)).toISOString();
    for (let i = 0; i < studentNames.length; i++) {
      const sid = `student-${i + 1}`,
        uid = `user-student-${i + 1}`,
        teacher = i < 8 ? "teacher-linh" : "teacher-minh";
      await query(
        "INSERT INTO users(id,center_id,email,name,role,password_hash,created_at) VALUES(?,?,?,?,?,?,?)",
        [
          uid,
          "demo-center",
          `hocsinh${i + 1}`,
          studentNames[i],
          "student",
          password,
          joined,
        ],
      );
      await query(
        "INSERT INTO students(id,center_id,teacher_id,user_id,name,school,phone,created_at) VALUES(?,?,?,?,?,?,?,?)",
        [
          sid,
          "demo-center",
          teacher,
          uid,
          studentNames[i],
          i % 2 ? "THCS Nguyễn Du" : "THCS Lê Quý Đôn",
          "0900000000",
          joined,
        ],
      );
    }
    const classes = [
      [
        "class-toan",
        "teacher-linh",
        "Toán 9 · Vững nền tảng",
        "Toán học",
        "Khối 9",
        "Phòng A1",
        20,
      ],
      [
        "class-van",
        "teacher-linh",
        "Ngữ văn 8 · Cảm hứng viết",
        "Ngữ văn",
        "Khối 8",
        "Phòng A2",
        15,
      ],
      [
        "class-anh",
        "teacher-minh",
        "Tiếng Anh 9 · Bứt phá",
        "Tiếng Anh",
        "Khối 9",
        "Phòng A1",
        18,
      ],
    ];
    for (const [cid, teacher, name, subject, level, room, capacity] of classes)
      await query(
        "INSERT INTO classes(id,center_id,teacher_id,name,subject,level,room,capacity,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        [
          cid,
          "demo-center",
          teacher,
          name,
          subject,
          level,
          room,
          capacity,
          joined,
        ],
      );
    await query(
      "INSERT INTO classes(id,center_id,teacher_id,name,subject,room,created_at) VALUES(?,?,?,?,?,?,?)",
      [
        "other-class",
        "other-center",
        "other-teacher",
        "Lớp riêng trung tâm khác",
        "Toán",
        "Phòng B",
        joined,
      ],
    );
    for (let i = 0; i < 12; i++) {
      const classes =
        i < 5 ? ["class-toan"] : i < 8 ? ["class-van"] : ["class-anh"];
      for (const cid of classes)
        await query(
          "INSERT INTO enrollments(id,center_id,class_id,student_id,joined_at) VALUES(?,?,?,?,?)",
          [randomUUID(), "demo-center", cid, `student-${i + 1}`, joined],
        );
    }
    for (const [ci, c] of classes.entries()) {
      const scheduleId = `schedule-${ci}`;
      await query(
        "INSERT INTO schedules(id,center_id,class_id,weekday,start_time,end_time,start_date,end_date) VALUES(?,?,?,?,?,?,?,?)",
        [
          scheduleId,
          "demo-center",
          c[0],
          new Date(day + "T12:00:00Z").getUTCDay(),
          ci === 1 ? "19:30" : "17:30",
          ci === 1 ? "21:00" : "19:00",
          day,
          day,
        ],
      );
      for (let n = 0; n < 5; n++) {
        const dt = new Date(day + "T12:00:00Z");
        dt.setUTCDate(dt.getUTCDate() + n * 7 + (ci === 2 ? 1 : 0));
        const date = dt.toISOString().slice(0, 10);
        await query(
          "INSERT INTO sessions(id,center_id,class_id,schedule_id,original_date,date,start_time,end_time,fee) VALUES(?,?,?,?,?,?,?,?,?)",
          [
            `future-${ci}-${n}`,
            "demo-center",
            c[0],
            scheduleId,
            date,
            date,
            ci === 1 ? "19:30" : "17:30",
            ci === 1 ? "21:00" : "19:00",
            50000,
          ],
        );
      }
      for (let n = 0; n < 4; n++) {
        const date = `${previous}-${String(3 + n * 7).padStart(2, "0")}`,
          sessionId = `past-${ci}-${n}`;
        await query(
          "INSERT INTO sessions(id,center_id,class_id,original_date,date,start_time,end_time,fee,status,locked_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
          [
            sessionId,
            "demo-center",
            c[0],
            date,
            date,
            "17:30",
            "19:00",
            50000,
            "locked",
            stamp,
          ],
        );
        const members = await query(
          "SELECT student_id FROM enrollments WHERE class_id=?",
          [c[0]],
        );
        for (const [index, m] of members.entries())
          await query(
            "INSERT INTO attendance(id,center_id,session_id,student_id,status,marked_by,marked_at) VALUES(?,?,?,?,?,?,?)",
            [
              randomUUID(),
              "demo-center",
              sessionId,
              m.student_id,
              index === 0 && n === 1
                ? "excused"
                : index === 1 && n === 2
                  ? "absent"
                  : "present",
              c[1],
              stamp,
            ],
          );
      }
    }
    const due = new Date(Date.now() + 4 * 86400000).toISOString();
    for (const [i, title] of [
      "Ôn tập phương trình bậc hai",
      "Luyện viết đoạn văn nghị luận",
      "Practice: Present perfect",
    ].entries()) {
      const assignmentId = `assignment-${i}`,
        c = classes[i];
      await query(
        "INSERT INTO assignments(id,center_id,class_id,teacher_id,title,description,due_at,max_score,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        [
          assignmentId,
          "demo-center",
          c[0],
          c[1],
          title,
          "Hoàn thành các bài luyện tập đã học trên lớp. Trình bày rõ cách làm và nộp ảnh hoặc PDF trước hạn.",
          due,
          10,
          stamp,
        ],
      );
      const members = await query(
        "SELECT student_id FROM enrollments WHERE class_id=?",
        [c[0]],
      );
      for (const m of members)
        await query(
          "INSERT INTO assignment_targets(assignment_id,student_id) VALUES(?,?)",
          [assignmentId, m.student_id],
        );
    }
    await query(
      "INSERT INTO submissions(id,center_id,assignment_id,student_id,version,body,submitted_at,score,feedback,graded_by,graded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      [
        "demo-submission",
        "demo-center",
        "assignment-0",
        "student-1",
        1,
        "Em đã hoàn thành phần ôn tập phương trình bậc hai. Phương trình x² - 5x + 6 = 0 có nghiệm x = 2 hoặc x = 3.",
        stamp,
        9,
        "Bài làm tốt, em chú ý trình bày điều kiện rõ hơn.",
        "teacher-linh",
        stamp,
      ],
    );
    for (const [teacher, bank, number, name] of [
      ["teacher-linh", "Techcombank", "000000000001", "TRAN KHANH LINH"],
      ["teacher-minh", "Agribank", "000000000002", "LE HOANG MINH"],
    ])
      await query(
        "INSERT INTO bank_accounts(teacher_id,center_id,bank,account_number,account_name,updated_at) VALUES(?,?,?,?,?,?)",
        [teacher, "demo-center", bank, number, name, stamp],
      );
  });
  const { generateInvoices } = await import("../src/lib/service");
  const { recordPayment } = await import("../src/lib/payments");
  const [y, m] = localDate().split("-").map(Number);
  const period = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  for (const uid of ["teacher-linh", "teacher-minh"])
    await generateInvoices(
      (await one("SELECT * FROM users WHERE id=?", [uid])) as any,
      { period },
    );
  const invoices = await query("SELECT * FROM invoices ORDER BY student_id");
  for (const [i, inv] of invoices.entries())
    if (i % 3 !== 2) {
      const requestId = `seed-request-${i}`,
        amount = i % 3 === 1 ? 50000 : Number(inv.amount);
      await query(
        "INSERT INTO payment_requests(id,center_id,invoice_id,teacher_id,order_code,amount,mode,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        [
          requestId,
          inv.center_id,
          inv.id,
          inv.teacher_id,
          1000 + i,
          inv.amount,
          "demo",
          "pending",
          now(),
        ],
      );
      await recordPayment(requestId, `DEMO-SEED-${i}`, amount, "demo", now());
    }
  console.log(
    "Demo ready. Admin: admin@classflow.local | Teacher: linh@classflow.local | Student: hocsinh1",
  );
  console.log("Demo password: ClassFlow!2026");
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
