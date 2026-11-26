// Run against an already running, seeded local app: node tests/http.integration.mjs
import assert from "node:assert/strict";
const base = process.env.TEST_URL || "http://127.0.0.1:3000";
async function login(email) {
  const r = await fetch(base + "/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ email, password: "ClassFlow!2026" }),
  });
  assert.equal(r.status, 200, await r.text());
  return r.headers.get("set-cookie").split(";")[0];
}
const teacher = await login("linh@classflow.local"),
  other = await login("minh@classflow.local"),
  student = await login("hocsinh1");
async function data(cookie) {
  const r = await fetch(base + "/api/data", { headers: { Cookie: cookie } });
  assert.equal(r.status, 200);
  return r.json();
}
async function action(cookie, body, origin = base) {
  const r = await fetch(base + "/api/actions", {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: origin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}
const t = await data(teacher),
  o = await data(other),
  s = await data(student);
assert.ok(
  t.demo && t.center.id === "demo-center",
  "Only run HTTP tests against seeded demo data.",
);
assert.ok(t.classes.length > 0);
assert.ok(t.classes.every((c) => c.teacher_id === "teacher-linh"));
assert.ok(o.classes.every((c) => c.teacher_id === "teacher-minh"));
assert.equal(s.students.length, 1);
assert.ok(!s.teachers.length && !s.banks.length && !s.audit_logs.length);
assert.ok(s.submissions.every((x) => x.student_id === s.students[0].id));
assert.equal((await fetch(base + "/api/data")).status, 401);
assert.equal(
  (
    await action(
      teacher,
      { action: "class.create", name: "CSRF", subject: "Test" },
      "https://evil.example",
    )
  ).status,
  403,
);
assert.equal(
  (
    await action(other, {
      action: "class.enroll",
      class_id: t.classes[0].id,
      student_id: o.students[0].id,
    })
  ).status,
  403,
);
assert.equal(
  (
    await action(student, {
      action: "class.create",
      name: "Forbidden",
      subject: "Test",
    })
  ).status,
  403,
);
const invoice = t.invoices.find((i) => i.balance > 0);
if (invoice) {
  const payment = await action(teacher, {
    action: "payment.checkout",
    invoice_id: invoice.id,
  });
  assert.equal(payment.status, 200, JSON.stringify(payment));
  assert.equal(payment.data.demo, true);
  assert.ok(payment.data.qr_image.startsWith("data:image/png"));
  const first = await action(teacher, {
    action: "payment.simulate",
    request_id: payment.data.id,
  });
  assert.equal(first.status, 200);
  const second = await action(teacher, {
    action: "payment.simulate",
    request_id: payment.data.id,
  });
  assert.equal(second.status, 200);
  assert.equal(second.data.duplicate, true);
  const after = await data(teacher);
  assert.equal(after.invoices.find((i) => i.id === invoice.id).balance, 0);
} else {
  const previous = t.payments.find(
    (p) => p.transaction_id === "DEMO-" + p.request_id,
  );
  assert.ok(previous, "Seeded demo needs at least one simulated payment");
  assert.equal(
    (
      await action(teacher, {
        action: "payment.checkout",
        invoice_id: previous.invoice_id,
      })
    ).status,
    400,
  );
  const repeated = await action(teacher, {
    action: "payment.simulate",
    request_id: previous.request_id,
  });
  assert.equal(repeated.status, 200);
  assert.equal(repeated.data.duplicate, true);
}
const assignment = s.assignments.find(
  (a) => !a.closed_at && Date.parse(a.due_at) > Date.now(),
);
assert.ok(assignment, "Seed must include an open student assignment");
const submitted = await action(student, {
  action: "submission.create",
  assignment_id: assignment.id,
  body: "HTTP integration test submission",
});
assert.equal(submitted.status, 200, JSON.stringify(submitted));
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=",
  "base64",
);
const form = new FormData();
form.set("assignment_id", assignment.id);
form.set("submission_id", submitted.data.id);
form.set(
  "file",
  new File([png], "integration-test.png", { type: "image/png" }),
);
const uploaded = await fetch(base + "/api/files", {
  method: "POST",
  headers: { Cookie: student, Origin: base },
  body: form,
});
assert.equal(uploaded.status, 200, await uploaded.clone().text());
const uploadedFile = await uploaded.json();
const ownFile = await fetch(base + "/api/files/" + uploadedFile.id, {
  headers: { Cookie: student },
});
assert.equal(ownFile.status, 200);
assert.equal(ownFile.headers.get("content-type"), "image/png");
assert.deepEqual(Buffer.from(await ownFile.arrayBuffer()), png);
assert.equal(
  (
    await fetch(base + "/api/files/" + uploadedFile.id, {
      headers: { Cookie: other },
    })
  ).status,
  403,
);
const report = await fetch(base + "/api/export", {
  headers: { Cookie: teacher },
});
assert.equal(report.status, 200);
assert.ok((await report.text()).includes("Học sinh"));
assert.equal(
  (await fetch(base + "/api/export", { headers: { Cookie: student } })).status,
  403,
);
assert.equal((await fetch(base + "/api/cron")).status, 401);
const hook = await fetch(base + "/api/payments/webhook/teacher-linh", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ data: { orderCode: 123 }, signature: "fake" }),
});
assert.notEqual(hook.status, 200);
const page = await fetch(base + "/", { headers: { Cookie: teacher } });
assert.equal(page.status, 200);
const html = await page.text();
assert.ok(html.includes("ClassFlow"));
const assets = [
  ...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g),
]
  .map((x) => x[1])
  .filter((x) => x.startsWith("/_next/"));
assert.ok(assets.length > 0, "Page must include application assets");
for (const asset of assets)
  assert.equal(
    (await fetch(base + asset)).status,
    200,
    `Missing asset: ${asset}`,
  );
console.log(
  "HTTP integration passed: authentication, isolation, CSRF, checkout, duplicate payment, submission/upload/download, CSV, protected endpoints and JS/CSS assets.",
);
