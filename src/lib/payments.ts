import { randomInt } from "node:crypto";
import { PayOS, type Webhook } from "@payos/node";
import QRCode from "qrcode";
import { one, query, transaction, lock, now } from "./db";
import { decrypt } from "./security";
import { invoiceAccess, owner, staff } from "./policy";
import { invoiceTotals, audit, id, notify } from "./service";
import { AppError, type Actor } from "./types";
export const isDemo = () =>
  process.env.PAYMENT_MODE !== "live" &&
  (process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_LOCAL_PRODUCTION === "1");
async function provider(teacherId: string) {
  const account = await one("SELECT * FROM bank_accounts WHERE teacher_id=?", [
    teacherId,
  ]);
  if (!account?.credentials)
    throw new AppError("Giáo viên chưa kết nối kênh thanh toán payOS.");
  return { account, client: new PayOS(decrypt(account.credentials)) };
}
export async function checkout(a: Actor, invoiceId: string) {
  const invoice = await invoiceAccess(a, invoiceId);
  const request = await transaction(async () => {
    await lock("SELECT id FROM invoices WHERE id=?", [invoice.id]);
    const totals = await invoiceTotals(invoice.id);
    if (totals.balance <= 0)
      throw new AppError("Khoản học phí đã thanh toán đủ.");
    const mode = isDemo() ? "demo" : "payos";
    const existing = await one(
      "SELECT * FROM payment_requests WHERE invoice_id=? AND status='pending' AND mode=? ORDER BY created_at DESC LIMIT 1",
      [invoice.id, mode],
    );
    if (
      existing?.amount === totals.balance &&
      (existing.qr_data || existing.provider_id)
    )
      return existing;
    if (existing)
      await query(
        "UPDATE payment_requests SET status='superseded' WHERE id=?",
        [existing.id],
      );
    const requestId = id(),
      orderCode = Date.now() * 100 + randomInt(0, 100);
    await query(
      "INSERT INTO payment_requests(id,center_id,invoice_id,teacher_id,order_code,amount,mode,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
      [
        requestId,
        a.center_id,
        invoice.id,
        invoice.teacher_id,
        orderCode,
        totals.balance,
        mode,
        "creating",
        now(),
      ],
    );
    return (await one("SELECT * FROM payment_requests WHERE id=?", [
      requestId,
    ]))!;
  });
  if (request.status === "creating") {
    try {
      if (request.mode === "demo") {
        await query(
          "UPDATE payment_requests SET status='pending',qr_data=? WHERE id=?",
          [`CLASSFLOW-DEMO:${request.id}:${request.amount}`, request.id],
        );
      } else {
        if (!process.env.APP_URL?.startsWith("https://"))
          throw new AppError("Thanh toán thật cần APP_URL HTTPS công khai.");
        const { client, account } = await provider(invoice.teacher_id);
        if (!account.verified_at)
          throw new AppError(
            "Giáo viên cần xác minh tài khoản và đăng ký webhook trong Cài đặt trước khi tạo QR thật.",
          );
        await query(
          "UPDATE payment_requests SET provider_credentials=? WHERE id=?",
          [account.credentials, request.id],
        );
        const result = await client.paymentRequests.create({
          orderCode: Number(request.order_code),
          amount: Number(request.amount),
          description: `HP${String(request.order_code).slice(-7)}`,
          returnUrl: `${process.env.APP_URL}/?payment=return`,
          cancelUrl: `${process.env.APP_URL}/?payment=cancel`,
        });
        await query(
          "UPDATE payment_requests SET status=CASE WHEN status='creating' THEN 'pending' ELSE status END,checkout_url=?,qr_data=?,provider_id=?,provider_account=? WHERE id=?",
          [
            result.checkoutUrl,
            result.qrCode,
            result.paymentLinkId,
            result.accountNumber,
            request.id,
          ],
        );
      }
    } catch (e) {
      await query("UPDATE payment_requests SET status='failed' WHERE id=?", [
        request.id,
      ]);
      throw e;
    }
  }
  const fresh = await one("SELECT * FROM payment_requests WHERE id=?", [
    request.id,
  ]);
  await audit(a, "payment.request", "invoice", invoice.id, {
    request_id: request.id,
    mode: request.mode,
  });
  const { provider_credentials: _secret, ...publicRequest } = fresh;
  return {
    ...publicRequest,
    qr_image: await QRCode.toDataURL(fresh.qr_data, { width: 320, margin: 2 }),
    demo: request.mode === "demo",
  };
}
export async function recordPayment(
  requestId: string,
  transactionId: string,
  amount: number,
  providerName: string,
  paidAt: string,
  allowReview = false,
) {
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    !transactionId ||
    transactionId.length > 200
  )
    throw new AppError("Giao dịch không hợp lệ.");
  return transaction(async () => {
    const req = await lock("SELECT * FROM payment_requests WHERE id=?", [
      requestId,
    ]);
    if (!req || req.mode !== providerName)
      throw new AppError("Không tìm thấy yêu cầu thanh toán hợp lệ.");
    await lock("SELECT id FROM invoices WHERE id=?", [req.invoice_id]);
    const existing = await one(
      "SELECT * FROM payments WHERE provider=? AND transaction_id=?",
      [providerName, transactionId],
    );
    if (existing) {
      if (
        existing.request_id !== requestId ||
        Number(existing.amount) !== amount
      )
        throw new AppError("Mã giao dịch đã được sử dụng cho khoản khác.", 409);
      return { duplicate: true };
    }
    const prior = await one(
      "SELECT COALESCE(SUM(amount),0) n FROM payments WHERE request_id=?",
      [requestId],
    );
    const totals = await invoiceTotals(req.invoice_id);
    const suspicious =
      Number(prior.n) + amount > Number(req.amount) || amount > totals.balance;
    const status = suspicious && !allowReview ? "review" : "accepted";
    await query(
      "INSERT INTO payment_events(id,center_id,request_id,provider,transaction_id,amount,status,note,created_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(provider,transaction_id) DO NOTHING",
      [
        id(),
        req.center_id,
        req.id,
        providerName,
        transactionId,
        amount,
        status,
        suspicious ? "Số tiền vượt yêu cầu; cần đối soát" : "Đã xác minh",
        now(),
      ],
    );
    if (status === "review") return { review: true };
    await query(
      "INSERT INTO payments(id,center_id,invoice_id,request_id,provider,transaction_id,amount,paid_at) VALUES(?,?,?,?,?,?,?,?)",
      [
        id(),
        req.center_id,
        req.invoice_id,
        req.id,
        providerName,
        transactionId,
        amount,
        paidAt,
      ],
    );
    await query(
      "UPDATE payment_events SET status='accepted' WHERE provider=? AND transaction_id=?",
      [providerName, transactionId],
    );
    await query("UPDATE payment_requests SET status=? WHERE id=?", [
      Number(prior.n) + amount >= Number(req.amount) ? "paid" : "pending",
      req.id,
    ]);
    const inv = await one(
      "SELECT i.*,s.user_id FROM invoices i JOIN students s ON s.id=i.student_id WHERE i.id=?",
      [req.invoice_id],
    );
    const systemActor: Actor = {
      id: "payment-system",
      center_id: req.center_id,
      name: "Thanh toán",
      role: "owner",
      email: "",
    };
    await audit(systemActor, "payment.received", "invoice", req.invoice_id, {
      transaction_id: transactionId,
      amount,
      provider: providerName,
    });
    if (inv.user_id)
      await notify(
        systemActor,
        inv.user_id,
        "Đã nhận học phí",
        `Đã nhận ${amount.toLocaleString("vi-VN")}đ cho tháng ${inv.period}.`,
      );
    await notify(
      systemActor,
      req.teacher_id,
      "Đã nhận học phí",
      `${amount.toLocaleString("vi-VN")}đ · tháng ${inv.period}`,
    );
    return { ok: true };
  });
}
export async function webhook(teacherId: string, body: Webhook) {
  const orderCode = body?.data?.orderCode;
  const req = Number.isSafeInteger(orderCode)
    ? await one(
        "SELECT * FROM payment_requests WHERE order_code=? AND teacher_id=? AND mode='payos'",
        [orderCode, teacherId],
      )
    : undefined;
  const current = await one(
    "SELECT account_number FROM bank_accounts WHERE teacher_id=?",
    [teacherId],
  );
  const client = req?.provider_credentials
    ? new PayOS(decrypt(req.provider_credentials))
    : (await provider(teacherId)).client;
  let data;
  try {
    data = await client.webhooks.verify(body);
  } catch {
    throw new AppError("Chữ ký thanh toán không hợp lệ.", 401);
  }
  if (data.code !== "00") return { received: true };
  // payOS sends a signed sample during webhook registration; unknown orders cannot change records.
  if (!req) return { received: true, matched: false };
  if (
    data.accountNumber !== (req.provider_account || current?.account_number) ||
    data.currency !== "VND" ||
    (req.provider_id && data.paymentLinkId !== req.provider_id)
  )
    throw new AppError("Thông tin người nhận không khớp.");
  const paidAt = new Date(
    data.transactionDateTime.includes("T")
      ? data.transactionDateTime
      : data.transactionDateTime.replace(" ", "T") + "+07:00",
  );
  if (Number.isNaN(+paidAt))
    throw new AppError("Thời gian giao dịch không hợp lệ.");
  return recordPayment(
    req.id,
    data.reference,
    Number(data.amount),
    "payos",
    paidAt.toISOString(),
  );
}
export async function simulatePayment(a: Actor, requestId: string) {
  staff(a);
  if (!isDemo())
    throw new AppError("Mô phỏng bị tắt trên môi trường thanh toán thật.", 403);
  const req = await one(
    "SELECT * FROM payment_requests WHERE id=? AND mode='demo'",
    [requestId],
  );
  if (!req) throw new AppError("Không tìm thấy yêu cầu mô phỏng.");
  await invoiceAccess(a, req.invoice_id);
  return recordPayment(
    req.id,
    `DEMO-${req.id}`,
    Number(req.amount),
    "demo",
    now(),
  );
}
export async function reconcile(a: Actor, invoiceId: string) {
  await invoiceAccess(a, invoiceId);
  const requests = await query(
    "SELECT * FROM payment_requests WHERE invoice_id=? AND mode='payos' AND status NOT IN ('failed','creating')",
    [invoiceId],
  );
  let count = 0;
  for (const req of requests) {
    const client = req.provider_credentials
      ? new PayOS(decrypt(req.provider_credentials))
      : (await provider(req.teacher_id)).client;
    const result = await client.paymentRequests.get(Number(req.order_code));
    for (const t of result.transactions) {
      const at = new Date(
        t.transactionDateTime.includes("T")
          ? t.transactionDateTime
          : t.transactionDateTime.replace(" ", "T") + "+07:00",
      );
      await recordPayment(
        req.id,
        t.reference,
        Number(t.amount),
        "payos",
        Number.isNaN(+at) ? now() : at.toISOString(),
      );
      count++;
    }
  }
  return { count };
}
export async function acceptReview(a: Actor, eventId: string) {
  owner(a);
  const event = await one(
    "SELECT * FROM payment_events WHERE id=? AND center_id=? AND status='review'",
    [eventId, a.center_id],
  );
  if (!event) throw new AppError("Không tìm thấy giao dịch cần đối soát.");
  await audit(a, "payment.review.accept", "payment_event", event.id);
  return recordPayment(
    event.request_id,
    event.transaction_id,
    Number(event.amount),
    event.provider,
    event.created_at,
    true,
  );
}
export async function connectWebhook(a: Actor) {
  staff(a);
  const { client, account } = await provider(a.id);
  if (!process.env.APP_URL?.startsWith("https://"))
    throw new AppError("Cần APP_URL HTTPS công khai.");
  const result = await client.webhooks.confirm(
    `${process.env.APP_URL}/api/payments/webhook/${a.id}`,
  );
  if (result.accountNumber !== account.account_number)
    throw new AppError(
      "Tài khoản chính của kênh payOS không khớp tài khoản đã cấu hình.",
    );
  await query("UPDATE bank_accounts SET verified_at=? WHERE teacher_id=?", [
    now(),
    a.id,
  ]);
  await audit(a, "payment.webhook.connect", "teacher", a.id);
  return { ok: true, account_number: result.accountNumber };
}
