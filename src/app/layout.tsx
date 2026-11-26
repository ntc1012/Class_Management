import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "ClassFlow · Quản lý lớp dạy thêm",
  description:
    "Quản lý lớp học, lịch dạy, điểm danh, học phí theo buổi và bài tập.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
