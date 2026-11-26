# Vận hành và triển khai

## Môi trường

- Local: Node.js 24+, SQLite bền vững tại `data/classflow.sqlite`, file tại `data/uploads`, thanh toán mô phỏng.
- Production: `DATABASE_URL` PostgreSQL, kho S3 riêng tư, HTTPS và `APP_URL` đúng tên miền. Không dùng dữ liệu mẫu hoặc mật khẩu demo.
- Local và production phải dùng database, bucket, khóa thanh toán và khóa mã hóa khác nhau.
- Không đưa `.env.local`, `data/`, `backups/` hoặc file xuất chứa mã kích hoạt lên Git.
- `ALLOW_LOCAL_PRODUCTION=1` chỉ dành cho kiểm tra bản build ở máy local; không bật khi đưa lên Internet.

## Khởi tạo production

1. Cấp PostgreSQL và bucket S3 private. Điền các biến trong `.env.example` vào secret của hosting hoặc `.env.local` ở máy quản trị.
2. Tạo `ENCRYPTION_KEY`: 32 byte ngẫu nhiên biểu diễn bằng 64 ký tự hex. Có thể dùng `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`, lưu kết quả vào secret manager.
3. Đặt `PAYMENT_MODE=live`, `APP_URL=https://ten-mien-cua-ban`, `CRON_SECRET` ngẫu nhiên đủ dài.
4. Chạy `npm ci`, `npm run db:migrate`.
5. Đặt `OWNER_NAME`, `OWNER_EMAIL`, `OWNER_PASSWORD` (ít nhất 12 ký tự), `CENTER_NAME` trong môi trường tiến trình, chạy `npm run db:owner`. Xóa mật khẩu khởi tạo khỏi môi trường quản trị sau đó. Không đưa thông tin thật vào shell history hoặc Git.
6. Chạy `npm run build`, `npm start`, hoặc build Dockerfile. Nếu dùng Vercel, chọn Node.js 24 và cấu hình cùng các secret. Đây là server app, không thể static export.
7. Mỗi giáo viên xác minh kênh thanh toán với nhà cung cấp, kiểm tra hỗ trợ ngân hàng và tài khoản nhận của mình. Điền đúng bộ Client ID/API Key/Checksum Key trong Cài đặt. Bộ khóa được AES-256-GCM mã hóa trong database.
8. Giáo viên chọn “Đăng ký webhook của tôi”. Đường dẫn: `/api/payments/webhook/<teacher-id>`. Kiểm tra tài khoản ngân hàng khớp tài khoản kênh payOS.
9. Thử giao dịch nhỏ trong quy trình do chủ tài khoản kiểm soát, kiểm tra giao dịch lặp, thiếu tiền, thừa tiền và đối soát sau mất kết nối. Không dùng QR demo để chuyển tiền.

Việc thêm tài khoản ngân hàng vào biểu mẫu không đồng nghĩa đã kết nối nhận giao dịch. Chỉ đánh giá kết nối thật hoàn tất sau khi nhà cung cấp cấp quyền và chạy giao dịch kiểm chứng.

Khi xác nhận webhook, ứng dụng đối chiếu tài khoản chính trả về từ nhà cung cấp. Mỗi yêu cầu thanh toán lưu riêng tài khoản nhận do nhà cung cấp trả về để hỗ trợ tài khoản ảo (VA), vốn có thể khác số tài khoản chính. Thay đổi cấu hình ngân hàng sẽ yêu cầu xác minh lại.

Tài liệu công khai được kiểm tra chưa đủ để xác nhận payOS hỗ trợ đúng loại tài khoản Agribank/Techcombank của giáo viên. Cần xác minh trực tiếp với nhà cung cấp; không coi adapter này là kết nối hai ngân hàng đã hoàn tất. Nguồn: https://payos.vn/docs/huong-dan-su-dung/ket-noi-tai-khoan-ngan-hang/ và https://payos.vn/docs/cau-hoi-thuong-gap/.

## Lịch chạy tự động

Gọi `GET /api/cron` bằng scheduler có header `Authorization: Bearer <CRON_SECRET>`, ví dụ mỗi 15–60 phút tùy gói hosting. Không đặt secret trong URL.

Tác vụ chốt học phí tháng trước cho từng giáo viên nếu mọi buổi đã khóa/hủy; thử lại an toàn vì có khóa duy nhất. Nếu còn buổi chưa khóa, kết quả nêu lỗi để giáo viên hoàn tất. Đồng thời đối soát các yêu cầu thanh toán của bảy ngày gần nhất. Giao dịch cũ hơn có thể đối soát thủ công tại chi tiết học phí.

## Sao lưu và khôi phục

### Local SQLite

Chạy `npm run db:backup`: dùng online backup API nên không bỏ sót WAL. Sao lưu riêng `data/uploads` cùng thời điểm hoặc dừng ứng dụng để sao lưu cả bộ nhất quán. File database không chứa dữ liệu nhị phân của bài tập.

Khôi phục: dừng ứng dụng, sao lưu trạng thái hiện tại, chọn bản database và file tương ứng, đặt `SQLITE_PATH` vào bản database phục hồi rồi khởi động. Có thể kiểm tra bản sao tại cổng khác trước khi thay dữ liệu chính. Kiểm tra số lượng giao dịch, học sinh, công nợ và tải một file thử.

### PostgreSQL / S3

Dùng backup tự động/PITR của nhà cung cấp và `pg_dump --format=custom` từ môi trường có quyền. `DATABASE_URL` qua secret, không in lên log. Khôi phục bằng `pg_restore` vào database mới, chuyển kết nối sau khi đối chiếu. Bật versioning/lifecycle phù hợp trên bucket; không xóa file mà bản sao database còn tham chiếu tới.

Lưu `ENCRYPTION_KEY` dự phòng trong secret manager riêng. Mất khóa sẽ không đọc được các khóa kết nối ngân hàng đã mã hóa. Muốn đổi khóa phải giải mã và mã hóa lại dữ liệu, không chỉ thay biến môi trường.

## Theo dõi

- Kiểm tra lỗi scheduler, webhook và giao dịch chờ đối soát; cảnh báo dung lượng/file và chi phí provider.
- Log không ghi mật khẩu, mã kích hoạt, API key hoặc payload webhook thô.
- Không có công việc tự động xóa lịch sử thu tiền. Tối thiểu ba tháng là yêu cầu sản phẩm hiện tại, không phải kết luận về thời hạn lưu trữ theo pháp luật.
- Trước sử dụng dữ liệu thật, chủ trung tâm cần rà soát quy trình bảo vệ dữ liệu và lịch lưu giữ phù hợp.

## Giới hạn đã biết

- Chưa kiểm chứng kết nối tiền thật Agribank/Techcombank hoặc PostgreSQL/S3 trong môi trường này vì chưa có hạ tầng và thông tin xác thực.
- Đã kiểm thử SQLite và API local; chưa kiểm tra giao diện bằng trình duyệt do công cụ trình duyệt của phiên làm việc không khả dụng.
- Schema tự tạo idempotent cho bản đầu; thay đổi schema tương lai cần migration có phiên bản và diễn tập trên bản sao trước production.
- Tệp được tải qua máy chủ có kiểm tra quyền. Với tải lớn cần thêm quét mã độc chuyên dụng và cân nhắc URL S3 ký hạn ngắn để giảm tải máy chủ.
