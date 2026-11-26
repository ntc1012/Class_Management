import { NextResponse } from "next/server";
import { z } from "zod";
import { initialize, query, now } from "@/lib/db";
import { actor, checkOrigin } from "@/lib/security";
import { failure, jsonBody } from "@/lib/http";
import * as service from "@/lib/service";
import {
  checkout,
  simulatePayment,
  reconcile,
  acceptReview,
  connectWebhook,
} from "@/lib/payments";
import { AppError } from "@/lib/types";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    await initialize();
    const a = await actor();
    const body = await jsonBody(request);
    const action = z.string().max(50).parse(body.action);
    let result: unknown;
    switch (action) {
      case "student.create":
        result = await service.createStudent(a, body);
        break;
      case "student.update":
        result = await service.updateStudent(a, body);
        break;
      case "student.import":
        result = await service.importStudents(a, body);
        break;
      case "student.activation":
        result = await service.reissueActivation(
          a,
          z.string().parse(body.student_id),
        );
        break;
      case "class.create":
        result = await service.createClass(a, body);
        break;
      case "class.assign":
        result = await service.assignClass(a, body);
        break;
      case "class.update":
        result = await service.updateClass(a, body);
        break;
      case "class.enroll":
        result = await service.enroll(a, body);
        break;
      case "class.unenroll":
        result = await service.endEnrollment(a, body);
        break;
      case "schedule.create":
        result = await service.createSchedule(a, body);
        break;
      case "session.move":
        result = await service.moveSession(a, body);
        break;
      case "session.cancel":
        result = await service.cancelSession(
          a,
          z.string().parse(body.session_id),
        );
        break;
      case "attendance.save":
        result = await service.attendanceSave(a, body);
        break;
      case "invoice.generate":
        result = await service.generateInvoices(a, body);
        break;
      case "invoice.adjust":
        result = await service.adjustInvoice(a, body);
        break;
      case "assignment.create":
        result = await service.createAssignment(a, body);
        break;
      case "assignment.close":
        result = await service.closeAssignment(
          a,
          z.string().parse(body.assignment_id),
        );
        break;
      case "submission.create":
        result = await service.submit(a, body);
        break;
      case "submission.grade":
        result = await service.grade(a, body);
        break;
      case "bank.save":
        result = await service.saveBank(a, body);
        break;
      case "teacher.create":
        result = await service.createTeacher(a, body);
        break;
      case "teacher.activation":
        result = await service.teacherActivation(
          a,
          z.string().parse(body.teacher_id),
        );
        break;
      case "payment.checkout":
        result = await checkout(a, z.string().parse(body.invoice_id));
        break;
      case "payment.simulate":
        result = await simulatePayment(a, z.string().parse(body.request_id));
        break;
      case "payment.reconcile":
        result = await reconcile(a, z.string().parse(body.invoice_id));
        break;
      case "payment.accept":
        result = await acceptReview(a, z.string().parse(body.event_id));
        break;
      case "payment.connect":
        result = await connectWebhook(a);
        break;
      case "notifications.read":
        await query(
          "UPDATE notifications SET read_at=? WHERE user_id=? AND center_id=? AND read_at IS NULL",
          [now(), a.id, a.center_id],
        );
        result = { ok: true };
        break;
      default:
        throw new AppError("Thao tác không tồn tại.", 404);
    }
    return NextResponse.json(result ?? { ok: true });
  } catch (e) {
    return failure(e);
  }
}
