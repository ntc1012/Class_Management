# ClassFlow

Ứng dụng quản lý trung tâm dạy thêm, sử dụng trên **Vercel + PostgreSQL (Neon)**. Không còn bản sản phẩm SQLite, lệnh seed hay tài khoản/mật khẩu mẫu.

## Tạo admin đầu tiên trên web

1. Đợi deployment mới nhất trên Vercel báo Ready.
2. Mở **https://classmanagement-omega.vercel.app/setup**.
3. Chọn **Tạo mã ngẫu nhiên** rồi **Sao chép mã**. Giữ mã riêng, không đưa vào Git, URL hay chat.
4. Trong project Vercel → Environment Variables, thêm `ADMIN_SETUP_TOKEN` cho Production; giá trị là mã vừa sao chép. Redeploy và đợi Ready.
5. Trở lại `/setup`, nhập mã cùng tên trung tâm, họ tên, email và mật khẩu admin (ít nhất 12 ký tự). Chọn **Tạo tài khoản admin**.
6. Đăng nhập tại `/login` bằng email và mật khẩu vừa tạo. Thiết lập tự khóa sau lần đầu; có thể xóa `ADMIN_SETUP_TOKEN` trong Vercel và redeploy.
7. Mở **Giáo viên → Thêm giáo viên**, nhập tên/email và cấp mã kích hoạt riêng cho giáo viên. Giáo viên tự đặt mật khẩu bằng mã kích hoạt.

Không có tài khoản `admin@classflow.local` hoặc `linh@classflow.local` được cấp sẵn trên Vercel.

## Cấu hình Vercel

- Framework Next.js, Root Directory là gốc repository, output `.next`; khai báo trong `vercel.json`.
- `DATABASE_URL`: chuỗi PostgreSQL do Neon cung cấp, áp dụng Production.
- `APP_URL`: `https://classmanagement-omega.vercel.app`.
- `PAYMENT_MODE=demo` cho thanh toán mô phỏng; chỉ chuyển `live` khi kết nối ngân hàng đã được xác minh.
- `ADMIN_SETUP_TOKEN`: mã bí mật tối thiểu 32 ký tự, chỉ dùng khi tạo admin đầu tiên.
- `ENCRYPTION_KEY`: khóa ngẫu nhiên 32 byte ở dạng 64 ký tự hex, dùng mã hóa khóa thanh toán.
- `CRON_SECRET`: secret bảo vệ tác vụ tự động.
- `S3_*`: kho file riêng tư để tải bài tập. Chưa có kho file thì vẫn có thể quản lý lớp và nộp bài bằng văn bản; upload file sẽ báo chưa cấu hình.

`/api/health` trả `status: ok` khi database và schema sẵn sàng. Chỉ hiển thị mã chẩn đoán an toàn nếu lỗi.

## Tính năng

- Admin quản lý trung tâm; giáo viên chỉ quản lý lớp, học sinh và học phí của mình.
- Hồ sơ học sinh, nhập/xuất CSV, ghi danh/nghỉ lớp, mã kích hoạt một lần có hạn 48 giờ.
- Lịch tuần, chống trùng giáo viên/phòng, đổi một buổi hoặc phần còn lại của chuỗi.
- Có mặt / vắng có phép / vắng không phép; khóa buổi sau giờ học, không sửa lại.
- Học phí 50.000đ/buổi; vắng có phép không tính tiền, chốt cuối tháng. Admin điều chỉnh có lý do, giữ khoản gốc và lịch sử tối thiểu ba tháng.
- Tài khoản ngân hàng riêng cho giáo viên, QR theo khoản thu, adapter payOS, webhook có xác thực/chống trùng, thanh toán một phần và đối soát. Kết nối thực tế Agribank/Techcombank cần được nhà cung cấp xác nhận.
- Bài tập giao theo danh sách lớp tại thời điểm giao; học sinh mới không nhận bài cũ. Nộp lại nhiều phiên bản trước hạn, giáo viên khóa sớm/chấm/nhận xét.
- File PDF/PNG/JPEG riêng tư, giới hạn dung lượng; cổng học sinh, thông báo trong ứng dụng, báo cáo và nhật ký.

## Kiểm thử mã nguồn

Yêu cầu Node.js 24+. Các lệnh dành cho phát triển/CI:

```text
npm ci
npm run typecheck
npm test
npm run build
```

Bộ kiểm thử tự tạo database tạm riêng; SQLite chỉ là adapter nội bộ cho test, bị chặn trong mọi chế độ sử dụng sản phẩm. Không có seed tài khoản mẫu.

[Quy tắc nghiệp vụ](docs/REQUIREMENTS.md) · [Vận hành](docs/OPERATIONS.md)
