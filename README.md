# ClassFlow

Web app quản lý lớp dạy thêm: lớp, học sinh, lịch, điểm danh, học phí theo buổi, QR thanh toán và bài tập. Next.js App Router + TypeScript, giao diện tiếng Việt.

## Chạy local

Yêu cầu Node.js 24 trở lên. Tại thư mục chứa `package.json`:

```powershell
npm.cmd install
Copy-Item .env.example .env.local
npm.cmd run db:seed
npm.cmd run dev
```

Mở **http://127.0.0.1:3000**. Nếu đã có `.env.local`, giữ nguyên cấu hình thay vì ghi đè. Không cần tài khoản dịch vụ ngoài để chạy bản thử nghiệm.

| Vai trò        | Tài khoản mẫu           |
| -------------- | ----------------------- |
| Chủ trung tâm  | `admin@classflow.local` |
| Giáo viên Linh | `linh@classflow.local`  |
| Giáo viên Minh | `minh@classflow.local`  |
| Học sinh       | `hocsinh1`              |

Mật khẩu chung của **dữ liệu mẫu**: `ClassFlow!2026`. Hai giáo viên có dữ liệu tách riêng; có thêm một trung tâm mẫu khác để kiểm thử cách ly. QR demo không dùng chuyển tiền thật.

## Chức năng đã triển khai

- Đăng nhập, đăng xuất, giới hạn lần đăng nhập sai, phiên cookie HttpOnly; kích hoạt tài khoản bằng mã dùng một lần có hạn 48 giờ.
- Chủ trung tâm tạo giáo viên, cấp lại mã; giáo viên tạo học sinh, sửa hồ sơ, nhập/xuất CSV.
- Tạo/sửa lớp, thêm/cho học sinh nghỉ lớp, giới hạn sĩ số và giữ lịch sử ghi danh.
- Lịch lặp theo tuần, kiểm tra trùng giáo viên/phòng; đổi một buổi hoặc phần còn lại của chuỗi; hủy buổi.
- Điểm danh ba trạng thái; chỉ khóa sau giờ học, không sửa buổi đã khóa.
- Học phí 50.000đ/buổi: vắng có phép miễn phí, vắng không phép tính phí. Chốt cuối tháng và chống tạo khoản trùng.
- Chủ trung tâm điều chỉnh học phí có lý do; giữ khoản gốc, chi tiết từng buổi, lịch sử thanh toán và điều chỉnh.
- QR từng khoản thu, tài khoản ngân hàng riêng cho giáo viên, payOS SDK, webhook xác thực, chống nhận trùng, thanh toán một phần và đối soát giao dịch bất thường.
- Chế độ mô phỏng thanh toán cho local. Chỉ kết nối tiền thật sau khi cấu hình kênh được nhà cung cấp hỗ trợ.
- Giao bài cho danh sách học sinh hiện tại; học sinh mới không nhận bài cũ. Nộp lại nhiều phiên bản, hạn nộp, khóa sớm, chấm điểm/nhận xét.
- File PDF/PNG/JPEG riêng tư, kiểm tra chữ ký file, giới hạn dung lượng, API tải có phân quyền; adapter local và S3.
- Cổng học sinh, thông báo trong ứng dụng, báo cáo tiền nhận/công nợ/chuyên cần/nộp bài, xuất CSV/JSON, nhật ký hoạt động.
- SQLite local, adapter PostgreSQL production, công cụ sao lưu và tài liệu triển khai.

## Quy tắc quan trọng

Chốt thu cuối tháng sau khi các buổi đã khóa hoặc hủy. Chưa điểm danh không bị tự coi là vắng. Khóa buổi là bất biến; chủ trung tâm sửa sai qua điều chỉnh học phí. Không có trạng thái đi muộn, tài khoản phụ huynh hay học sinh tự đăng ký lớp.

Hệ thống chỉ xác nhận thanh toán qua thông báo máy chủ hoặc API đối soát, không tin URL chuyển hướng. Lịch sử thu tiền giữ ít nhất ba tháng, chưa tự động xóa.

## Kiểm tra

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run db:backup
```

Khi máy chủ local với dữ liệu mẫu đang chạy, chạy `npm.cmd run test:http`. Kiểm thử này mô phỏng thanh toán một khoản còn nợ nếu có, kiểm tra gửi lặp và tạo bài nộp/file thử trong dữ liệu mẫu; không chạy trên production. Bộ kiểm thử nghiệp vụ tự tạo database SQLite riêng và không dùng `DATABASE_URL`.

## Cấu trúc

```text
src/app/          Trang và API Next.js
src/components/   Giao diện quản trị và học sinh
src/lib/          DB, chính sách truy cập, nghiệp vụ, thanh toán, file
scripts/          Seed, tạo chủ trung tâm, schema, sao lưu
tests/            Kiểm thử nghiệp vụ và HTTP
docs/             Quy tắc sản phẩm, vận hành và giới hạn
```

[Quy tắc chi tiết](docs/REQUIREMENTS.md) · [Triển khai, thanh toán, sao lưu và giới hạn](docs/OPERATIONS.md)

## Trạng thái bàn giao

Bản chạy local có dữ liệu mẫu và thanh toán mô phỏng. Có mã tích hợp payOS/PostgreSQL/S3 nhưng chưa xác minh trên hạ tầng thật. Chưa công bố Internet hoặc kích hoạt thu tiền thật. Chưa có email tự động, biên lai PDF, song ngữ, Zalo/SMS và MoMo.
