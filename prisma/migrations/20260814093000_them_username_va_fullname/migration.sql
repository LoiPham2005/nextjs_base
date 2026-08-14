-- Thêm `username` và đổi tên `name` thành `fullName`.
--
-- Dùng RENAME COLUMN chứ KHÔNG phải "thêm cột mới rồi xoá cột cũ": rename giữ
-- nguyên dữ liệu, chạy tức thì và không cần chép bảng. Prisma tự sinh sẽ chọn
-- cách xoá-và-thêm, tức là mất toàn bộ tên người dùng đang có.

ALTER TABLE "users" RENAME COLUMN "name" TO "fullName";

ALTER TABLE "users" ADD COLUMN "username" TEXT;

-- UNIQUE trong PostgreSQL bỏ qua NULL, nên mọi tài khoản chưa đặt tên đăng
-- nhập vẫn cùng tồn tại được. Ràng buộc chỉ áp lên các giá trị thật.
--
-- Tính phân biệt hoa thường được xử lý ở tầng ứng dụng bằng cách luôn ghi
-- chữ thường (xem `user.service.ts`), thay vì dùng index trên lower(username).
-- Lý do: Prisma không sinh được truy vấn dựa trên index biểu thức, nên nếu
-- ràng buộc nằm ở đó thì mã ứng dụng vẫn phải tự chuẩn hoá — mà đã chuẩn hoá
-- rồi thì index thường là đủ, và đọc lên đúng bằng thứ đã ghi xuống.
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
