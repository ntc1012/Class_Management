import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { one, query, transaction, lock, now } from "./db";
import { assignmentAccess } from "./policy";
import { assertSubmissionOpen } from "./rules";
import { id, audit } from "./service";
import { AppError, type Actor } from "./types";
function s3() {
  return new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: !!process.env.S3_ENDPOINT,
    credentials: process.env.S3_ACCESS_KEY_ID
      ? {
          accessKeyId: process.env.S3_ACCESS_KEY_ID,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
        }
      : undefined,
  });
}
function localPath(key: string) {
  if (!/^[a-zA-Z0-9/-]+$/.test(key))
    throw new AppError("Đường dẫn không hợp lệ.");
  const dataDirectory = path.dirname(
    path.resolve(process.env.SQLITE_PATH || "data/classflow.sqlite"),
  );
  return path.join(dataDirectory, "uploads", key);
}
async function put(key: string, body: Buffer, mime: string) {
  if (process.env.S3_BUCKET)
    await s3().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: mime,
      }),
    );
  else {
    if (process.env.NODE_ENV !== "test")
      throw new AppError("Chưa cấu hình kho file S3 riêng tư cho ứng dụng.");
    const p = localPath(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, body);
  }
}
function detect(data: Buffer) {
  if (data.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (data[0] === 255 && data[1] === 216 && data[2] === 255)
    return "image/jpeg";
  throw new AppError("Chỉ nhận PDF, PNG hoặc JPEG có nội dung hợp lệ.");
}
export async function upload(
  a: Actor,
  assignmentId: string,
  submissionId: string | null,
  file: File,
) {
  const max = Number(process.env.MAX_FILE_MB || 10) * 1024 * 1024;
  if (file.size < 1 || file.size > max)
    throw new AppError(`File phải từ 1 byte đến ${max / 1024 / 1024} MB.`);
  const assignment = await assignmentAccess(a, assignmentId);
  const data = Buffer.from(await file.arrayBuffer()),
    mime = detect(data),
    fileId = id(),
    key = `${a.center_id}/${fileId}`;
  await put(key, data, mime);
  try {
    return await transaction(async () => {
      await lock("SELECT id FROM users WHERE id=?", [assignment.teacher_id]);
      await lock("SELECT id FROM assignments WHERE id=?", [assignmentId]);
      if (a.role === "student") {
        const latest = await one("SELECT * FROM assignments WHERE id=?", [
          assignmentId,
        ]);
        assertSubmissionOpen(latest.due_at, latest.closed_at);
        const submission = await one(
          "SELECT sub.id FROM submissions sub JOIN students s ON s.id=sub.student_id WHERE sub.id=? AND sub.assignment_id=? AND s.user_id=? AND sub.center_id=?",
          [submissionId, assignmentId, a.id, a.center_id],
        );
        if (!submission)
          throw new AppError("Không tìm thấy bài nộp của bạn.", 403);
      } else if (submissionId)
        throw new AppError("Giáo viên chỉ đính kèm đề bài.");
      const used = await one(
        "SELECT COALESCE(SUM(size),0) n FROM files WHERE teacher_id=?",
        [assignment.teacher_id],
      );
      if (
        Number(used.n) + file.size >
        Number(process.env.TEACHER_STORAGE_MB || 500) * 1024 * 1024
      )
        throw new AppError("Dung lượng lưu trữ của giáo viên đã đầy.");
      const name =
        file.name.replace(/[\x00-\x1f<>:"/\\|?*]/g, "_").slice(0, 160) ||
        "bai-tap";
      await query(
        "INSERT INTO files(id,center_id,assignment_id,submission_id,teacher_id,uploaded_by,name,mime,size,storage_key,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        [
          fileId,
          a.center_id,
          assignmentId,
          submissionId,
          assignment.teacher_id,
          a.id,
          name,
          mime,
          file.size,
          key,
          now(),
        ],
      );
      await audit(a, "file.upload", "file", fileId);
      return { id: fileId };
    });
  } catch (e) {
    if (process.env.S3_BUCKET)
      await s3()
        .send(
          new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
        )
        .catch(() => {});
    else await unlink(localPath(key)).catch(() => {});
    throw e;
  }
}
export async function download(a: Actor, fileId: string) {
  const f = await one("SELECT * FROM files WHERE id=? AND center_id=?", [
    fileId,
    a.center_id,
  ]);
  if (!f) throw new AppError("Không tìm thấy file.", 404);
  await assignmentAccess(a, f.assignment_id);
  if (a.role === "student" && f.submission_id && f.uploaded_by !== a.id)
    throw new AppError("Bạn không có quyền tải bài của học sinh khác.", 403);
  if (!process.env.S3_BUCKET && process.env.NODE_ENV !== "test")
    throw new AppError("Chưa cấu hình kho file S3 riêng tư cho ứng dụng.");
  const data = process.env.S3_BUCKET
    ? await (
        await s3().send(
          new GetObjectCommand({
            Bucket: process.env.S3_BUCKET,
            Key: f.storage_key,
          }),
        )
      ).Body!.transformToByteArray()
    : await readFile(localPath(f.storage_key));
  return { file: f, data };
}
