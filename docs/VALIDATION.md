# Kiểm chứng bản local — 26/11/2026

- TypeScript: đạt.
- Build Next.js production (webpack): đạt.
- Kiểm thử nghiệp vụ: 20/20 đạt; bao gồm mật khẩu, kích hoạt một lần, cách ly trung tâm/giáo viên, lịch đơn/chuỗi, khóa buổi, học phí, thanh toán một phần/chống trùng, chữ ký webhook giả/hợp lệ, tài khoản ảo, đổi khóa, chặn thu tiền khi chưa xác minh, bài tập mới/cũ, phiên bản bài nộp và quyền tải file.
- Kiểm thử HTTP trên bản production chạy local: đăng nhập, phân quyền, chống yêu cầu khác nguồn, QR mô phỏng, cập nhật công nợ, giao dịch lặp, nộp bài, upload/download ảnh và kiểm tra quyền, xuất CSV, endpoint được bảo vệ, HTML và tài nguyên JS/CSS.
- Sao lưu SQLite: đã tạo bản sao và kiểm tra `PRAGMA integrity_check` trả về `ok`; bản sao có lịch sử giao dịch.
- Dockerfile và workflow CI được chuẩn bị nhưng chưa chạy Docker hoặc CI từ xa trong phiên này.
- Chưa kiểm tra trực quan desktop/mobile: công cụ điều khiển trình duyệt không kết nối được.
- Chưa chạy PostgreSQL/S3 hoặc giao dịch ngân hàng thật. Không có tài khoản dịch vụ, secret và hạ tầng production được cấu hình trong phiên này.
