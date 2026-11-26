"use client";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  LayoutDashboard,
  Users,
  School,
  CalendarDays,
  ClipboardCheck,
  Wallet,
  FileText,
  BarChart3,
  Settings,
  Bell,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  X,
  LogOut,
  Download,
  Check,
  LockKeyhole,
  Clock3,
  MoreHorizontal,
  ArrowUpRight,
  CheckCircle2,
  ShieldCheck,
  History,
  Menu,
  Copy,
  Paperclip,
  Upload,
  RefreshCw,
  GraduationCap,
  CreditCard,
  AlertCircle,
} from "lucide-react";
import type { Row } from "@/lib/types";
import StudentPicker from "./student-picker";
import {
  createSnapshotLoader,
  addCreatedClass,
  type SnapshotLoader,
} from "@/lib/client-snapshot";

import {
  accountFetch as scopedFetch,
  accountApiUrl,
  rememberAccount,
  forgetAccount,
  workspacePath,
} from "@/lib/account-context";

type Data = Record<string, any>;
type Dialog = { type: string; item?: Row };
const money = (n: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(
    n,
  );
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const fmt = (s: string) =>
  new Date(s.length === 10 ? s + "T00:00:00+07:00" : s).toLocaleDateString(
    "vi-VN",
    { day: "2-digit", month: "2-digit" },
  );
const fullDate = (s: string) =>
  new Date(s).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
const labels: Record<string, string> = {
  present: "Có mặt",
  excused: "Vắng có phép",
  absent: "Vắng không phép",
  scheduled: "Chưa khóa",
  locked: "Đã khóa",
  cancelled: "Đã hủy",
  paid: "Đã thanh toán",
  unpaid: "Chưa thanh toán",
  partial: "Đã trả một phần",
};
const actionNames: Record<string, string> = {
  "owner.setup": "Thiết lập admin đầu tiên",
  "student.create": "Thêm học sinh",
  "student.update": "Sửa hồ sơ học sinh",
  "student.import": "Nhập danh sách học sinh",
  "class.create": "Tạo lớp",
  "class.update": "Sửa lớp",
  "class.assign": "Phân công giáo viên",
  "class.enroll": "Thêm học sinh vào lớp",
  "class.unenroll": "Cho học sinh nghỉ lớp",
  "schedule.create": "Tạo lịch định kỳ",
  "session.move": "Đổi lịch học",
  "session.cancel": "Hủy buổi học",
  "session.lock": "Khóa buổi học",
  "attendance.save": "Lưu điểm danh",
  "invoice.generate": "Chốt học phí tháng",
  "invoice.adjust": "Điều chỉnh học phí",
  "assignment.create": "Giao bài tập",
  "assignment.close": "Khóa nhận bài",
  "submission.create": "Nộp bài",
  "submission.grade": "Chấm bài",
  "file.upload": "Tải file lên",
  "bank.update": "Cập nhật tài khoản nhận tiền",
  "teacher.create": "Thêm giáo viên",
  "teacher.activation": "Cấp lại mã cho giáo viên",
  "activation.reissue": "Cấp lại mã cho học sinh",
  "payment.request": "Tạo yêu cầu thanh toán",
  "payment.received": "Xác nhận nhận tiền",
  "payment.review.accept": "Xác nhận đối soát",
  "payment.webhook.connect": "Kết nối thông báo thanh toán",
};
const entityNames: Record<string, string> = {
  student: "Học sinh",
  class: "Lớp",
  schedule: "Lịch",
  session: "Buổi học",
  period: "Kỳ thu",
  invoice: "Học phí",
  assignment: "Bài tập",
  submission: "Bài nộp",
  file: "File",
  teacher: "Giáo viên",
  user: "Tài khoản",
  payment_event: "Giao dịch",
};
const nav = [
  { id: "overview", label: "Tổng quan", icon: LayoutDashboard },
  { id: "classes", label: "Lớp học", icon: School },
  { id: "students", label: "Học sinh", icon: Users },
  { id: "schedule", label: "Lịch học", icon: CalendarDays },
  { id: "attendance", label: "Điểm danh", icon: ClipboardCheck },
  { id: "fees", label: "Học phí", icon: Wallet },
  { id: "assignments", label: "Bài tập", icon: BookOpen },
  { id: "reports", label: "Báo cáo", icon: BarChart3 },
];
function Badge({
  status,
  children,
}: {
  status?: string;
  children?: React.ReactNode;
}) {
  return (
    <span className={`badge ${status || ""}`}>
      {children || labels[status || ""] || status}
    </span>
  );
}
function Empty({
  text = "Chưa có dữ liệu",
  action,
}: {
  text?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <BookOpen size={30} />
      <strong>{text}</strong>
      <span>Dữ liệu sẽ xuất hiện tại đây khi bạn bắt đầu.</span>
      {action}
    </div>
  );
}
function Select({
  name,
  label,
  children,
  defaultValue,
  required = true,
}: {
  name: string;
  label: string;
  children: React.ReactNode;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={defaultValue} required={required}>
        {children}
      </select>
    </label>
  );
}
function Field({
  label,
  name,
  type = "text",
  value,
  required = true,
  min,
  max,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  value?: string | number;
  required?: boolean;
  min?: string | number;
  max?: string | number;
  placeholder?: string;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        min={min}
        max={max}
        step={type === "number" ? "any" : undefined}
        placeholder={placeholder}
      />
    </label>
  );
}

export default function Dashboard({ initial }: { initial: Data }) {
  const [data, setData] = useState<Data>(initial),
    [tab, setTab] = useState("overview"),
    [search, setSearch] = useState(""),
    [dialog, setDialog] = useState<Dialog | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [mobile, setMobile] = useState(false),
    [result, setResult] = useState<Row | null>(null),
    [selectedClass, setSelectedClass] = useState(""),
    [month, setMonth] = useState(today().slice(0, 7)),
    [calendarDate, setCalendarDate] = useState(today());
  const [attendanceDraft, setAttendanceDraft] = useState<
    Record<string, string>
  >({});
  const formRef = useRef<HTMLFormElement>(null);
  const [enrollmentSelection, setEnrollmentSelection] = useState<string[]>([]);
  const enrollmentSlots =
    dialog?.type === "enroll"
      ? Math.max(
          0,
          Number(
            data.classes.find((c: Row) => c.id === dialog.item!.id)?.capacity ??
              dialog.item!.capacity,
          ) -
            data.enrollments.filter(
              (e: Row) => e.class_id === dialog.item!.id && !e.ended_at,
            ).length,
        )
      : 0;
  const mutating = useRef(false);
  const accountFetch = (path: string, init?: RequestInit) =>
    scopedFetch(initial.actor.id, path, init);
  const snapshotLoader = useRef<SnapshotLoader<Data> | null>(null);
  if (!snapshotLoader.current)
    snapshotLoader.current = createSnapshotLoader(async () => {
      const response = await accountFetch("/api/data", { cache: "no-store" });
      if (response.status === 401) {
        forgetAccount(initial.actor.id);
        window.location.assign("/login");
        throw new Error("Phiên đăng nhập đã hết hạn.");
      }
      const next = await response.json().catch(() => null);
      if (!response.ok || !next || !Array.isArray(next.classes))
        throw new Error(
          next?.error || "Chưa thể cập nhật danh sách mới. Vui lòng thử lại.",
        );
      if (next.actor?.id !== initial.actor.id) {
        forgetAccount(initial.actor.id);
        window.location.assign("/login");
        throw new Error("Tài khoản đăng nhập đã thay đổi.");
      }
      return next as Data;
    }, setData);
  const student = data.actor.role === "student",
    owner = data.actor.role === "owner";
  const name = data.actor.name.split(" ").slice(-1)[0];
  const filtered = (items: Row[], keys = ["name"]) =>
    items.filter(
      (x: Row) =>
        (!selectedClass ||
          x.class_id === selectedClass ||
          x.id === selectedClass) &&
        (!search ||
          keys.some((k) =>
            String(x[k] || "")
              .toLocaleLowerCase("vi")
              .includes(search.toLocaleLowerCase("vi")),
          )),
    );
  async function refresh() {
    return snapshotLoader.current!.refresh();
  }
  useEffect(() => {
    rememberAccount(initial.actor.id);
    const timer = setInterval(() => {
      if (!mutating.current) void refresh().catch(() => {});
    }, 25000);
    return () => {
      clearInterval(timer);
      snapshotLoader.current!.invalidate();
    };
  }, []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) {
        setDialog(null);
        setResult(null);
      }
    }
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [busy]);
  useEffect(() => {
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const modal = document.querySelector<HTMLElement>('[role="dialog"]');
    const focusable = () =>
      Array.from(
        modal?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
        ) || [],
      ).filter((el) => el.getClientRects().length > 0);
    focusable()[0]?.focus();
    function trap(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const list = focusable(),
        first = list[0],
        last = list.at(-1);
      if (!first) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [dialog?.type]);
  function open(type: string, item?: Row) {
    setError("");
    setResult(null);
    setAttendanceDraft({});
    setEnrollmentSelection([]);
    setDialog({ type, item });
  }
  async function api(action: string, values: Row = {}) {
    const r = await accountFetch("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...values }),
    });
    const value = await r.json();
    if (!r.ok) throw new Error(value.error || "Không thể thực hiện.");
    return value;
  }
  async function run(action: string, values: Row = {}, close = true) {
    setBusy(true);
    mutating.current = true;
    snapshotLoader.current!.invalidate();
    setError("");
    try {
      const value = await api(action, values);
      await refresh();
      if (close) setDialog(null);
      setToast("Đã lưu thay đổi.");
      return value;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể kết nối.");
      return null;
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  }
  async function uploadFile(
    assignmentId: string,
    submissionId: string | undefined,
    file: File,
  ) {
    const form = new FormData();
    form.set("assignment_id", assignmentId);
    if (submissionId) form.set("submission_id", submissionId);
    form.set("file", file);
    const r = await accountFetch("/api/files", { method: "POST", body: form });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
  }
  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog) return;
    setBusy(true);
    mutating.current = true;
    snapshotLoader.current!.invalidate();
    setError("");
    const form = new FormData(event.currentTarget),
      values: Row = Object.fromEntries(form),
      item = dialog.item;
    try {
      let response: Row = {};
      switch (dialog.type) {
        case "student":
          response = await api("student.create", values);
          setResult(response);
          break;
        case "class":
          response = await api("class.create", values);
          if (response.class) {
            setData((current) =>
              addCreatedClass(
                { ...current, classes: current.classes },
                response.class,
              ),
            );
            setSearch("");
            setSelectedClass("");
            setTab("classes");
          }
          break;
        case "class-assign":
          response = await api("class.assign", {
            ...values,
            class_id: item!.id,
          });
          if (response.class)
            setData((current) =>
              addCreatedClass(
                { ...current, classes: current.classes },
                response.class,
              ),
            );
          break;
        case "student-edit":
          response = await api("student.update", {
            ...values,
            student_id: item!.id,
          });
          break;
        case "class-edit":
          response = await api("class.update", {
            ...values,
            class_id: item!.id,
          });
          break;
        case "import": {
          const file = form.get("csv");
          if (!(file instanceof File) || !file.size)
            throw new Error("Chọn file CSV.");
          response = await api("student.import", {
            csv: await file.text(),
            teacher_id: values.teacher_id,
          });
          const content =
            "ho_ten,tai_khoan,ma_kich_hoat\n" +
            response.students
              .map((r: Row) =>
                [r.name, r.username, r.activation_code]
                  .map((v: string) => '"' + v.replaceAll('"', '""') + '"')
                  .join(","),
              )
              .join("\n");
          const url = URL.createObjectURL(
            new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" }),
          );
          const link = document.createElement("a");
          link.href = url;
          link.download = "tai-khoan-kich-hoat.csv";
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
          break;
        }
        case "teacher":
          response = await api("teacher.create", values);
          setResult(response);
          break;
        case "enroll":
          response = await api("class.enroll-many", {
            student_ids: form.getAll("student_ids"),
            class_id: item!.id,
          });
          break;
        case "schedule":
          response = await api("schedule.create", values);
          break;
        case "move":
          response = await api("session.move", {
            ...values,
            session_id: item!.id,
          });
          break;
        case "generate":
          response = await api("invoice.generate", values);
          setToast(`${response.count} khoản học phí đã được tạo.`);
          break;
        case "adjust":
          response = await api("invoice.adjust", {
            ...values,
            invoice_id: item!.id,
          });
          break;
        case "assignment": {
          response = await api("assignment.create", {
            ...values,
            due_at: new Date(String(values.due_at) + "+07:00").toISOString(),
          });
          const file = form.get("file");
          if (file instanceof File && file.size)
            await uploadFile(response.id, undefined, file);
          break;
        }
        case "submit": {
          const file = form.get("file");
          if (
            !String(values.body || "").trim() &&
            !(file instanceof File && file.size)
          )
            throw new Error("Nhập nội dung hoặc chọn file bài làm.");
          response = await api("submission.create", {
            assignment_id: item!.id,
            body: values.body || "",
          });
          if (file instanceof File && file.size)
            await uploadFile(item!.id, response.id, file);
          break;
        }
        case "grade":
          response = await api("submission.grade", {
            ...values,
            submission_id: item!.id,
          });
          break;
        case "bank":
          response = await api("bank.save", values);
          break;
        case "attendance": {
          const members = eligibleMembers(item!);
          const entries = members.map((s: Row) => ({
            student_id: s.id,
            status:
              attendanceDraft[s.id] ||
              data.attendance.find(
                (a: Row) => a.session_id === item!.id && a.student_id === s.id,
              )?.status ||
              "",
            note: "",
          }));
          if (entries.some((x: Row) => !x.status))
            throw new Error("Vui lòng chọn trạng thái cho tất cả học sinh.");
          response = await api("attendance.save", {
            session_id: item!.id,
            entries,
            lock: values.lock === "yes",
          });
          break;
        }
      }
      try {
        await refresh();
      } catch (syncError) {
        if (["class", "class-assign"].includes(dialog.type) && response.class) {
          setDialog(null);
          setToast(
            dialog.type === "class"
              ? `Đã tạo lớp ${response.class.name}.`
              : "Đã cập nhật phân công giáo viên.",
          );
          setError(
            "Thông tin lớp đã được lưu. Một số dữ liệu khác chưa đồng bộ được; hệ thống sẽ thử tải lại.",
          );
          return;
        }
        throw syncError;
      }
      if (["class", "class-assign"].includes(dialog.type) && response.class)
        setData((current) =>
          addCreatedClass(
            { ...current, classes: current.classes },
            response.class,
          ),
        );
      if (!["student", "teacher"].includes(dialog.type)) setDialog(null);
      if (dialog.type !== "generate")
        setToast(
          dialog.type === "class-assign"
            ? "Đã cập nhật phân công giáo viên."
            : dialog.type === "class"
              ? `Đã tạo lớp ${response.class?.name || ""}.`
              : dialog.type === "enroll"
                ? `Đã thêm ${response.count} học sinh vào lớp.${response.skipped ? ` ${response.skipped} học sinh đã có trong lớp được bỏ qua.` : ""}`
                : "Đã lưu thay đổi.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  }
  function eligibleMembers(session: Row) {
    return data.students.filter((s: Row) =>
      data.enrollments.some(
        (e: Row) =>
          e.class_id === session.class_id &&
          e.student_id === s.id &&
          e.joined_at.slice(0, 10) <= session.date &&
          (!e.ended_at || e.ended_at.slice(0, 10) > session.date),
      ),
    );
  }
  async function payment(invoice: Row) {
    setBusy(true);
    setError("");
    try {
      const p = await api("payment.checkout", { invoice_id: invoice.id });
      setResult(p);
      setDialog({ type: "payment", item: invoice });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tạo QR.");
    } finally {
      setBusy(false);
    }
  }
  const todaySessions = data.sessions.filter(
    (s: Row) => s.date === today() && s.status !== "cancelled",
  );
  const upcoming = data.sessions
    .filter((s: Row) => s.date >= today() && s.status === "scheduled")
    .slice(0, 5);
  const allReceived = data.payments.reduce(
    (n: number, p: Row) => n + Number(p.amount),
    0,
  );
  const debt = data.invoices.reduce(
    (n: number, i: Row) => n + Math.max(0, i.balance),
    0,
  );
  const monthReceived = data.payments
    .filter((p: Row) => p.paid_at.slice(0, 7) === today().slice(0, 7))
    .reduce((n: number, p: Row) => n + Number(p.amount), 0);
  const openAssignments = data.assignments.filter(
    (a: Row) => !a.closed_at && new Date(a.due_at) > new Date(),
  );
  const unread = data.notifications.filter((n: Row) => !n.read_at).length;
  const menu = student
    ? nav.filter((n) =>
        [
          "overview",
          "classes",
          "schedule",
          "attendance",
          "fees",
          "assignments",
        ].includes(n.id),
      )
    : nav;
  const title =
    tab === "settings"
      ? "Cài đặt"
      : tab === "teachers"
        ? "Giáo viên"
        : tab === "audit"
          ? "Lịch sử hoạt động"
          : tab === "notifications"
            ? "Thông báo"
            : nav.find((n) => n.id === tab)?.label || "Tổng quan";
  function navigate(next: string) {
    setTab(next);
    setSearch("");
    setSelectedClass("");
    setError("");
    setMobile(false);
  }
  function TeacherSelect({
    allowEmpty = false,
    emptyLabel = "Chưa phân công",
    label = "Giáo viên quản lý",
    defaultValue = "",
  }: {
    allowEmpty?: boolean;
    emptyLabel?: string;
    label?: string;
    defaultValue?: string;
  } = {}) {
    return owner ? (
      <Select
        name="teacher_id"
        label={label}
        defaultValue={defaultValue}
        required={!allowEmpty}
      >
        <option value="" disabled={!allowEmpty}>
          {allowEmpty ? emptyLabel : "Chọn giáo viên"}
        </option>
        {data.teachers.map((t: Row) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </Select>
    ) : null;
  }
  function ClassOptions() {
    return (
      <>
        {data.classes.map((c: Row) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </>
    );
  }
  function SessionRows({ items }: { items: Row[] }) {
    return (
      <div className="session-list">
        {items.map((s: Row) => (
          <div className="session-row" key={s.id}>
            <div
              className={`subject-mark ${s.class_id.length % 2 ? "purple" : ""}`}
            >
              <BookOpen size={20} />
            </div>
            <div className="session-info">
              <strong>{s.class_name}</strong>
              <span>
                {fmt(s.date)} · {s.start_time} – {s.end_time} ·{" "}
                {s.room || "Chưa có phòng"}
              </span>
            </div>
            <Badge status={s.status} />
            {!student && s.status === "scheduled" && (
              <button
                className="button small"
                onClick={() => open("attendance", s)}
              >
                Điểm danh
              </button>
            )}
          </div>
        ))}
      </div>
    );
  }
  const months = Array.from({ length: 6 }, (_, i) => {
    const dt = new Date();
    dt.setUTCDate(1);
    dt.setUTCMonth(dt.getUTCMonth() - 5 + i);
    return dt.toISOString().slice(0, 7);
  });
  const chart = months.map((m) => ({
    month: m,
    total: data.payments
      .filter((p: Row) => p.paid_at.slice(0, 7) === m)
      .reduce((sum: number, p: Row) => sum + Number(p.amount), 0),
  }));
  const chartMax = Math.max(...chart.map((c) => c.total), 500000);
  function Chart() {
    return (
      <div className="chart">
        <div className="chart-scale">
          <span>{money(chartMax)}</span>
          <span>{money(chartMax / 2)}</span>
          <span>0đ</span>
        </div>
        <div className="chart-bars">
          {chart.map((c, i) => (
            <div className="chart-column" key={c.month}>
              <div className="bar-track">
                <div
                  className={`chart-bar ${i === 5 ? "current" : ""}`}
                  style={{
                    height: `${Math.max(2, (c.total / chartMax) * 100)}%`,
                  }}
                  title={`${c.month}: ${money(c.total)}`}
                />
              </div>
              <span>Thg {Number(c.month.slice(5))}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {mobile && (
        <div className="sidebar-backdrop" onClick={() => setMobile(false)} />
      )}
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a href={workspacePath(initial.actor.id)} className="brand">
          <span className="brand-icon">
            <BookOpen size={22} />
          </span>
          ClassFlow<span className="brand-dot">.</span>
        </a>
        <div className="workspace">
          <span className="workspace-avatar">
            {data.center.name.slice(0, 1)}
          </span>
          <div>
            <strong>{data.center.name}</strong>
            <small>Không gian giảng dạy</small>
          </div>
          <span className="workspace-chevron">⌄</span>
        </div>
        <span className="nav-label">KHÔNG GIAN LỚP HỌC</span>
        <nav>
          {menu.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${tab === n.id ? "active" : ""}`}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={20} />
              {n.label}
              {n.id === "assignments" && openAssignments.length > 0 && (
                <span className="nav-count">{openAssignments.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {owner && (
            <button
              className={`nav-item ${tab === "teachers" ? "active" : ""}`}
              onClick={() => navigate("teachers")}
            >
              <GraduationCap size={20} />
              Giáo viên
            </button>
          )}
          {!student && (
            <>
              <button
                className={`nav-item ${tab === "audit" ? "active" : ""}`}
                onClick={() => navigate("audit")}
              >
                <History size={20} />
                Lịch sử hoạt động
              </button>
              <button
                className={`nav-item ${tab === "settings" ? "active" : ""}`}
                onClick={() => navigate("settings")}
              >
                <Settings size={20} />
                Cài đặt
              </button>
            </>
          )}
          <a href="/login" target="_blank" rel="noopener" className="nav-item">
            <Users size={18} /> Mở tài khoản khác
          </a>
          <div className="sidebar-note">
            <span className="note-icon">✦</span>
            <strong>Mỗi buổi học, một tiến bộ.</strong>
            <p>
              Để ClassFlow lo việc quản lý,
              <br />
              bạn tập trung vào việc dạy.
            </p>
          </div>
          <button
            className="profile"
            onClick={async () => {
              await accountFetch("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "logout" }),
              });
              forgetAccount(initial.actor.id);
              window.location.assign("/login");
            }}
          >
            <span className="avatar">
              {data.actor.name
                .split(" ")
                .slice(-2)
                .map((s: string) => s[0])
                .join("")}
            </span>
            <span>
              <strong>{data.actor.name}</strong>
              <small>
                {owner ? "Chủ trung tâm" : student ? "Học sinh" : "Giáo viên"}
              </small>
            </span>
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Mở menu"
              onClick={() => setMobile(true)}
            >
              <Menu size={22} />
            </button>
            <span>Không gian làm việc</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <span className="top-date">
              {new Date().toLocaleDateString("vi-VN", {
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "Asia/Ho_Chi_Minh",
              })}
            </span>
            <button
              className="notification-button icon-button"
              aria-label="Thông báo"
              onClick={() => navigate("notifications")}
            >
              <Bell size={20} />
              {unread > 0 && <i />}
            </button>
            <span className="avatar small">{name[0]}</span>
          </div>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {tab === "overview"
                  ? "MỘT NGÀY DẠY HỌC HIỆU QUẢ"
                  : "CLASSFLOW / " + title.toLocaleUpperCase("vi")}
              </span>
              <h1>
                {tab === "overview" ? `Chào ${name}, ngày mới tốt lành` : title}
                {tab === "overview" && (
                  <span className="greeting-spark">✦</span>
                )}
              </h1>
              <p>
                {tab === "overview"
                  ? "Cùng xem lớp học của bạn đang diễn ra thế nào hôm nay."
                  : (
                      {
                        classes:
                          "Mỗi lớp học là một hành trình. Quản lý tất cả tại đây.",
                        students:
                          "Theo sát từng học sinh, đồng hành từng tiến bộ.",
                        schedule:
                          "Sắp xếp lịch dạy rõ ràng, chủ động mỗi ngày.",
                        attendance:
                          "Ghi nhận chuyên cần và chốt buổi học chính xác.",
                        fees: "Học phí theo buổi, thu cuối tháng, theo dõi rõ ràng.",
                        assignments:
                          "Giao bài, nhận bài và phản hồi trong một không gian.",
                        reports:
                          "Nhìn lại kết quả vận hành từ dữ liệu thực tế.",
                        settings:
                          "Thông tin nhận tiền và kết nối thanh toán của bạn.",
                        teachers:
                          "Mỗi giáo viên có lớp và tài khoản nhận tiền riêng.",
                        audit:
                          "Theo dõi các thay đổi, giữ nguyên lịch sử quan trọng.",
                        notifications: "Những cập nhật mới từ lớp học của bạn.",
                      } as Record<string, string>
                    )[tab]}
              </p>
            </div>
            <div className="heading-actions">
              {tab === "overview" && !student ? (
                <>
                  <button
                    className="button"
                    onClick={() => navigate("schedule")}
                  >
                    <CalendarDays size={17} />
                    Xem lịch học
                  </button>
                  <button
                    className="button primary"
                    onClick={() => open("class")}
                  >
                    <Plus size={18} />
                    Tạo lớp học
                  </button>
                </>
              ) : null}
              {tab === "classes" && !student && (
                <button
                  className="button primary"
                  onClick={() => open("class")}
                >
                  <Plus size={18} />
                  Tạo lớp học
                </button>
              )}
              {tab === "students" && !student && (
                <>
                  <button className="button" onClick={() => open("import")}>
                    <Upload size={16} />
                    Nhập CSV
                  </button>
                  <button
                    className="button primary"
                    onClick={() => open("student")}
                  >
                    <Plus size={18} />
                    Thêm học sinh
                  </button>
                </>
              )}
              {tab === "schedule" && !student && (
                <button
                  className="button primary"
                  onClick={() => open("schedule")}
                >
                  <Plus size={18} />
                  Thêm lịch học
                </button>
              )}
              {tab === "fees" && !student && (
                <button
                  className="button primary"
                  onClick={() => open("generate")}
                >
                  <Plus size={18} />
                  Chốt học phí tháng
                </button>
              )}
              {tab === "assignments" && !student && (
                <button
                  className="button primary"
                  onClick={() => open("assignment")}
                >
                  <Plus size={18} />
                  Giao bài tập
                </button>
              )}
              {tab === "teachers" && owner && (
                <button
                  className="button primary"
                  onClick={() => open("teacher")}
                >
                  <Plus size={18} />
                  Thêm giáo viên
                </button>
              )}
              {tab === "reports" && (
                <a
                  className="button"
                  href={accountApiUrl("/api/export", initial.actor.id)}
                >
                  <Download size={17} />
                  Xuất báo cáo CSV
                </a>
              )}
            </div>
          </div>
          {error && !dialog && (
            <div className="alert danger" role="alert">
              {error}
              <button
                className="icon-button"
                onClick={() => setError("")}
                aria-label="Đóng lỗi"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {data.demo && (
            <div className="demo-banner">
              <ShieldCheck size={16} />
              <span>
                Chế độ thử nghiệm thanh toán · Nhận tiền mô phỏng, không chuyển
                tiền thật.
              </span>
              <button onClick={() => navigate("settings")}>Xem cấu hình</button>
            </div>
          )}

          {tab === "overview" && (
            <>
              <div className="stat-grid">
                <Stat
                  label={
                    owner
                      ? "Toàn bộ lớp học"
                      : student
                        ? "Lớp đang theo học"
                        : "Lớp đang giảng dạy"
                  }
                  value={data.classes.length}
                  detail={`${todaySessions.length} buổi học hôm nay`}
                  icon={<School size={21} />}
                  color="blue"
                />
                <Stat
                  label={student ? "Bài tập đang mở" : "Tổng số học sinh"}
                  value={
                    student ? openAssignments.length : data.students.length
                  }
                  detail={
                    student
                      ? "Theo dõi hạn nộp để hoàn thành đúng giờ"
                      : "Học sinh trong không gian của bạn"
                  }
                  icon={<Users size={21} />}
                  color="purple"
                />
                <Stat
                  label={student ? "Học phí đã đóng" : "Đã thu tháng này"}
                  value={money(student ? allReceived : monthReceived)}
                  detail="Theo giao dịch đã xác nhận"
                  icon={<Wallet size={21} />}
                  color="green"
                />
                <Stat
                  label="Học phí còn thiếu"
                  value={money(debt)}
                  detail={`${data.invoices.filter((i: Row) => i.balance > 0).length} khoản cần thanh toán`}
                  icon={<Clock3 size={21} />}
                  color="orange"
                />
              </div>
              <div className="overview-columns">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        Lịch học sắp tới{" "}
                        <span className="count">{upcoming.length}</span>
                      </h2>
                      <p>Sẵn sàng cho những buổi học tiếp theo</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => navigate("schedule")}
                    >
                      Xem tất cả <ChevronRight size={15} />
                    </button>
                  </div>
                  {upcoming.length ? (
                    <SessionRows items={upcoming} />
                  ) : (
                    <Empty text="Chưa có buổi học sắp tới" />
                  )}
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>{student ? "Tiến độ học tập" : "Học phí đã thu"}</h2>
                      <p>
                        {student
                          ? "Các bài tập đang chờ bạn hoàn thành"
                          : "Tổng tiền nhận trong 6 tháng gần nhất"}
                      </p>
                    </div>
                    <span className="chart-legend">
                      <i />
                      Đã nhận
                    </span>
                  </div>
                  {student ? (
                    <div className="task-list">
                      {openAssignments.slice(0, 4).map((a: Row) => (
                        <button
                          key={a.id}
                          onClick={() => open("assignment-detail", a)}
                        >
                          <span className="subject-mark purple">
                            <FileText size={20} />
                          </span>
                          <span>
                            <strong>{a.title}</strong>
                            <small>Hạn nộp {fullDate(a.due_at)}</small>
                          </span>
                          <ChevronRight size={16} />
                        </button>
                      ))}
                      {!openAssignments.length && (
                        <Empty text="Bạn đã hoàn thành các bài tập" />
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="chart-total">
                        {money(chart.reduce((n, c) => n + c.total, 0))}
                        <span>Tổng đã thu</span>
                      </div>
                      <Chart />
                    </>
                  )}
                </section>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Lớp học của bạn</h2>
                    <p>Một góc nhìn nhanh về các lớp đang quản lý</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => navigate("classes")}
                  >
                    Tất cả lớp học <ChevronRight size={15} />
                  </button>
                </div>
                {data.classes.length ? (
                  <div className="class-preview-grid">
                    {data.classes.slice(0, 3).map((c: Row, i: number) => (
                      <button
                        className="class-preview"
                        key={c.id}
                        onClick={() => {
                          navigate("classes");
                          open("class-detail", c);
                        }}
                      >
                        <span
                          className={`subject-mark ${["", "purple", "orange"][i % 3]}`}
                        >
                          <BookOpen size={23} />
                        </span>
                        <Badge>{c.subject}</Badge>
                        <h3>{c.name}</h3>
                        <p>
                          {c.level || "Lớp dạy thêm"} · {c.teacher_name}
                        </p>
                        <div>
                          <span>
                            <Users size={15} />
                            {student
                              ? "Lớp đang theo học"
                              : `${c.student_count}/${c.capacity} học sinh`}
                          </span>
                          <span className="text-link">
                            Chi tiết <ChevronRight size={15} />
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <Empty text="Tạo lớp học đầu tiên của bạn" />
                )}
              </section>
            </>
          )}

          {[
            "classes",
            "students",
            "attendance",
            "fees",
            "assignments",
          ].includes(tab) && (
            <div className="toolbar">
              <div className="search-field">
                <Search size={18} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Tìm ${title.toLocaleLowerCase("vi")}…`}
                  aria-label="Tìm kiếm"
                />
              </div>
              {["attendance", "assignments"].includes(tab) && (
                <select
                  aria-label="Lọc theo lớp"
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                >
                  <option value="">Tất cả lớp học</option>
                  <ClassOptions />
                </select>
              )}
              {tab === "students" && (
                <a
                  className="button"
                  href={accountApiUrl(
                    "/api/export?type=students",
                    initial.actor.id,
                  )}
                >
                  <Download size={16} />
                  Xuất danh sách
                </a>
              )}
              {tab === "fees" && (
                <label className="inline-label">
                  Tháng
                  <input
                    type="month"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                  />
                  <button className="text-button" onClick={() => setMonth("")}>
                    Tất cả
                  </button>
                </label>
              )}
            </div>
          )}

          {tab === "classes" && (
            <div className="class-grid">
              {filtered(data.classes, ["name", "subject", "teacher_name"]).map(
                (c: Row, i: number) => (
                  <section className="panel class-card" key={c.id}>
                    <div className="class-card-top">
                      <span className={`subject-mark ${i % 2 ? "purple" : ""}`}>
                        <BookOpen size={24} />
                      </span>
                      <Badge>{c.subject}</Badge>
                    </div>
                    <h2>{c.name}</h2>
                    <p>
                      {c.level || "Lớp dạy thêm"} · {c.teacher_name}
                    </p>
                    <div className="class-metadata">
                      <span>
                        <Users size={17} />
                        {student
                          ? "Đang theo học"
                          : `${c.student_count}/${c.capacity} học sinh`}
                      </span>
                      <span>
                        <School size={17} />
                        {c.room || "Chưa có phòng"}
                      </span>
                      <span>
                        <Wallet size={17} />
                        {money(c.fee)} / buổi
                      </span>
                    </div>
                    <div className="capacity-track">
                      <i
                        style={{
                          width: `${Math.min(100, (Number(c.student_count) / c.capacity) * 100)}%`,
                        }}
                      />
                    </div>
                    <div className="card-actions">
                      <button
                        className="button"
                        onClick={() => open("class-detail", c)}
                      >
                        Chi tiết lớp
                      </button>
                      {!student && (
                        <button
                          className="button primary"
                          onClick={() =>
                            open(owner ? "class-assign" : "enroll", c)
                          }
                        >
                          <Plus size={16} />
                          {owner
                            ? c.teacher_id
                              ? "Đổi giáo viên"
                              : "Phân công"
                            : "Thêm học sinh"}
                        </button>
                      )}
                    </div>
                  </section>
                ),
              )}
              {!data.classes.length && <Empty text="Chưa có lớp học" />}
            </div>
          )}

          {tab === "students" && (
            <section className="panel table-panel">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Học sinh</th>
                      <th>Tài khoản</th>
                      <th>Trường học</th>
                      <th>Liên hệ</th>
                      <th>Số lớp</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered(data.students, [
                      "name",
                      "username",
                      "school",
                    ]).map((s: Row, i: number) => (
                      <tr key={s.id}>
                        <td>
                          <div className="person-cell">
                            <span
                              className={`avatar ${i % 2 ? "mint" : "lavender"}`}
                            >
                              {s.name
                                .split(" ")
                                .slice(-2)
                                .map((v: string) => v[0])
                                .join("")}
                            </span>
                            <strong>{s.name}</strong>
                          </div>
                        </td>
                        <td>
                          <code>{s.username}</code>
                        </td>
                        <td>{s.school || "—"}</td>
                        <td>{s.phone || "—"}</td>
                        <td>
                          {
                            data.enrollments.filter(
                              (e: Row) => e.student_id === s.id && !e.ended_at,
                            ).length
                          }
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="text-button"
                              onClick={() => open("student-edit", s)}
                            >
                              Sửa hồ sơ
                            </button>
                            <button
                              className="text-button"
                              disabled={busy}
                              onClick={async () => {
                                const r = await run(
                                  "student.activation",
                                  { student_id: s.id },
                                  false,
                                );
                                if (r) {
                                  setResult({ ...r, username: s.username });
                                  setDialog({ type: "activation", item: s });
                                }
                              }}
                            >
                              Cấp mã kích hoạt
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.students.length && <Empty text="Chưa có học sinh" />}
            </section>
          )}

          {tab === "schedule" && (
            <section className="panel calendar-panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    Lịch học tháng {calendarDate.slice(5, 7)}/
                    {calendarDate.slice(0, 4)}
                  </h2>
                  <p>Giờ Việt Nam · Buổi đã khóa được giữ nguyên</p>
                </div>
                <div className="calendar-controls">
                  <button
                    className="icon-button"
                    aria-label="Tháng trước"
                    onClick={() => {
                      const d = new Date(calendarDate + "T12:00:00Z");
                      d.setUTCDate(1);
                      d.setUTCMonth(d.getUTCMonth() - 1);
                      setCalendarDate(d.toISOString().slice(0, 10));
                    }}
                  >
                    <ChevronLeft size={19} />
                  </button>
                  <button
                    className="button small"
                    onClick={() => setCalendarDate(today())}
                  >
                    Hôm nay
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Tháng sau"
                    onClick={() => {
                      const d = new Date(calendarDate + "T12:00:00Z");
                      d.setUTCDate(1);
                      d.setUTCMonth(d.getUTCMonth() + 1);
                      setCalendarDate(d.toISOString().slice(0, 10));
                    }}
                  >
                    <ChevronRight size={19} />
                  </button>
                </div>
              </div>
              <div className="calendar-scroll">
                <div className="calendar-grid">
                  {[
                    "Thứ Hai",
                    "Thứ Ba",
                    "Thứ Tư",
                    "Thứ Năm",
                    "Thứ Sáu",
                    "Thứ Bảy",
                    "Chủ Nhật",
                  ].map((d) => (
                    <div key={d} className="calendar-day-header">
                      {d}
                    </div>
                  ))}
                  {Array.from({ length: 42 }, (_, i) => {
                    const start = new Date(
                      calendarDate.slice(0, 7) + "-01T12:00:00Z",
                    );
                    const offset = (start.getUTCDay() + 6) % 7;
                    start.setUTCDate(i - offset + 1);
                    const day = start.toISOString().slice(0, 10);
                    const sessions = data.sessions.filter(
                      (s: Row) => s.date === day,
                    );
                    return (
                      <div
                        key={day}
                        className={`calendar-cell ${day.slice(0, 7) !== calendarDate.slice(0, 7) ? "outside" : ""} ${day === today() ? "is-today" : ""}`}
                      >
                        <span className="day-number">{start.getUTCDate()}</span>
                        {sessions.map((s: Row) => (
                          <button
                            key={s.id}
                            className={`calendar-event ${s.status}`}
                            onClick={() =>
                              open(student ? "session-detail" : "session", s)
                            }
                          >
                            <strong>
                              {s.start_time} · {s.class_name}
                            </strong>
                            <small>
                              {s.room || "Lớp học"}
                              {s.status === "locked"
                                ? " · Đã khóa"
                                : s.status === "cancelled"
                                  ? " · Đã hủy"
                                  : ""}
                            </small>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {tab === "attendance" && (
            <section className="panel table-panel">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Ngày</th>
                      <th>Lớp học</th>
                      <th>Giờ học</th>
                      <th>{student ? "Điểm danh của bạn" : "Đã điểm danh"}</th>
                      <th>Trạng thái</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered([...data.sessions].reverse(), [
                      "class_name",
                      "date",
                    ]).map((s: Row) => {
                      const entries = data.attendance.filter(
                        (a: Row) => a.session_id === s.id,
                      );
                      return (
                        <tr key={s.id}>
                          <td>{fmt(s.date)}</td>
                          <td>
                            <strong>{s.class_name}</strong>
                          </td>
                          <td>
                            {s.start_time} – {s.end_time}
                          </td>
                          <td>
                            {student ? (
                              entries[0] ? (
                                <Badge status={entries[0].status} />
                              ) : (
                                "Chưa điểm danh"
                              )
                            ) : (
                              `${entries.length}/${eligibleMembers(s).length}`
                            )}
                          </td>
                          <td>
                            <Badge status={s.status} />
                          </td>
                          <td>
                            {!student && s.status !== "cancelled" && (
                              <button
                                className="button small"
                                onClick={() => open("attendance", s)}
                              >
                                {s.status === "locked"
                                  ? "Xem điểm danh"
                                  : "Điểm danh"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!data.sessions.length && <Empty text="Chưa có buổi học" />}
            </section>
          )}

          {tab === "fees" && (
            <>
              <div className="fee-summary">
                <span>
                  <i className="dot green" />
                  Tổng phải thu{" "}
                  <strong>
                    {money(
                      data.invoices.reduce(
                        (n: number, i: Row) => n + i.total,
                        0,
                      ),
                    )}
                  </strong>
                </span>
                <span>
                  <i className="dot blue" />
                  Đã nhận <strong>{money(allReceived)}</strong>
                </span>
                <span>
                  <i className="dot orange" />
                  Còn thiếu <strong>{money(debt)}</strong>
                </span>
              </div>
              <section className="panel table-panel">
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Học sinh / Kỳ thu</th>
                        <th>Giáo viên</th>
                        <th>Phải thu</th>
                        <th>Đã nhận</th>
                        <th>Còn thiếu</th>
                        <th>Trạng thái</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {data.invoices
                        .filter(
                          (i: Row) =>
                            (!month || i.period === month) &&
                            (!search ||
                              i.student_name
                                .toLowerCase()
                                .includes(search.toLowerCase())),
                        )
                        .map((i: Row) => (
                          <tr key={i.id}>
                            <td>
                              <strong>{i.student_name}</strong>
                              <small className="cell-small">
                                Tháng {i.period.slice(5)}/{i.period.slice(0, 4)}
                              </small>
                            </td>
                            <td>{i.teacher_name}</td>
                            <td>{money(i.total)}</td>
                            <td className="green-text">{money(i.paid)}</td>
                            <td>
                              {money(Math.max(0, i.balance))}
                              {i.balance < 0 && (
                                <small className="cell-small">
                                  Dư {money(-i.balance)}
                                </small>
                              )}
                            </td>
                            <td>
                              <Badge status={i.status} />
                            </td>
                            <td>
                              <div className="row-actions">
                                <button
                                  className="text-button"
                                  onClick={() => open("invoice-detail", i)}
                                >
                                  Chi tiết
                                </button>
                                {i.balance > 0 && (
                                  <button
                                    className="button small"
                                    disabled={busy}
                                    onClick={() => void payment(i)}
                                  >
                                    <CreditCard size={15} />
                                    QR
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {!data.invoices.some(
                  (i: Row) => !month || i.period === month,
                ) && <Empty text="Chưa có khoản học phí trong kỳ này" />}
              </section>
              {owner && data.payment_events.length > 0 && (
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Giao dịch cần đối soát</h2>
                  </div>
                  {data.payment_events.map((e: Row) => (
                    <div className="session-row" key={e.id}>
                      <AlertCircle size={20} />
                      <div className="session-info">
                        <strong>
                          {e.student_name} · {money(e.amount)}
                        </strong>
                        <span>
                          {e.note} · {e.transaction_id}
                        </span>
                      </div>
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() => open("accept-review", e)}
                      >
                        Kiểm tra
                      </button>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}

          {tab === "assignments" && (
            <div className="assignment-grid">
              {filtered(data.assignments, ["title", "class_name"]).map(
                (a: Row) => {
                  const submissions = data.submissions.filter(
                      (s: Row) => s.assignment_id === a.id,
                    ),
                    submitted = new Set(
                      submissions.map((s: Row) => s.student_id),
                    ).size,
                    targetCount = data.targets.filter(
                      (t: Row) => t.assignment_id === a.id,
                    ).length,
                    closed = !!a.closed_at || new Date(a.due_at) <= new Date();
                  return (
                    <section className="panel assignment-card" key={a.id}>
                      <div className="assignment-top">
                        <span className="subject-mark purple">
                          <FileText size={21} />
                        </span>
                        <Badge status={closed ? "locked" : "present"}>
                          {closed ? "Đã đóng" : "Đang nhận bài"}
                        </Badge>
                      </div>
                      <span className="assignment-class">{a.class_name}</span>
                      <h2>{a.title}</h2>
                      <p>{a.description || "Không có mô tả"}</p>
                      <div className="assignment-meta">
                        <span>
                          <Clock3 size={16} />
                          Hạn {fullDate(a.due_at)}
                        </span>
                        <span>
                          <Users size={16} />
                          {student
                            ? submitted
                              ? "Đã nộp bài"
                              : "Chưa nộp bài"
                            : `${submitted}/${targetCount} học sinh đã nộp`}
                        </span>
                      </div>
                      <button
                        className="button full"
                        onClick={() => open("assignment-detail", a)}
                      >
                        {student ? "Xem bài tập" : "Xem & chấm bài"}
                        <ChevronRight size={16} />
                      </button>
                    </section>
                  );
                },
              )}
              {!data.assignments.length && (
                <Empty text="Chưa có bài tập được giao" />
              )}
            </div>
          )}

          {tab === "reports" && (
            <>
              <div className="stat-grid">
                <Stat
                  label="Tổng đã thu"
                  value={money(allReceived)}
                  detail="Giao dịch đã xác nhận"
                  icon={<Wallet size={21} />}
                  color="green"
                />
                <Stat
                  label="Công nợ hiện tại"
                  value={money(debt)}
                  detail="Tổng số tiền còn thiếu"
                  icon={<Clock3 size={21} />}
                  color="orange"
                />
                <Stat
                  label="Tỷ lệ có mặt"
                  value={`${data.attendance.length ? Math.round((data.attendance.filter((a: Row) => a.status === "present").length / data.attendance.length) * 100) : 0}%`}
                  detail={`${data.attendance.length} lượt điểm danh`}
                  icon={<ClipboardCheck size={21} />}
                  color="blue"
                />
                <Stat
                  label="Tỷ lệ nộp bài"
                  value={`${data.targets.length ? Math.round((new Set(data.submissions.map((s: Row) => s.assignment_id + ":" + s.student_id)).size / data.targets.length) * 100) : 0}%`}
                  detail="Tính theo học sinh được giao bài"
                  icon={<BookOpen size={21} />}
                  color="purple"
                />
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Học phí đã thu theo tháng</h2>
                </div>
                <Chart />
              </section>
              <section className="panel table-panel">
                <div className="panel-heading">
                  <h2>Lịch sử nhận tiền</h2>
                  <a
                    className="button small"
                    href={accountApiUrl("/api/export", initial.actor.id)}
                  >
                    <Download size={15} />
                    Xuất CSV
                  </a>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Thời gian</th>
                        <th>Học sinh</th>
                        <th>Mã giao dịch</th>
                        <th>Kênh</th>
                        <th>Số tiền</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.payments.map((p: Row) => (
                        <tr key={p.id}>
                          <td>{fullDate(p.paid_at)}</td>
                          <td>
                            {
                              data.invoices.find(
                                (i: Row) => i.id === p.invoice_id,
                              )?.student_name
                            }
                          </td>
                          <td>
                            <code>{p.transaction_id}</code>
                          </td>
                          <td>
                            {p.provider === "demo" ? "Mô phỏng" : "payOS"}
                          </td>
                          <td className="green-text">
                            <strong>{money(p.amount)}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!data.payments.length && <Empty text="Chưa có giao dịch" />}
              </section>
            </>
          )}

          {tab === "teachers" && owner && (
            <div className="class-grid">
              {data.teachers.map((t: Row) => (
                <section className="panel teacher-card" key={t.id}>
                  <span className="avatar large mint">
                    {t.name
                      .split(" ")
                      .slice(-2)
                      .map((s: string) => s[0])
                      .join("")}
                  </span>
                  <h2>{t.name}</h2>
                  <p>{t.email}</p>
                  <Badge>
                    {t.role === "owner" ? "Chủ trung tâm" : "Giáo viên"}
                  </Badge>
                  <div className="class-metadata">
                    <span>
                      {
                        data.classes.filter((c: Row) => c.teacher_id === t.id)
                          .length
                      }{" "}
                      lớp học
                    </span>
                    <span>
                      {
                        data.students.filter(
                          (s: Row) =>
                            s.teacher_id === t.id ||
                            data.enrollments.some(
                              (e: Row) =>
                                e.student_id === s.id &&
                                !e.ended_at &&
                                data.classes.some(
                                  (c: Row) =>
                                    c.id === e.class_id &&
                                    c.teacher_id === t.id,
                                ),
                            ),
                        ).length
                      }{" "}
                      học sinh
                    </span>
                  </div>
                  {t.role === "teacher" && (
                    <button
                      className="button"
                      style={{ marginTop: 20 }}
                      disabled={busy}
                      onClick={async () => {
                        const r = await run(
                          "teacher.activation",
                          { teacher_id: t.id },
                          false,
                        );
                        if (r) {
                          setResult(r);
                          setDialog({ type: "activation" });
                        }
                      }}
                    >
                      Cấp lại mã kích hoạt
                    </button>
                  )}
                </section>
              ))}
            </div>
          )}

          {tab === "settings" && !student && (
            <div className="settings-grid">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Tài khoản nhận học phí</h2>
                    <p>Mỗi giáo viên một tài khoản ngân hàng riêng</p>
                  </div>
                  <button className="button" onClick={() => open("bank")}>
                    <Settings size={16} />
                    Cấu hình
                  </button>
                </div>
                {data.banks.length ? (
                  data.banks.map((b: Row) => (
                    <div className="bank-card" key={b.teacher_id}>
                      <div className="bank-icon">
                        <CreditCard size={24} />
                      </div>
                      <div>
                        <strong>{b.bank}</strong>
                        <p>{b.account_name}</p>
                        <code>{b.account_number}</code>
                        <small>
                          {
                            data.teachers.find(
                              (t: Row) => t.id === b.teacher_id,
                            )?.name
                          }
                        </small>
                      </div>
                      <Badge status={b.connected ? "present" : "unpaid"}>
                        {b.connected ? "Đã lưu kết nối" : "Chưa kết nối"}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <Empty text="Chưa cấu hình tài khoản nhận tiền" />
                )}
                <div className="panel-footer">
                  <button
                    className="button"
                    disabled={busy || data.demo}
                    onClick={() => void run("payment.connect", {}, false)}
                  >
                    <RefreshCw size={16} />
                    Đăng ký webhook của tôi
                  </button>
                  <p>
                    Cần cấu hình khóa payOS và địa chỉ HTTPS công khai trước khi
                    kết nối.
                  </p>
                </div>
              </section>
              <section className="panel settings-details">
                <h2>Quy tắc trung tâm</h2>
                <dl>
                  <div>
                    <dt>Ngôn ngữ / tiền tệ</dt>
                    <dd>Tiếng Việt / VND</dd>
                  </div>
                  <div>
                    <dt>Múi giờ</dt>
                    <dd>Việt Nam (UTC+7)</dd>
                  </div>
                  <div>
                    <dt>Học phí mỗi buổi</dt>
                    <dd>50.000đ</dd>
                  </div>
                  <div>
                    <dt>Vắng có phép</dt>
                    <dd>Không tính phí</dd>
                  </div>
                  <div>
                    <dt>Vắng không phép</dt>
                    <dd>Tính phí đầy đủ</dd>
                  </div>
                  <div>
                    <dt>Kỳ thu tiền</dt>
                    <dd>Cuối tháng</dd>
                  </div>
                  <div>
                    <dt>Lịch sử thanh toán</dt>
                    <dd>Giữ tối thiểu 3 tháng, chưa tự xóa</dd>
                  </div>
                </dl>
                <a
                  className="button"
                  href={accountApiUrl(
                    "/api/export?type=json",
                    initial.actor.id,
                  )}
                >
                  <Download size={16} />
                  Xuất dữ liệu được phép truy cập
                </a>
              </section>
            </div>
          )}

          {tab === "audit" && !student && (
            <section className="panel table-panel">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Thời gian</th>
                      <th>Người thực hiện</th>
                      <th>Thao tác</th>
                      <th>Đối tượng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.audit_logs.map((l: Row) => (
                      <tr key={l.id}>
                        <td>{fullDate(l.created_at)}</td>
                        <td>{l.actor_name || "Hệ thống thanh toán"}</td>
                        <td>{actionNames[l.action] || "Cập nhật dữ liệu"}</td>
                        <td>
                          {entityNames[l.entity] || "Dữ liệu"} ·{" "}
                          {l.entity_id.slice(0, 12)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.audit_logs.length && <Empty text="Chưa có hoạt động" />}
            </section>
          )}

          {tab === "notifications" && (
            <section className="panel">
              <div className="panel-heading">
                <h2>Cập nhật của bạn</h2>
                <button
                  className="text-button"
                  onClick={() => void run("notifications.read", {}, false)}
                >
                  Đánh dấu đã đọc
                </button>
              </div>
              {data.notifications.map((n: Row) => (
                <div
                  className={`notification-row ${n.read_at ? "" : "unread"}`}
                  key={n.id}
                >
                  <span className="subject-mark">
                    <Bell size={20} />
                  </span>
                  <div>
                    <strong>{n.title}</strong>
                    <p>{n.body}</p>
                    <small>{fullDate(n.created_at)}</small>
                  </div>
                  {!n.read_at && <i className="dot blue" />}
                </div>
              ))}
              {!data.notifications.length && (
                <Empty text="Bạn chưa có thông báo mới" />
              )}
            </section>
          )}
          <footer className="page-footer">
            <span>ClassFlow · Để mỗi buổi học đều trọn vẹn.</span>
            <span>
              <ShieldCheck size={14} />
              Không gian riêng của bạn
            </span>
          </footer>
        </div>
      </main>

      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {toast}
        </div>
      )}
      {dialog && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) {
              setDialog(null);
              setResult(null);
            }
          }}
        >
          <section
            className={`modal ${["attendance", "assignment-detail", "class-detail", "invoice-detail"].includes(dialog.type) ? "wide" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={dialogTitle(dialog.type)}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">CLASSFLOW</span>
                <h2>{dialogTitle(dialog.type)}</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Đóng"
                disabled={busy}
                onClick={() => {
                  setDialog(null);
                  setResult(null);
                }}
              >
                <X size={22} />
              </button>
            </div>
            {error && (
              <div className="alert danger" role="alert">
                {error}
              </div>
            )}
            {result &&
            ["student", "teacher", "activation"].includes(dialog.type) ? (
              <div className="activation-result">
                <span className="success-icon">
                  <Check size={30} />
                </span>
                <h3>Tài khoản đã sẵn sàng</h3>
                <p>
                  Gửi thông tin này cho người dùng. Mã có hiệu lực 48 giờ và chỉ
                  dùng một lần.
                </p>
                <label>
                  Tên đăng nhập
                  <input readOnly value={result.username || ""} />
                </label>
                <label>
                  Mã kích hoạt
                  <input readOnly value={result.activation_code} />
                </label>
                <button
                  className="button primary full"
                  onClick={() => {
                    void navigator.clipboard.writeText(
                      `Tài khoản: ${result.username}\nMã kích hoạt: ${result.activation_code}\nKích hoạt tại: ${window.location.origin}/login`,
                    );
                    setToast("Đã sao chép thông tin kích hoạt.");
                  }}
                >
                  <Copy size={17} />
                  Sao chép thông tin
                </button>
              </div>
            ) : (
              <>
                {[
                  "student",
                  "student-edit",
                  "class",
                  "class-edit",
                  "class-assign",
                  "import",
                  "teacher",
                  "enroll",
                  "schedule",
                  "move",
                  "generate",
                  "adjust",
                  "assignment",
                  "submit",
                  "grade",
                  "bank",
                  "attendance",
                ].includes(dialog.type) && (
                  <form
                    ref={formRef}
                    onSubmit={submitForm}
                    className="modal-form"
                  >
                    {dialog.type === "import" && (
                      <>
                        <TeacherSelect
                          allowEmpty
                          emptyLabel="Trung tâm quản lý"
                        />
                        <label>
                          Danh sách học sinh CSV
                          <input
                            name="csv"
                            type="file"
                            accept=".csv,text/csv"
                            required
                          />
                        </label>
                        <p className="form-hint">
                          Các cột: ho_ten, truong, dien_thoai, ghi_chu. Tối đa
                          500 học sinh. Sau khi nhập, tải về danh sách tài khoản
                          và mã kích hoạt để cấp riêng cho từng học sinh.
                        </p>
                      </>
                    )}
                    {dialog.type === "student-edit" && (
                      <>
                        <Field
                          label="Họ và tên"
                          name="name"
                          value={dialog.item!.name}
                        />
                        <Field
                          label="Trường học"
                          name="school"
                          value={dialog.item!.school}
                          required={false}
                        />
                        <Field
                          label="Số điện thoại"
                          name="phone"
                          value={dialog.item!.phone}
                          required={false}
                        />
                        <Select
                          name="status"
                          label="Trạng thái hồ sơ"
                          defaultValue={dialog.item!.status}
                        >
                          <option value="active">Đang học</option>
                          <option value="paused">Tạm nghỉ</option>
                          <option value="left">Đã nghỉ</option>
                        </Select>
                        <label>
                          Ghi chú
                          <textarea
                            name="notes"
                            defaultValue={dialog.item!.notes}
                            rows={3}
                          />
                        </label>
                      </>
                    )}
                    {dialog.type === "class-edit" && (
                      <>
                        <Field
                          label="Tên lớp"
                          name="name"
                          value={dialog.item!.name}
                        />
                        <Field
                          label="Môn học"
                          name="subject"
                          value={dialog.item!.subject}
                        />
                        <Field
                          label="Khối / trình độ"
                          name="level"
                          value={dialog.item!.level}
                          required={false}
                        />
                        <Field
                          label="Phòng học"
                          name="room"
                          value={dialog.item!.room}
                          required={false}
                        />
                        <Field
                          label="Sĩ số tối đa"
                          name="capacity"
                          type="number"
                          min={1}
                          max={200}
                          value={dialog.item!.capacity}
                        />
                      </>
                    )}
                    {dialog.type === "student" && (
                      <>
                        <Field label="Họ và tên" name="name" />
                        <div className="form-grid">
                          <Field
                            label="Trường học"
                            name="school"
                            required={false}
                          />
                          <Field
                            label="Số điện thoại liên hệ"
                            name="phone"
                            required={false}
                          />
                        </div>
                        <TeacherSelect
                          allowEmpty
                          emptyLabel="Trung tâm quản lý"
                        />
                        <label>
                          Ghi chú
                          <textarea name="notes" rows={3} />
                        </label>
                        <p className="form-hint">
                          Hệ thống tạo hồ sơ và mã kích hoạt. Bạn có thể thêm
                          học sinh vào lớp sau.
                        </p>
                      </>
                    )}
                    {dialog.type === "class" && (
                      <>
                        <Field
                          label="Tên lớp"
                          name="name"
                          placeholder="Ví dụ: Toán 9 · Nền tảng"
                        />
                        <div className="form-grid">
                          <Field label="Môn học" name="subject" />
                          <Field
                            label="Khối / trình độ"
                            name="level"
                            required={false}
                          />
                          <Field
                            label="Phòng học"
                            name="room"
                            required={false}
                          />
                          <Field
                            label="Sĩ số tối đa"
                            name="capacity"
                            type="number"
                            value={30}
                            min={1}
                            max={200}
                          />
                        </div>
                        <TeacherSelect
                          allowEmpty
                          label="Giáo viên được phân công"
                        />
                        <div className="alert info">
                          Học phí cố định 50.000đ/buổi. Vắng có phép không tính
                          tiền.
                        </div>
                      </>
                    )}
                    {dialog.type === "teacher" && (
                      <>
                        <Field label="Họ tên giáo viên" name="name" />
                        <Field
                          label="Email đăng nhập"
                          name="email"
                          type="email"
                        />
                        <p className="form-hint">
                          Giáo viên tự đặt mật khẩu bằng mã kích hoạt và chỉ
                          quản lý lớp của mình.
                        </p>
                      </>
                    )}
                    {dialog.type === "class-assign" && (
                      <>
                        <p>
                          Phân công giáo viên cho lớp{" "}
                          <strong>{dialog.item!.name}</strong>.
                        </p>
                        <TeacherSelect
                          allowEmpty
                          label="Giáo viên phụ trách"
                          defaultValue={dialog.item!.teacher_id || ""}
                        />
                        <p className="form-hint">
                          Chỉ cập nhật giáo viên của các buổi chưa khóa. Điểm
                          danh đã khóa, khoản thu và lịch sử thanh toán được giữ
                          nguyên.
                        </p>
                      </>
                    )}
                    {dialog.type === "enroll" && (
                      <>
                        <p>
                          Thêm học sinh vào <strong>{dialog.item!.name}</strong>
                          .
                        </p>
                        <StudentPicker
                          key={dialog.item!.id}
                          selected={enrollmentSelection}
                          onChange={setEnrollmentSelection}
                          available={enrollmentSlots}
                          disabled={busy}
                          students={data.students.filter(
                            (s: Row) =>
                              !data.enrollments.some(
                                (e: Row) =>
                                  e.class_id === dialog.item!.id &&
                                  e.student_id === s.id &&
                                  !e.ended_at,
                              ),
                          )}
                        />
                        <p className="form-hint">
                          Học sinh mới không được giao lại các bài tập cũ.
                        </p>
                      </>
                    )}
                    {dialog.type === "schedule" && (
                      <>
                        <Select name="class_id" label="Lớp học">
                          <ClassOptions />
                        </Select>
                        <Select
                          name="weekday"
                          label="Ngày trong tuần"
                          defaultValue="1"
                        >
                          {[
                            "Chủ Nhật",
                            "Thứ Hai",
                            "Thứ Ba",
                            "Thứ Tư",
                            "Thứ Năm",
                            "Thứ Sáu",
                            "Thứ Bảy",
                          ].map((n, i) => (
                            <option value={i} key={i}>
                              {n}
                            </option>
                          ))}
                        </Select>
                        <div className="form-grid">
                          <Field
                            label="Giờ bắt đầu"
                            name="start_time"
                            type="time"
                            value="18:00"
                          />
                          <Field
                            label="Giờ kết thúc"
                            name="end_time"
                            type="time"
                            value="19:30"
                          />
                          <Field
                            label="Từ ngày"
                            name="start_date"
                            type="date"
                            value={today()}
                            min={today()}
                          />
                          <Field
                            label="Đến ngày"
                            name="end_date"
                            type="date"
                            min={today()}
                          />
                        </div>
                        <p className="form-hint">
                          Tự tạo các buổi học trong khoảng ngày; kiểm tra trùng
                          giáo viên và phòng.
                        </p>
                      </>
                    )}
                    {dialog.type === "move" && (
                      <>
                        <p>
                          {dialog.item!.class_name} · {fmt(dialog.item!.date)}
                        </p>
                        <Select name="scope" label="Áp dụng">
                          <option value="single">Chỉ buổi học này</option>
                          <option value="series">
                            Buổi này và các buổi chưa học tiếp theo trong chuỗi
                          </option>
                        </Select>
                        <Field
                          label="Ngày mới của buổi được chọn"
                          name="date"
                          type="date"
                          value={dialog.item!.date}
                          min={today()}
                        />
                        <div className="form-grid">
                          <Field
                            label="Giờ bắt đầu"
                            name="start_time"
                            type="time"
                            value={dialog.item!.start_time}
                          />
                          <Field
                            label="Giờ kết thúc"
                            name="end_time"
                            type="time"
                            value={dialog.item!.end_time}
                          />
                        </div>
                      </>
                    )}
                    {dialog.type === "generate" && (
                      <>
                        <Field
                          label="Tháng cần chốt"
                          name="period"
                          type="month"
                          value={month || today().slice(0, 7)}
                        />
                        <TeacherSelect />
                        <div className="alert info">
                          Chỉ chốt từ ngày cuối tháng, sau khi tất cả buổi học
                          đã khóa hoặc hủy. Thao tác lặp lại không tạo khoản thu
                          trùng.
                        </div>
                      </>
                    )}
                    {dialog.type === "adjust" && (
                      <>
                        <p>
                          {dialog.item!.student_name} · tháng{" "}
                          {dialog.item!.period}
                        </p>
                        <Field
                          label="Số tiền điều chỉnh (âm để giảm)"
                          name="amount"
                          type="number"
                          min={-100000000}
                          max={100000000}
                        />
                        <label>
                          Lý do điều chỉnh
                          <textarea
                            name="reason"
                            required
                            minLength={5}
                            rows={3}
                          />
                        </label>
                        <p className="form-hint">
                          Giữ nguyên điểm danh và khoản gốc. Điều chỉnh được ghi
                          vào lịch sử.
                        </p>
                      </>
                    )}
                    {dialog.type === "assignment" && (
                      <>
                        <Select name="class_id" label="Giao cho lớp">
                          <ClassOptions />
                        </Select>
                        <Field label="Tiêu đề bài tập" name="title" />
                        <label>
                          Nội dung / yêu cầu
                          <textarea name="description" rows={4} />
                        </label>
                        <div className="form-grid">
                          <Field
                            label="Hạn nộp (giờ Việt Nam)"
                            name="due_at"
                            type="datetime-local"
                          />
                          <Field
                            label="Thang điểm"
                            name="max_score"
                            type="number"
                            value={10}
                            min={1}
                            max={100}
                          />
                        </div>
                        <label>
                          File đề bài (tùy chọn)
                          <input
                            name="file"
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg"
                          />
                        </label>
                        <p className="form-hint">
                          Giao cho học sinh đang có trong lớp. Mỗi file tối đa
                          10 MB.
                        </p>
                      </>
                    )}
                    {dialog.type === "submit" && (
                      <>
                        <h3>{dialog.item!.title}</h3>
                        <label>
                          Nội dung bài làm
                          <textarea name="body" rows={7} maxLength={20000} />
                        </label>
                        <label>
                          Đính kèm bài làm
                          <input
                            name="file"
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg"
                          />
                        </label>
                        <p className="form-hint">
                          Nộp lại tạo phiên bản mới, giữ nguyên các lần nộp
                          trước. Mỗi file tối đa 10 MB.
                        </p>
                      </>
                    )}
                    {dialog.type === "grade" && (
                      <>
                        <p>
                          <strong>{dialog.item!.student_name}</strong> · Phiên
                          bản {dialog.item!.version}
                        </p>
                        <div className="submission-body">
                          {dialog.item!.body || "Bài nộp bằng file"}
                        </div>
                        {data.files
                          .filter(
                            (f: Row) => f.submission_id === dialog.item!.id,
                          )
                          .map((f: Row) => (
                            <a
                              className="file-link"
                              key={f.id}
                              href={accountApiUrl(
                                `/api/files/${f.id}`,
                                initial.actor.id,
                              )}
                            >
                              <Paperclip size={16} />
                              {f.name}
                            </a>
                          ))}
                        <Field
                          label="Điểm"
                          name="score"
                          type="number"
                          min={0}
                          max={
                            data.assignments.find(
                              (a: Row) => a.id === dialog.item!.assignment_id,
                            )?.max_score || 10
                          }
                          value={dialog.item!.score ?? undefined}
                        />
                        <label>
                          Nhận xét
                          <textarea
                            name="feedback"
                            rows={4}
                            defaultValue={dialog.item!.feedback || ""}
                          />
                        </label>
                      </>
                    )}
                    {dialog.type === "bank" && (
                      <>
                        <TeacherSelect />
                        <Select
                          name="bank"
                          label="Ngân hàng"
                          defaultValue={
                            data.banks.find(
                              (b: Row) => b.teacher_id === data.actor.id,
                            )?.bank
                          }
                        >
                          <option>Agribank</option>
                          <option>Techcombank</option>
                        </Select>
                        <Field
                          label="Số tài khoản"
                          name="account_number"
                          value={
                            data.banks.find(
                              (b: Row) => b.teacher_id === data.actor.id,
                            )?.account_number
                          }
                        />
                        <Field
                          label="Tên chủ tài khoản"
                          name="account_name"
                          value={
                            data.banks.find(
                              (b: Row) => b.teacher_id === data.actor.id,
                            )?.account_name
                          }
                        />
                        <details>
                          <summary>Kết nối payOS cho tài khoản này</summary>
                          <div className="details-fields">
                            <Field
                              label="Client ID"
                              name="client_id"
                              required={false}
                            />
                            <Field
                              label="API Key"
                              name="api_key"
                              type="password"
                              required={false}
                            />
                            <Field
                              label="Checksum Key"
                              name="checksum_key"
                              type="password"
                              required={false}
                            />
                            <p className="form-hint">
                              Khóa được mã hóa trên máy chủ. Để trống cả ba để
                              giữ kết nối hiện tại. Cần kiểm tra ngân hàng được
                              nhà cung cấp hỗ trợ.
                            </p>
                          </div>
                        </details>
                      </>
                    )}
                    {dialog.type === "attendance" && (
                      <>
                        <div className="attendance-heading">
                          <h3>{dialog.item!.class_name}</h3>
                          <span>
                            {fmt(dialog.item!.date)} · {dialog.item!.start_time}{" "}
                            – {dialog.item!.end_time}
                          </span>
                          <Badge status={dialog.item!.status} />
                        </div>
                        {dialog.item!.status === "locked" && (
                          <div className="alert info">
                            <LockKeyhole size={17} />
                            Buổi đã khóa. Chủ trung tâm có thể điều chỉnh học
                            phí riêng.
                          </div>
                        )}
                        <div className="attendance-table">
                          {eligibleMembers(dialog.item!).map((s: Row) => {
                            const current =
                              attendanceDraft[s.id] ||
                              data.attendance.find(
                                (a: Row) =>
                                  a.session_id === dialog.item!.id &&
                                  a.student_id === s.id,
                              )?.status;
                            return (
                              <div className="attendance-student" key={s.id}>
                                <strong>{s.name}</strong>
                                <div className="attendance-options">
                                  {["present", "excused", "absent"].map(
                                    (st) => (
                                      <button
                                        type="button"
                                        key={st}
                                        disabled={
                                          dialog.item!.status === "locked"
                                        }
                                        className={`${st} ${current === st ? "selected" : ""}`}
                                        onClick={() =>
                                          setAttendanceDraft((prev) => ({
                                            ...prev,
                                            [s.id]: st,
                                          }))
                                        }
                                      >
                                        {labels[st]}
                                      </button>
                                    ),
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {dialog.item!.status !== "locked" && (
                          <Select name="lock" label="Sau khi lưu">
                            <option value="no">Lưu điểm danh, chưa khóa</option>
                            <option value="yes">
                              Khóa buổi học (không thể sửa lại)
                            </option>
                          </Select>
                        )}
                      </>
                    )}
                    {!(
                      dialog.type === "attendance" &&
                      dialog.item!.status === "locked"
                    ) && (
                      <div className="modal-actions">
                        <button
                          type="button"
                          className="button"
                          disabled={busy}
                          onClick={() => setDialog(null)}
                        >
                          Hủy
                        </button>
                        <button
                          className="button primary"
                          disabled={
                            busy ||
                            (dialog.type === "enroll" &&
                              (!enrollmentSelection.length ||
                                enrollmentSelection.length > enrollmentSlots ||
                                enrollmentSelection.length > 500))
                          }
                        >
                          {busy
                            ? "Đang lưu…"
                            : dialog.type === "submit"
                              ? "Nộp bài"
                              : dialog.type === "enroll"
                                ? `Thêm ${enrollmentSelection.length} học sinh`
                                : "Lưu thay đổi"}
                        </button>
                      </div>
                    )}
                  </form>
                )}

                {dialog.type === "class-detail" && (
                  <div className="detail-content">
                    <div className="detail-summary">
                      <h3>{dialog.item!.name}</h3>
                      <p>
                        {dialog.item!.subject} · {dialog.item!.teacher_name} ·{" "}
                        {money(dialog.item!.fee)}/buổi
                      </p>
                    </div>
                    <h3>{student ? "Thông tin lớp" : "Học sinh trong lớp"}</h3>
                    {!student && (
                      <div className="member-list">
                        {data.enrollments
                          .filter(
                            (e: Row) =>
                              e.class_id === dialog.item!.id && !e.ended_at,
                          )
                          .map((e: Row) => {
                            const s = data.students.find(
                              (s: Row) => s.id === e.student_id,
                            );
                            return (
                              <div key={e.id}>
                                <span className="avatar mint">
                                  {s?.name.slice(0, 1)}
                                </span>
                                <strong>{s?.name}</strong>
                                <button
                                  className="text-button danger-text"
                                  onClick={() =>
                                    open("unenroll", {
                                      ...s,
                                      class_id: dialog.item!.id,
                                    })
                                  }
                                >
                                  Cho nghỉ lớp
                                </button>
                              </div>
                            );
                          })}
                      </div>
                    )}
                    <h3>Lịch học sắp tới</h3>
                    <SessionRows
                      items={data.sessions
                        .filter(
                          (s: Row) =>
                            s.class_id === dialog.item!.id && s.date >= today(),
                        )
                        .slice(0, 8)}
                    />
                    {!student && (
                      <div className="modal-actions">
                        <button
                          className="button"
                          onClick={() => open("class-edit", dialog.item)}
                        >
                          Sửa lớp
                        </button>
                        {owner && (
                          <button
                            className="button primary"
                            onClick={() => open("class-assign", dialog.item)}
                          >
                            {dialog.item!.teacher_id
                              ? "Đổi giáo viên"
                              : "Phân công giáo viên"}
                          </button>
                        )}
                        <button
                          className="button"
                          onClick={() => open("enroll", dialog.item)}
                        >
                          Thêm học sinh
                        </button>
                        <button
                          className="button primary"
                          onClick={() => open("schedule")}
                          disabled={!dialog.item!.teacher_id}
                          title={
                            !dialog.item!.teacher_id
                              ? "Phân công giáo viên trước khi tạo lịch học"
                              : undefined
                          }
                        >
                          Thêm lịch học
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {dialog.type === "unenroll" && (
                  <div className="detail-content">
                    <p>
                      Cho <strong>{dialog.item!.name}</strong> nghỉ lớp? Lịch sử
                      điểm danh, bài nộp và học phí đã phát sinh vẫn được giữ.
                    </p>
                    <div className="modal-actions">
                      <button
                        className="button"
                        onClick={() => setDialog(null)}
                      >
                        Quay lại
                      </button>
                      <button
                        className="button danger-button"
                        disabled={busy}
                        onClick={() =>
                          void run("class.unenroll", {
                            class_id: dialog.item!.class_id,
                            student_id: dialog.item!.id,
                          })
                        }
                      >
                        Xác nhận nghỉ lớp
                      </button>
                    </div>
                  </div>
                )}
                {["session", "session-detail"].includes(dialog.type) && (
                  <div className="detail-content">
                    <h3>{dialog.item!.class_name}</h3>
                    <p>
                      {fmt(dialog.item!.date)} · {dialog.item!.start_time} –{" "}
                      {dialog.item!.end_time}
                    </p>
                    <p>Phòng: {dialog.item!.room || "Chưa có phòng"}</p>
                    <Badge status={dialog.item!.status} />
                    {!student && dialog.item!.status === "scheduled" && (
                      <div className="session-actions">
                        <button
                          className="button primary"
                          onClick={() => open("attendance", dialog.item)}
                        >
                          <ClipboardCheck size={17} />
                          Điểm danh
                        </button>
                        <button
                          className="button"
                          onClick={() => open("move", dialog.item)}
                        >
                          Đổi lịch
                        </button>
                        <button
                          className="button danger-button"
                          onClick={() => open("cancel-session", dialog.item)}
                        >
                          Hủy buổi học
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {dialog.type === "cancel-session" && (
                  <div className="detail-content">
                    <p>
                      Hủy buổi <strong>{dialog.item!.class_name}</strong> ngày{" "}
                      {fmt(dialog.item!.date)}? Buổi bị hủy không tính học phí.
                    </p>
                    <div className="modal-actions">
                      <button
                        className="button"
                        onClick={() => setDialog(null)}
                      >
                        Quay lại
                      </button>
                      <button
                        className="button danger-button"
                        disabled={busy}
                        onClick={() =>
                          void run("session.cancel", {
                            session_id: dialog.item!.id,
                          })
                        }
                      >
                        Xác nhận hủy
                      </button>
                    </div>
                  </div>
                )}
                {dialog.type === "invoice-detail" && (
                  <div className="detail-content">
                    <div className="invoice-title">
                      <div>
                        <h3>{dialog.item!.student_name}</h3>
                        <p>Học phí tháng {dialog.item!.period}</p>
                      </div>
                      <Badge
                        status={
                          data.invoices.find(
                            (i: Row) => i.id === dialog.item!.id,
                          )?.status || dialog.item!.status
                        }
                      />
                    </div>
                    <div className="invoice-lines">
                      {data.invoice_lines
                        .filter((l: Row) => l.invoice_id === dialog.item!.id)
                        .map((l: Row) => (
                          <div key={l.id}>
                            <span>{l.label}</span>
                            <strong>{money(l.amount)}</strong>
                          </div>
                        ))}
                    </div>
                    <h3>Điều chỉnh</h3>
                    {data.adjustments
                      .filter((a: Row) => a.invoice_id === dialog.item!.id)
                      .map((a: Row) => (
                        <div className="invoice-adjustment" key={a.id}>
                          <span>
                            {a.reason}
                            <small>
                              {a.actor_name} · {fullDate(a.created_at)}
                            </small>
                          </span>
                          <strong>{money(a.amount)}</strong>
                        </div>
                      ))}
                    <div className="invoice-total">
                      <span>Tổng phải thu</span>
                      <strong>
                        {money(
                          data.invoices.find(
                            (i: Row) => i.id === dialog.item!.id,
                          )?.total || 0,
                        )}
                      </strong>
                    </div>
                    <h3>Lịch sử thanh toán</h3>
                    {data.payments
                      .filter((p: Row) => p.invoice_id === dialog.item!.id)
                      .map((p: Row) => (
                        <div className="invoice-adjustment" key={p.id}>
                          <span>
                            {p.provider === "demo"
                              ? "Mô phỏng"
                              : "Chuyển khoản"}
                            <small>
                              {fullDate(p.paid_at)} · {p.transaction_id}
                            </small>
                          </span>
                          <strong className="green-text">
                            {money(p.amount)}
                          </strong>
                        </div>
                      ))}
                    <div className="modal-actions">
                      {owner && (
                        <button
                          className="button"
                          onClick={() => open("adjust", dialog.item)}
                        >
                          Điều chỉnh học phí
                        </button>
                      )}
                      <button
                        className="button"
                        disabled={busy || data.demo}
                        onClick={() =>
                          void run(
                            "payment.reconcile",
                            { invoice_id: dialog.item!.id },
                            false,
                          )
                        }
                      >
                        <RefreshCw size={16} />
                        Đối soát lại
                      </button>
                      {Number(
                        data.invoices.find((i: Row) => i.id === dialog.item!.id)
                          ?.balance,
                      ) > 0 && (
                        <button
                          className="button primary"
                          disabled={busy}
                          onClick={() => void payment(dialog.item!)}
                        >
                          Tạo QR thanh toán
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {dialog.type === "payment" && result && (
                  <div className="payment-content">
                    {result.demo && (
                      <div className="alert info">
                        QR mô phỏng — không dùng để chuyển tiền thật.
                      </div>
                    )}
                    <p>
                      {dialog.item!.student_name} · Tháng {dialog.item!.period}
                    </p>
                    <h3>{money(result.amount)}</h3>
                    <img
                      className="qr-image"
                      src={result.qr_image}
                      alt={
                        result.demo
                          ? "Mã QR mô phỏng"
                          : "Mã QR thanh toán học phí"
                      }
                    />
                    <p className="form-hint">
                      {result.demo
                        ? "Mô phỏng giao dịch để kiểm tra cập nhật công nợ."
                        : "Quét QR để thanh toán. Trạng thái tự cập nhật khi máy chủ xác nhận giao dịch."}
                    </p>
                    {result.checkout_url && (
                      <a
                        href={result.checkout_url}
                        target="_blank"
                        rel="noreferrer"
                        className="button primary full"
                      >
                        Mở trang thanh toán
                      </a>
                    )}
                    {result.demo && !student && (
                      <button
                        className="button primary full"
                        disabled={busy}
                        onClick={() =>
                          void run("payment.simulate", {
                            request_id: result.id,
                          })
                        }
                      >
                        Mô phỏng đã nhận tiền
                      </button>
                    )}
                    <button
                      className="button full"
                      disabled={busy}
                      onClick={async () => {
                        await refresh();
                        const latest = await accountFetch("/api/data").then(
                          (r) => r.json(),
                        );
                        const invoice = latest.invoices?.find(
                          (i: Row) => i.id === dialog.item!.id,
                        );
                        setToast(
                          invoice?.balance <= 0
                            ? "Học phí đã thanh toán đủ."
                            : "Đang chờ xác nhận thanh toán.",
                        );
                        if (invoice?.balance <= 0) setDialog(null);
                      }}
                    >
                      Kiểm tra trạng thái
                    </button>
                  </div>
                )}
                {dialog.type === "accept-review" && (
                  <div className="detail-content">
                    <p>
                      <strong>{dialog.item!.student_name}</strong> ·{" "}
                      {money(dialog.item!.amount)}
                    </p>
                    <p>{dialog.item!.note}</p>
                    <p>
                      Mã giao dịch: <code>{dialog.item!.transaction_id}</code>
                    </p>
                    <div className="alert info">
                      Xác nhận sẽ ghi nhận toàn bộ số tiền, phần vượt học phí
                      được thể hiện là số dư của khoản thu.
                    </div>
                    <div className="modal-actions">
                      <button
                        className="button"
                        onClick={() => setDialog(null)}
                      >
                        Để sau
                      </button>
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() =>
                          void run("payment.accept", {
                            event_id: dialog.item!.id,
                          })
                        }
                      >
                        Xác nhận ghi nhận tiền
                      </button>
                    </div>
                  </div>
                )}
                {dialog.type === "assignment-detail" &&
                  (() => {
                    const a =
                        data.assignments.find(
                          (a: Row) => a.id === dialog.item!.id,
                        ) || dialog.item!,
                      closed =
                        !!a.closed_at || Date.parse(a.due_at) <= Date.now(),
                      subs = data.submissions.filter(
                        (s: Row) => s.assignment_id === a.id,
                      );
                    return (
                      <div className="detail-content">
                        <div className="assignment-detail-heading">
                          <Badge>{a.class_name}</Badge>
                          <Badge status={closed ? "locked" : "present"}>
                            {closed ? "Đã đóng" : "Đang nhận bài"}
                          </Badge>
                        </div>
                        <h3>{a.title}</h3>
                        <p className="pre-wrap">{a.description}</p>
                        <p className="form-hint">
                          Hạn nộp {fullDate(a.due_at)} · Thang điểm{" "}
                          {a.max_score}
                        </p>
                        {data.files
                          .filter(
                            (f: Row) =>
                              f.assignment_id === a.id && !f.submission_id,
                          )
                          .map((f: Row) => (
                            <a
                              className="file-link"
                              href={accountApiUrl(
                                `/api/files/${f.id}`,
                                initial.actor.id,
                              )}
                              key={f.id}
                            >
                              <Paperclip size={16} />
                              {f.name}
                            </a>
                          ))}
                        <div className="section-inline-heading">
                          <h3>
                            {student
                              ? "Các lần nộp của bạn"
                              : "Bài nộp của học sinh"}
                          </h3>
                          {student && !closed && (
                            <button
                              className="button primary"
                              onClick={() => open("submit", a)}
                            >
                              <Upload size={16} />
                              {subs.length ? "Nộp lại" : "Nộp bài"}
                            </button>
                          )}
                          {!student && !closed && (
                            <button
                              className="button"
                              onClick={() => open("close-assignment", a)}
                            >
                              <LockKeyhole size={16} />
                              Khóa nhận bài
                            </button>
                          )}
                        </div>
                        {subs.length ? (
                          subs.map((s: Row) => (
                            <div className="submission-card" key={s.id}>
                              <div>
                                <strong>
                                  {s.student_name} · Lần {s.version}
                                </strong>
                                <small>{fullDate(s.submitted_at)}</small>
                              </div>
                              <p>{s.body || "Bài làm đính kèm"}</p>
                              {data.files
                                .filter((f: Row) => f.submission_id === s.id)
                                .map((f: Row) => (
                                  <a
                                    className="file-link"
                                    href={accountApiUrl(
                                      `/api/files/${f.id}`,
                                      initial.actor.id,
                                    )}
                                    key={f.id}
                                  >
                                    <Paperclip size={15} />
                                    {f.name}
                                  </a>
                                ))}
                              {s.score !== null && s.score !== undefined && (
                                <div className="grade-feedback">
                                  <strong>
                                    {s.score}/{a.max_score} điểm
                                  </strong>
                                  <p>{s.feedback}</p>
                                </div>
                              )}
                              {!student && (
                                <button
                                  className="button small"
                                  onClick={() => open("grade", s)}
                                >
                                  {s.score !== null
                                    ? "Sửa nhận xét / điểm"
                                    : "Chấm bài"}
                                </button>
                              )}
                            </div>
                          ))
                        ) : (
                          <Empty text="Chưa có bài nộp" />
                        )}
                      </div>
                    );
                  })()}
                {dialog.type === "close-assignment" && (
                  <div className="detail-content">
                    <p>
                      Khóa nhận bài <strong>{dialog.item!.title}</strong>? Học
                      sinh không thể nộp thêm hoặc nộp lại, các bài đã nộp vẫn
                      được giữ.
                    </p>
                    <div className="modal-actions">
                      <button
                        className="button"
                        onClick={() => setDialog(null)}
                      >
                        Quay lại
                      </button>
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() =>
                          void run("assignment.close", {
                            assignment_id: dialog.item!.id,
                          })
                        }
                      >
                        Khóa nhận bài
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  detail,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <section className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className={`stat-icon ${color}`}>{icon}</span>
      </div>
      <strong className="stat-value">{value}</strong>
      <p>{detail}</p>
    </section>
  );
}
function dialogTitle(type: string) {
  return (
    (
      {
        student: "Thêm học sinh",
        "student-edit": "Sửa hồ sơ học sinh",
        "class-edit": "Sửa lớp học",
        "class-assign": "Phân công giáo viên",
        import: "Nhập học sinh từ CSV",
        class: "Tạo lớp học",
        teacher: "Thêm giáo viên",
        enroll: "Thêm học sinh vào lớp",
        schedule: "Tạo lịch học định kỳ",
        move: "Đổi lịch học",
        generate: "Chốt học phí cuối tháng",
        adjust: "Điều chỉnh học phí",
        assignment: "Giao bài tập",
        submit: "Nộp bài làm",
        grade: "Chấm bài và nhận xét",
        bank: "Tài khoản ngân hàng",
        attendance: "Điểm danh buổi học",
        activation: "Mã kích hoạt",
        "class-detail": "Chi tiết lớp học",
        unenroll: "Cho học sinh nghỉ lớp",
        session: "Buổi học",
        "session-detail": "Thông tin buổi học",
        "cancel-session": "Hủy buổi học",
        "invoice-detail": "Chi tiết học phí",
        payment: "Thanh toán học phí",
        "accept-review": "Đối soát giao dịch",
        "assignment-detail": "Chi tiết bài tập",
        "close-assignment": "Khóa nhận bài",
      } as Record<string, string>
    )[type] || "Chi tiết"
  );
}
