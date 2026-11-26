# ClassFlow — quy tắc đã chốt

## Vai trò và dữ liệu

- Chủ trung tâm quản lý toàn bộ dữ liệu trong trung tâm, tạo giáo viên và điều chỉnh học phí.
- Giáo viên chỉ quản lý lớp, hồ sơ học sinh, bài tập và học phí của mình; tài khoản ngân hàng riêng.
- Học sinh chỉ xem dữ liệu của mình và lớp đang học, không xem danh sách hay bài nộp của bạn khác.
- Chưa có vai trò phụ huynh, nhân viên, đăng ký trung tâm tự phục vụ hoặc học sinh tự ghi danh.
- Giáo viên tạo hồ sơ; tài khoản học sinh có tên đăng nhập sinh tự động. Mã kích hoạt dùng một lần, hạn 48 giờ. Mật khẩu tối thiểu 10 ký tự.
- Cấp lại mã không làm mất dữ liệu. Kích hoạt thành công thu hồi phiên đăng nhập cũ.

## Lớp, lịch, điểm danh

- Giáo viên tạo lớp và thêm học sinh; chủ trung tâm có thể thực hiện thay giáo viên.
- Lịch lặp theo tuần, tạo trước tối đa một năm. Phát hiện trùng giờ giáo viên hoặc phòng trong cùng trung tâm.
- Đổi một buổi hoặc buổi được chọn cùng các buổi chưa học tiếp theo trong chuỗi. Đổi chuỗi dịch ngày theo cùng số ngày và dùng giờ mới.
- Chỉ đổi lịch từ hôm nay trở đi. Không sửa buổi đã khóa.
- Ba trạng thái: có mặt, vắng có phép, vắng không phép. Không có đi muộn.
- Chỉ khóa sau giờ kết thúc và khi điểm danh đầy đủ. Khóa là bất biến; sửa sai bằng điều chỉnh học phí của chủ trung tâm.
- Buổi hủy không tính tiền. Buổi chưa điểm danh/khóa chưa được chốt phí.
- Nghỉ lớp giữ lại các lần ghi danh cũ; ghi danh lại tạo lần mới.

## Học phí

- Mỗi buổi 50.000 VND. Có mặt hoặc vắng không phép: 50.000đ. Vắng có phép: 0đ.
- Mức phí được lưu trên từng buổi. Khoản thu lưu chi tiết từng buổi, không tính lại từ giá hiện tại.
- Thu cuối tháng: chỉ chốt từ ngày cuối tháng và khi toàn bộ buổi của giáo viên trong tháng đã khóa/hủy.
- Một học sinh có một khoản phải thu cho mỗi giáo viên, mỗi tháng; có thể bao gồm nhiều lớp của giáo viên đó.
- Chốt lặp không tạo khoản trùng. Hỗ trợ thanh toán một phần qua nhiều giao dịch.
- Điều chỉnh phải có lý do, chỉ chủ trung tâm thực hiện, tổng phải thu không âm. Không sửa khoản gốc hay điểm danh đã khóa.
- Lưu lịch sử thu và điều chỉnh tối thiểu ba tháng; phiên bản này chưa tự động xóa lịch sử.

## Thanh toán

- Mỗi giáo viên một tài khoản nhận tiền. Biểu mẫu hỗ trợ Agribank và Techcombank; hỗ trợ thực tế phụ thuộc kênh thanh toán mà giáo viên được nhà cung cấp cấp.
- Adapter payOS: tạo QR theo khoản phải thu, xác thực webhook bằng SDK, đối chiếu mã yêu cầu, tài khoản, tiền tệ, mã link và số tiền.
- Khóa giao dịch và ràng buộc mã giao dịch duy nhất ngăn ghi nhận trùng. Thanh toán một phần giảm công nợ; số tiền vượt yêu cầu hoặc công nợ chuyển chờ đối soát.
- Chủ trung tâm có thể xác nhận giao dịch chờ đối soát; số tiền dư hiển thị trên khoản thu.
- Không xác nhận thanh toán từ URL quay về trình duyệt. Webhook hoặc truy vấn API nhà cung cấp mới cập nhật sổ thu.
- Chế độ demo sinh QR ghi rõ mô phỏng, không chứa mã chuyển khoản thật. Chỉ chủ trung tâm/giáo viên được mô phỏng nhận tiền.
- Chưa tích hợp MoMo trong bản này vì lựa chọn đã chốt là tài khoản ngân hàng của từng giáo viên.

## Bài tập và file

- Giao cho cả lớp: chụp danh sách học sinh đang ghi danh tại thời điểm giao. Học sinh mới không nhận bài cũ.
- Cho phép nộp lại nhiều lần trước hạn, nếu giáo viên chưa khóa nhận bài. Giữ toàn bộ phiên bản và điểm/nhận xét từng phiên bản.
- Đến hạn hoặc bị khóa sớm: không nhận bài mới hoặc file bổ sung. Giáo viên vẫn chấm bài đã nộp.
- Nộp văn bản, PDF, PNG hoặc JPEG. Tối đa 10 MB/file; mặc định 500 MB/giáo viên.
- Kiểm tra chữ ký file thay vì tin phần mở rộng/MIME do trình duyệt cung cấp. File trong kho riêng tư; tải qua API có kiểm tra quyền.

## Báo cáo và vận hành

- Báo cáo tiền thực nhận, công nợ, tỷ lệ có mặt và nộp bài; xuất CSV. Tiền thực nhận không được trình bày như doanh thu kế toán.
- Thông báo trong ứng dụng khi giao bài, chốt phí, nhận tiền.
- Tiếng Việt, VND, múi giờ Asia/Ho_Chi_Minh; giao diện responsive.
- Bản này chưa có email tự động, biên lai PDF, song ngữ, Zalo/SMS, trắc nghiệm tự chấm, thanh toán SaaS hay ứng dụng native.
