"use client";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Eye,
  EyeOff,
  Globe2,
  ShieldCheck,
  X,
  GraduationCap,
  CalendarDays,
  ClipboardCheck,
} from "lucide-react";
import { TeacherIllustration, StudentIllustration } from "./login-art";
import {
  rememberAccount,
  validAccountId,
  workspacePath,
} from "@/lib/account-context";

export default function Login() {
  const [activate, setActivate] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [visible, setVisible] = useState(false),
    [info, setInfo] = useState<"about" | "help" | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!info) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") setInfo(null);
      if (event.key === "Tab") {
        const elements = Array.from(
          document.querySelectorAll<HTMLElement>(
            ".auth-info-dialog button,.auth-info-dialog a[href]",
          ),
        );
        const first = elements[0],
          last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [info]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          action: activate ? "activate" : "login",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không thể đăng nhập.");
      if (activate) {
        setSuccess(
          "Kích hoạt thành công. Đăng nhập bằng tài khoản đã được cấp.",
        );
        setActivate(false);
        setVisible(false);
      } else {
        if (!validAccountId(data.accountId))
          throw new Error(
            "Chưa thể xác định tài khoản. Vui lòng tải lại trang rồi đăng nhập.",
          );
        rememberAccount(data.accountId);
        window.location.assign(workspacePath(data.accountId));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể kết nối.");
    } finally {
      setBusy(false);
    }
  }
  function switchMode() {
    setActivate(!activate);
    setError("");
    setSuccess("");
    setVisible(false);
  }
  return (
    <main className="auth-layout">
      <header className="auth-topbar">
        <a
          className="brand auth-brand"
          href="/login"
          aria-label="ClassFlow — Trang đăng nhập"
        >
          <span className="brand-icon">
            <BookOpen size={23} />
          </span>
          ClassFlow<span className="brand-dot">.</span>
        </a>
        <nav className="auth-nav" aria-label="Thông tin ClassFlow">
          <button onClick={() => setInfo("about")}>Giới thiệu</button>
          <button onClick={() => setInfo("help")}>Hỗ trợ</button>
          <span className="auth-language">
            <Globe2 size={16} />
            Tiếng Việt
          </span>
        </nav>
      </header>
      <div className="auth-orbit auth-orbit-one" aria-hidden="true" />
      <div className="auth-orbit auth-orbit-two" aria-hidden="true" />
      <div className="auth-illustration auth-teacher">
        <TeacherIllustration />
      </div>
      <div className="auth-illustration auth-student">
        <StudentIllustration />
      </div>
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-card-intro">
          <span className="auth-kicker">
            <span />
            KHÔNG GIAN LỚP HỌC
          </span>
          <h1 id="auth-title">
            {activate ? "Kích hoạt tài khoản" : "Chào mừng trở lại"}
          </h1>
          <p>
            {activate
              ? "Một bước nhỏ để bắt đầu hành trình học tập."
              : "Một nơi cho mọi điều đang diễn ra trong lớp."}
          </p>
        </div>
        <form
          onSubmit={submit}
          className="auth-form"
          key={activate ? "activate" : "login"}
        >
          {activate ? (
            <label>
              Mã kích hoạt
              <input
                name="code"
                required
                minLength={16}
                maxLength={100}
                autoComplete="off"
                placeholder="Nhập mã giáo viên đã cấp"
                disabled={busy}
              />
            </label>
          ) : (
            <label>
              Email hoặc tên đăng nhập
              <input
                name="email"
                required
                maxLength={200}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="Nhập tài khoản của bạn"
                disabled={busy}
              />
            </label>
          )}
          <label>
            {activate ? "Đặt mật khẩu" : "Mật khẩu"}
            <div className="auth-password">
              <input
                name="password"
                type={visible ? "text" : "password"}
                required
                minLength={activate ? 10 : 1}
                maxLength={128}
                autoComplete={activate ? "new-password" : "current-password"}
                placeholder={activate ? "Ít nhất 10 ký tự" : "Nhập mật khẩu"}
                disabled={busy}
              />
              <button
                type="button"
                className="icon-button"
                aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                aria-pressed={visible}
                onClick={() => setVisible(!visible)}
                disabled={busy}
              >
                {visible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          {!activate && (
            <button
              type="button"
              className="auth-forgot"
              onClick={() => setInfo("help")}
            >
              Quên mật khẩu?
            </button>
          )}
          {error && (
            <div className="alert danger auth-alert" role="alert">
              {error}
            </div>
          )}
          {success && (
            <div className="alert success auth-alert" role="status">
              {success}
            </div>
          )}
          <button className="button primary full auth-submit" disabled={busy}>
            {busy
              ? "Đang xử lý…"
              : activate
                ? "Kích hoạt tài khoản"
                : "Đăng nhập"}
          </button>
        </form>
        <p className="auth-switch">
          {activate ? "Đã có tài khoản?" : "Được giáo viên cấp mã?"}{" "}
          <button type="button" onClick={switchMode} disabled={busy}>
            {activate ? "Đăng nhập" : "Kích hoạt tài khoản"}
          </button>
        </p>
        <div className="auth-card-foot">
          <ShieldCheck size={15} />
          <span>Không gian riêng. Kết nối việc dạy và học.</span>
        </div>
      </section>
      <footer className="auth-page-footer">
        <span>ClassFlow · Đồng hành cùng lớp học.</span>
        <span>Dạy tận tâm. Học mỗi ngày.</span>
      </footer>
      {info && (
        <div
          className="modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) setInfo(null);
          }}
        >
          <section
            className="modal auth-info-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-info-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">CLASSFLOW</span>
                <h2 id="auth-info-title">
                  {info === "about"
                    ? "Để việc dạy học nhẹ nhàng hơn"
                    : "Bạn cần hỗ trợ đăng nhập?"}
                </h2>
              </div>
              <button
                ref={closeRef}
                className="icon-button"
                onClick={() => setInfo(null)}
                aria-label="Đóng"
              >
                <X size={21} />
              </button>
            </div>
            {info === "about" ? (
              <>
                <p>
                  ClassFlow giúp trung tâm và giáo viên quản lý lớp học trong
                  cùng một không gian.
                </p>
                <ul className="auth-feature-list">
                  <li>
                    <CalendarDays size={21} />
                    <span>
                      <strong>Lịch học và điểm danh</strong>
                      <small>
                        Theo sát từng buổi học, chủ động lịch giảng dạy.
                      </small>
                    </span>
                  </li>
                  <li>
                    <ClipboardCheck size={21} />
                    <span>
                      <strong>Học phí rõ ràng</strong>
                      <small>Tính theo buổi, tổng hợp cuối tháng.</small>
                    </span>
                  </li>
                  <li>
                    <GraduationCap size={23} />
                    <span>
                      <strong>Bài tập và phản hồi</strong>
                      <small>Giao bài, nộp bài và theo dõi tiến bộ.</small>
                    </span>
                  </li>
                </ul>
              </>
            ) : (
              <div className="auth-help-content">
                <p>
                  <strong>Học sinh hoặc giáo viên:</strong> liên hệ giáo viên
                  quản lý hoặc chủ trung tâm để được cấp lại mã kích hoạt. Sau
                  đó chọn “Kích hoạt tài khoản” để đặt mật khẩu mới.
                </p>
                <p>
                  <strong>Chưa có tài khoản?</strong> Tài khoản được trung tâm
                  cấp riêng; hãy liên hệ người quản lý lớp.
                </p>
                <p>
                  <strong>Chủ trung tâm mới:</strong> dùng trang thiết lập một
                  lần để tạo admin đầu tiên.
                </p>
                <a className="button" href="/setup">
                  Thiết lập admin đầu tiên
                </a>
              </div>
            )}
            <button
              className="button primary full"
              onClick={() => setInfo(null)}
            >
              Đã hiểu
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
