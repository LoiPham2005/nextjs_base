# Hướng dẫn dùng DBeaver + Prisma Studio để quản lý database

## Khi nào dùng cái nào

| Việc cần làm | Dùng gì | Vì sao |
|---|---|---|
| Xem/sửa nhanh vài dòng dữ liệu lúc dev | **Prisma Studio** | Hiểu quan hệ (`User` → `Role`, `Account`...) trực tiếp từ `schema.prisma`, không cần biết SQL |
| Kiểm tra migration đã chạy chưa, xem cấu trúc bảng thật | **DBeaver** | Nhìn thẳng vào Postgres, không qua lớp diễn giải của Prisma |
| Chạy SQL thô, `EXPLAIN ANALYZE`, tối ưu query chậm | **DBeaver** | Prisma Studio không cho chạy SQL tự do |
| Backup/export dữ liệu, xem ER diagram toàn database | **DBeaver** | Prisma Studio chỉ thao tác qua model, không có công cụ export/diagram |

Quy tắc chung: **Prisma Studio cho việc hằng ngày, DBeaver cho việc cần nhìn xuống tầng database thật.**

## Prisma Studio

### Chạy

```bash
pnpm db:studio
```

Tự mở `http://localhost:5555`. Không cần cấu hình gì thêm — nó đọc `DATABASE_URL`
theo đúng cách `prisma.config.ts` đọc (xem file đó nếu dùng `DIRECT_DATABASE_URL`).

### ⚠️ Điều quan trọng nhất cần nhớ

Prisma Studio ghi thẳng xuống database, **bỏ qua toàn bộ logic nghiệp vụ nằm ở
tầng `src/services/*.ts`**. Với dự án này cụ thể là:

- **Xoá một dòng `users` trong Prisma Studio = xoá CỨNG (hard delete)**, phá vỡ
  quy ước xoá mềm mà `userService.delete()` đang áp dụng (set `deletedAt`, giải
  phóng email, thu hồi refresh token). Muốn xoá đúng luồng, xoá qua trang
  `/users` hoặc gọi `DELETE /api/users/[id]`, đừng xoá tay trong Studio.
- **Sửa cột `password` trực tiếp = lưu plaintext**, vì bước hash (Argon2id) nằm
  trong `CryptoUtils`/`userService`, Prisma Studio không biết gì về nó. Tài
  khoản đó sẽ không đăng nhập được cho tới khi có người đặt lại mật khẩu qua
  đúng luồng.
- **Đổi `status` thành `BANNED` tay thì được** (đây chỉ là một cột enum đơn
  thuần, không có logic phụ), nhưng vẫn nên đi qua nút Khoá/Mở khoá ở trang
  admin để có log (`logger.error`) khi có lỗi.

Tóm lại: dùng Prisma Studio để **xem** là chính; **sửa** thì ưu tiên đi qua UI
hoặc API của app, trừ khi chắc chắn cột đó không có logic đi kèm.

## DBeaver

### Cài đặt

Tải bản Community (miễn phí) tại [dbeaver.io](https://dbeaver.io/download/),
hoặc qua winget:

```powershell
winget install -e --id dbeaver.dbeaver
```

### Thông tin kết nối cho project này

Lấy từ `docker-compose.yml` (giá trị mặc định) và `.env` (giá trị thật đang
dùng — ưu tiên theo `.env` nếu có đổi khác mặc định):

| Trường | Giá trị mặc định |
|---|---|
| Host | `localhost` |
| Port | `5432` (đổi qua `POSTGRES_PORT` nếu có) |
| Database | `nextjs_prisma_base` |
| Username | `postgres` |
| Password | `postgres` (đổi theo `POSTGRES_PASSWORD` trong `.env` nếu đã đổi) |

> Nếu chưa chạy `docker compose up -d postgres` thì DBeaver sẽ không kết nối
> được — khởi động container đó trước.

### Tạo connection

1. **Database** → **New Database Connection** → chọn **PostgreSQL**
2. Điền 5 trường ở bảng trên vào tab **Main**
3. Bấm **Test Connection...** (DBeaver sẽ hỏi tải driver PostgreSQL lần đầu —
   đồng ý để nó tự tải)
4. Thấy **Connected** thì **Finish**

### Vài việc hay cần trong project này

Kiểm tra migration đã áp dụng tới bản nào (đối chiếu với thư mục
`prisma/migrations/`):

```sql
SELECT migration_name, finished_at
FROM _prisma_migrations
ORDER BY finished_at DESC;
```

Xem nhanh các tài khoản đang bị khoá/xoá mềm (hai khái niệm khác nhau — xem
`schema.prisma`):

```sql
SELECT id, email, status, "lockedUntil", "deletedAt"
FROM users
WHERE status = 'BANNED' OR "lockedUntil" > now() OR "deletedAt" IS NOT NULL;
```

Xem tài khoản mạng xã hội đã liên kết (bảng `accounts`, mới thêm cho OAuth):

```sql
SELECT a.provider, a."providerAccountId", u.email
FROM accounts a
JOIN users u ON u.id = a."userId";
```

## Bảo mật khi kết nối

`docker-compose.yml` map cổng `5432` ra host (`ports: "5432:5432"`) để DBeaver/
Prisma Studio ở máy dev kết nối được. Trên VPS/production, **không mở port này
ra internet** — chỉ kết nối qua SSH tunnel:

```bash
ssh -L 5433:localhost:5432 user@your-vps-ip
```

rồi trỏ DBeaver vào `localhost:5433` thay vì gõ thẳng IP VPS vào ô Host.
