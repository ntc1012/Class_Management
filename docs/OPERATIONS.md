# Vận hành ClassFlow trên Vercel

## Hạ tầng

Migration `class-assignment-v1` chạy một lần trong transaction khi khởi tạo: cho phép lớp chưa có giáo viên, lưu người tạo lớp và giáo viên theo từng buổi; bỏ việc mặc định admin là giáo viên. Lớp cũ gắn admin chuyển thành “Chưa phân công”, không xóa lớp hoặc lịch sử thu tiền. Admin chọn giáo viên tại Lớp học → Phân công. Các lần đổi giáo viên sau đó chỉ cập nhật buổi chưa khóa.

- Bản sản phẩm dùng PostgreSQL qua `DATABASE_URL`. SQLite chỉ dành cho test nội bộ.
- Kho file là S3 riêng tư. Không lưu file bài tập trong filesystem của Vercel.
- Không có tài khoản/mật khẩu admin hoặc giáo viên mặc định. Admin đầu tiên tạo tại `/setup`.
- Biến môi trường áp dụng cho deployment tiếp theo; redeploy sau khi thay đổi.

## Tạo admin một lần

Mở `/setup`, tạo mã ngẫu nhiên tại trình duyệt và thêm mã vào biến `ADMIN_SETUP_TOKEN` của Vercel Production. Mã dài tối thiểu 32 ký tự, khuyến nghị dùng mã hex 64 ký tự do trang tạo ra. Không gửi mã qua URL hay chia sẻ trong chat.

Sau redeploy, nhập mã, tên trung tâm, họ tên, email, mật khẩu và xác nhận mật khẩu. API xác minh mã ở server trước khi truy cập database; mật khẩu được scrypt hash. Thao tác tạo trung tâm, admin, nhật ký và khóa thiết lập chạy trong một transaction.

Khóa singleton trong PostgreSQL ngăn hai request đồng thời tạo hai admin. Sau khi hoàn tất, không thể dùng lại trang này để thêm admin, kể cả khi tài khoản ban đầu bị xóa. Nếu đã có owner trong database, API cũng từ chối bootstrap. Có thể xóa `ADMIN_SETUP_TOKEN` và redeploy sau khi tạo thành công.

Đăng nhập rồi mở Giáo viên để thêm tên/email, cấp mã kích hoạt riêng. Giáo viên tự đặt mật khẩu; không dùng chung mật khẩu admin.

## Các biến môi trường

| Biến                                       | Mục đích                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| `DATABASE_URL`                             | PostgreSQL Neon, do integration cấp                                      |
| `APP_URL`                                  | `https://classmanagement-omega.vercel.app`                               |
| `ADMIN_SETUP_TOKEN`                        | Bật tạo admin một lần; xóa sau khi hoàn tất                              |
| `PAYMENT_MODE`                             | `demo`, `live`; thiếu/sai trên production thì tắt tạo yêu cầu thanh toán |
| `ENCRYPTION_KEY`                           | 64 ký tự hex của khóa ngẫu nhiên 32 byte                                 |
| `CRON_SECRET`                              | Secret riêng cho scheduler                                               |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`    | Kho file riêng tư                                                        |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Thông tin truy cập kho file                                              |
| `MAX_FILE_MB`, `TEACHER_STORAGE_MB`        | Mặc định 10 MB/file, 500 MB/giáo viên                                    |

Không đặt các secret dưới tên có tiền tố `NEXT_PUBLIC_`. Không đưa file `.env`, bản sao database hoặc mã kích hoạt lên Git.

## Thanh toán

Giữ `PAYMENT_MODE=demo` trong giai đoạn thử nghiệm. QR demo không chuyển tiền thật; việc mô phỏng nhận tiền chỉ dành cho admin/giáo viên, có nhật ký.

Khi bật thật: xác minh với nhà cung cấp loại tài khoản Agribank/Techcombank được hỗ trợ, lưu Client ID/API Key/Checksum Key trong Cài đặt và đăng ký webhook. Khóa được AES-256-GCM mã hóa; sao lưu `ENCRYPTION_KEY` trong secret manager riêng.

Webhook: `/api/payments/webhook/<teacher-id>`. Tài khoản chính được đối chiếu khi kết nối; tài khoản ảo (VA) được lưu riêng theo yêu cầu thanh toán. Mỗi yêu cầu giữ bản khóa kết nối đã mã hóa để xác minh giao dịch khi giáo viên thay khóa sau này. Không dùng URL quay về trình duyệt làm bằng chứng trả tiền.

Tài liệu nhà cung cấp: https://payos.vn/docs/huong-dan-su-dung/ket-noi-tai-khoan-ngan-hang/ và https://payos.vn/docs/cau-hoi-thuong-gap/.

## Scheduler và sao lưu

Scheduler gọi `GET /api/cron` với header `Authorization: Bearer <CRON_SECRET>`, tần suất phù hợp gói hosting. Tác vụ chốt tháng trước khi mọi buổi đã khóa/hủy, và đối soát yêu cầu bảy ngày gần nhất. Khoản cũ có thể đối soát tại màn hình học phí.

Dùng backup/PITR của nhà cung cấp PostgreSQL; phục hồi vào database mới rồi đối chiếu học sinh, khoản thu và giao dịch trước khi chuyển kết nối. Backup/versioning S3 phải giữ file còn được bản database phục hồi tham chiếu. Lịch sử thu tiền chưa có tác vụ tự động xóa; yêu cầu sản phẩm là giữ ít nhất ba tháng.

## Giới hạn kiểm chứng

### Đăng nhập nhiều tài khoản

Mỗi tab làm việc dùng URL `/workspace/<account-id>` cố định. Có thể chọn **Mở tài khoản khác** để đăng nhập trong tab mới. Đăng xuất chỉ kết thúc phiên của tài khoản được chọn, không đăng xuất tài khoản khác.

Mỗi tài khoản có cookie HttpOnly riêng. Trình duyệt chỉ lưu mã tài khoản trong sessionStorage; mã này không phải thông tin xác thực. API kiểm tra mã tài khoản với phiên đã đăng nhập cho mọi thao tác, tải file và xuất dữ liệu, không tự chuyển sang tài khoản đăng nhập sau. Tab đang mở từ phiên bản cũ cần tải lại và đăng nhập lại một lần sau khi triển khai.

- Chưa thao tác trực tiếp Neon/Vercel của người dùng qua connector trong phiên này; trạng thái trên web do người dùng kiểm tra.
- Giao dịch tiền thật và kho S3 chưa được kiểm chứng bằng tài khoản thực tế.
- Schema bản đầu tạo idempotent; thay đổi tiếp theo cần migration có phiên bản và kiểm thử trên bản sao.
