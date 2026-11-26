"use client";
import { useState } from "react";
import {
  BookOpen,
  ShieldCheck,
  CalendarDays,
  GraduationCap,
  Eye,
  EyeOff,
} from "lucide-react";
export default function Login() {
  const [activate, setActivate] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [visible, setVisible] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const values = Object.fromEntries(new FormData(e.currentTarget));
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
      if (!response.ok) throw new Error(data.error);
      if (activate) {
        setSuccess(
          "Kích hoạt thành công. Đăng nhập bằng tài khoản giáo viên đã cấp.",
        );
        setActivate(false);
      } else window.location.assign("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể kết nối.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-shell">
      <section className="login-story">
        <a className="brand" href="/login">
          <span className="brand-icon">
            <BookOpen size={23} />
          </span>
          ClassFlow<span className="brand-dot">.</span>
        </a>
        <div className="story-content">
          <span className="eyebrow">DẠY HỌC NHẸ NHÀNG HƠN</span>
          <h1>
            Ít việc quản lý.
            <br />
            Nhiều giờ
            <br />
            <span>truyền cảm hứng.</span>
          </h1>
          <p>
            Một không gian cho lớp học, lịch dạy, học phí và những tiến bộ nhỏ
            mỗi ngày.
          </p>
          <div className="story-chips">
            <span>
              <CalendarDays size={17} /> Lịch học rõ ràng
            </span>
            <span>
              <GraduationCap size={19} /> Theo sát từng học sinh
            </span>
          </div>
          <div className="story-card">
            <div className="avatar mint">CF</div>
            <div>
              <strong>Mọi thứ đã sẵn sàng cho buổi học.</strong>
              <small>Điểm danh, giao bài và học phí ở cùng một nơi.</small>
            </div>
            <ShieldCheck size={26} />
          </div>
        </div>
        <small>Được thiết kế cho những lớp học nhiều tâm huyết.</small>
      </section>
      <section className="login-form-wrap">
        <div className="login-form">
          <span className="eyebrow">KHÔNG GIAN LỚP HỌC</span>
          <h2>{activate ? "Kích hoạt tài khoản" : "Chào mừng trở lại"}</h2>
          <p>
            {activate
              ? "Sử dụng mã giáo viên đã cấp để tạo mật khẩu."
              : "Đăng nhập để tiếp tục một ngày dạy và học."}
          </p>
          <form onSubmit={submit}>
            {activate ? (
              <label>
                Mã kích hoạt
                <input
                  name="code"
                  required
                  autoComplete="off"
                  placeholder="Nhập mã kích hoạt"
                  minLength={16}
                />
              </label>
            ) : (
              <label>
                Email hoặc tên đăng nhập
                <input
                  name="email"
                  required
                  autoComplete="username"
                  placeholder="Tài khoản của bạn"
                />
              </label>
            )}
            <label>
              {activate ? "Đặt mật khẩu" : "Mật khẩu"}
              <div className="password-input">
                <input
                  name="password"
                  type={visible ? "text" : "password"}
                  required
                  minLength={activate ? 10 : 1}
                  maxLength={128}
                  autoComplete={activate ? "new-password" : "current-password"}
                  placeholder={activate ? "Ít nhất 10 ký tự" : "Nhập mật khẩu"}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Hiện hoặc ẩn mật khẩu"
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {error && (
              <div className="alert danger" role="alert">
                {error}
              </div>
            )}
            {success && <div className="alert success">{success}</div>}
            <button className="button primary full" disabled={busy}>
              {busy
                ? "Đang xử lý…"
                : activate
                  ? "Kích hoạt tài khoản"
                  : "Đăng nhập"}
            </button>
          </form>
          <div className="login-switch">
            {activate ? "Đã có tài khoản?" : "Được giáo viên cấp mã?"}{" "}
            <button
              onClick={() => {
                setActivate(!activate);
                setError("");
              }}
            >
              {activate ? "Đăng nhập" : "Kích hoạt tài khoản"}
            </button>
          </div>
          <div className="help-box">
            <ShieldCheck size={19} />
            <p>
              Quên mật khẩu? Liên hệ giáo viên hoặc chủ trung tâm để được cấp
              lại mã kích hoạt.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
