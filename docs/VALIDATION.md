# Kiểm chứng mã nguồn — 26/11/2026

- TypeScript: đạt.
- Build Next.js production (webpack): đạt.
- 31 kiểm thử đạt: nghiệp vụ, xác thực, cách ly dữ liệu, thanh toán, origin Vercel, chẩn đoán health và tạo admin một lần.
- Thiết lập admin: từ chối thiếu/sai mã, kiểm tra mật khẩu xác nhận, băm mật khẩu, transaction chỉ cho một request đồng thời thành công, khóa vĩnh viễn bootstrap sau lần đầu.
- Database và file SQLite chỉ dùng bên trong test. Runtime sản phẩm bắt buộc PostgreSQL; upload sản phẩm bắt buộc kho S3 riêng tư.
- Trang `/setup` và endpoint `/api/setup` được build cho Vercel; không có lệnh seed hay tài khoản sản phẩm mẫu.
- Chưa tự thao tác tài khoản Vercel/Neon, tạo admin thật hoặc chạy giao dịch ngân hàng thật trong phiên này. Người dùng tự nhập mã và mật khẩu trên website.
- Chưa kiểm thử trực quan trang setup vì công cụ điều khiển trình duyệt không khả dụng; đã kiểm tra TypeScript, build và nghiệp vụ backend.
