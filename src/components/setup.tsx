"use client";
import { useState } from "react";
import {
  BookOpen,
  ShieldCheck,
  Copy,
  KeyRound,
  CheckCircle2,
} from "lucide-react";
export default function Setup() {
  const [token, setToken] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [copied, setCopied] = useState(false);
  function generate() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    setToken(
      Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""),
    );
    setCopied(false);
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = event.currentTarget,
      values = Object.fromEntries(new FormData(form));
    try {
      if (values.password !== values.confirm_password)
        throw new Error("Mật khẩu xác nhận không khớp.");
      const response = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Chưa thể tạo admin.");
      form.reset();
      setToken("");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể kết nối.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="setup-shell">
      <a href="/login" className="brand">
        <span className="brand-icon">
          <BookOpen size={22} />
        </span>
        ClassFlow<span className="brand-dot">.</span>
      </a>
      <section className="panel setup-panel">
        <div className="setup-title">
          <span className="subject-mark">
            <ShieldCheck size={25} />
          </span>
          <div>
            <span className="eyebrow">THIẾT LẬP MỘT LẦN</span>
            <h1>{done ? "Admin đã sẵn sàng" : "Tạo admin đầu tiên"}</h1>
          </div>
        </div>
        {done ? (
          <div className="setup-success">
            <CheckCircle2 size={44} />
            <h2>Đã tạo tài khoản quản trị</h2>
            <p>
              Đăng nhập bằng email và mật khẩu bạn vừa đặt. Trang thiết lập đã
              tự khóa.
            </p>
            <p>
              Bạn có thể xóa biến <code>ADMIN_SETUP_TOKEN</code> trong Vercel
              rồi redeploy.
            </p>
            <a className="button primary full" href="/login">
              Đến trang đăng nhập
            </a>
          </div>
        ) : (
          <>
            <p className="setup-intro">
              Thiết lập trung tâm trên Vercel. Mã bí mật trong cấu hình Vercel
              bảo vệ thao tác tạo admin.
            </p>
            <details className="setup-help" open>
              <summary>Chưa có mã thiết lập?</summary>
              <ol>
                <li>Bấm “Tạo mã ngẫu nhiên”, rồi sao chép mã.</li>
                <li>
                  Trong Vercel → project → Environment Variables, thêm{" "}
                  <code>ADMIN_SETUP_TOKEN</code> cho Production, giá trị là mã
                  vừa sao chép.
                </li>
                <li>
                  Redeploy, đợi Ready rồi trở lại đây. Giữ lại mã để nhập vào
                  biểu mẫu.
                </li>
              </ol>
              <div className="setup-key-actions">
                <button className="button" onClick={generate} type="button">
                  <KeyRound size={17} />
                  Tạo mã ngẫu nhiên
                </button>
                <button
                  className="button"
                  type="button"
                  disabled={!token}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(token);
                      setCopied(true);
                    } catch {
                      setError(
                        "Không thể tự sao chép. Bạn có thể chọn và sao chép mã trong ô bên dưới.",
                      );
                    }
                  }}
                >
                  <Copy size={16} />
                  {copied ? "Đã sao chép" : "Sao chép mã"}
                </button>
              </div>
            </details>
            <form onSubmit={submit}>
              <label>
                Mã thiết lập
                <input
                  name="token"
                  type="password"
                  required
                  minLength={32}
                  maxLength={256}
                  autoComplete="off"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Mã ADMIN_SETUP_TOKEN bạn đã lưu trong Vercel"
                />
              </label>
              <label>
                Tên trung tâm / lớp học
                <input
                  name="center_name"
                  required
                  minLength={2}
                  maxLength={120}
                  placeholder="Ví dụ: Lớp học Hạnh Phúc"
                />
              </label>
              <label>
                Họ tên admin
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={120}
                  autoComplete="name"
                />
              </label>
              <label>
                Email đăng nhập
                <input
                  name="email"
                  type="email"
                  required
                  maxLength={200}
                  autoComplete="username"
                />
              </label>
              <div className="form-grid">
                <label>
                  Mật khẩu
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                    placeholder="Ít nhất 12 ký tự"
                  />
                </label>
                <label>
                  Nhập lại mật khẩu
                  <input
                    name="confirm_password"
                    type="password"
                    required
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                  />
                </label>
              </div>
              {error && (
                <div className="alert danger" role="alert">
                  {error}
                </div>
              )}
              <button className="button primary full" disabled={busy}>
                {busy ? "Đang tạo tài khoản…" : "Tạo tài khoản admin"}
              </button>
            </form>
            <p className="setup-footnote">
              Chỉ tạo được admin đầu tiên một lần. Sau khi đăng nhập, mở mục
              Giáo viên để tạo tài khoản cho từng giáo viên.
            </p>
            <a className="text-button" href="/login">
              Đã có admin? Đăng nhập
            </a>
          </>
        )}
      </section>
    </main>
  );
}
