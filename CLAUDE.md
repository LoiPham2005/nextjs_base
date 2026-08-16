# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

**Đọc [README.md](README.md) trước khi làm bất cứ gì** — nó đã giải thích rất kỹ kiến trúc bảo
mật (Server Action là endpoint công khai, kiểm quyền nhiều lớp độc lập), RBAC lai code/database,
mô hình mật khẩu/token, deploy (Docker vs VPS bare-metal), realtime WebSocket, và REST API cho
mobile — file CLAUDE.md này **không lặp lại** nội dung đó, chỉ bổ sung phần README chưa có và lệnh
thao tác nhanh.

## Lệnh hay dùng

```bash
pnpm dev                        # dev server, Turbopack mặc định — http://localhost:3000
pnpm build && pnpm start        # build + chạy bản production

pnpm typecheck                  # tsc --noEmit
pnpm lint                       # eslint . (thêm :fix để tự sửa)
pnpm format                     # prettier --write . (thêm :check để chỉ kiểm tra)
pnpm test                       # toàn bộ test (thêm :watch hoặc :coverage)
pnpm check                      # cả 4 lệnh trên theo thứ tự — chạy trước khi coi là xong việc

# 1 file test
pnpm test src/services/auth.service.test.ts
# 1 test theo tên (khớp chuỗi)
pnpm test -- -t "khoá tài khoản khi sai mật khẩu chạm ngưỡng"

pnpm db:generate                # sinh lại Prisma Client sau khi sửa schema.prisma
pnpm db:migrate                 # tạo + áp migration mới (dev)
pnpm db:studio                  # GUI xem/sửa data — http://localhost:5555
pnpm db:seed:dev                # dữ liệu mẫu (roles, user demo)
```

⚠️ Sau khi sửa `prisma/schema.prisma`, **luôn chạy `pnpm db:generate` trước rồi tin
`pnpm typecheck` qua terminal** — IDE hay báo lỗi type cũ (client thật nằm trong
`node_modules/.pnpm/@prisma+client@.../node_modules/.prisma/client/`, TS server đôi khi cache trễ
1 nhịp). Xem [docs/GOTCHAS.md](docs/GOTCHAS.md#2-prisma-7-ide-báo-lỗi-type-sau-khi-sửa-schemaprisma-dù-code-đúng).

## Kiến trúc — điểm cần nắm trước khi đụng vào code

**Luồng dữ liệu**: route (`app/**/route.ts`, Server Action) → **service** (`src/services/*.ts`,
nơi DUY NHẤT gọi Prisma) → Prisma. Route không bao giờ query database trực tiếp; thêm tính năng
là thêm method vào service, không phải viết logic trong route.

**Hai bề mặt, một tầng nghiệp vụ**: web (Server Action, cookie session) và REST API cho mobile
(`src/app/api/**`, Bearer token) đều gọi CHUNG service layer — không có nghiệp vụ nào chỉ tồn tại
ở một phía. `getApiSession()` đọc header `Authorization` trước, fallback cookie, nên cùng logic
phục vụ được cả hai.

**Kiểm quyền độc lập ở từng lớp**, không tin lớp nào là đủ (bảng chi tiết trong README):
Proxy (`src/proxy.ts`, chỉ chặn trang, KHÔNG chạy trên `/api`) → trang (`requireAdmin`/
`requirePermission`) → **Server Action/route handler tự kiểm quyền lại** — đây là lớp bắt buộc,
2 lớp trước chỉ là UX.

**RBAC lai**: danh mục quyền tồn tại nằm trong code (`src/lib/permissions.ts`, TypeScript bắt lỗi
gõ sai tên); việc GÁN quyền cho vai trò nằm trong database (`roles`/`permissions`/
`role_permissions`), sửa được lúc chạy không cần deploy.

## Đã có kể từ README (README hơi lùi so với code hiện tại)

README mô tả kiến trúc nền tảng chính xác, nhưng các phần sau được thêm sau và **chưa được cập
nhật vào README**:

- **`User` có thêm**: `status` (`ACTIVE`/`BANNED`, khoá thủ công bởi admin — khác `lockedUntil`),
  `failedLoginAttempts` + `lockedUntil` (khoá tạm tự động sau N lần sai mật khẩu liên tiếp, xem
  `AuthService.validateCredentials`/`registerFailedAttempt` trong `src/services/auth.service.ts`),
  `deletedAt` (xoá mềm — `userService.delete()` không hard-delete nữa, xem
  [docs/GOTCHAS.md](docs/GOTCHAS.md#7-xoá-mềm-deletedat--cột-email-là-unique--không-thể-để-trống-khi-xoá)).
- **Đăng nhập OAuth** (Google/Github/Facebook/Apple) — tự viết bằng `fetch`/`jose`
  (`src/lib/oauth/*`, `src/services/oauth.service.ts`), **không dùng thư viện `arctic`** (đã bị
  tác giả deprecate, xem GOTCHAS #5). Route: `/api/auth/oauth/[provider]/{start,callback}`.
- **API mới**: `PATCH /api/users/[id]/status` (khoá/mở khoá), `POST /api/users/[id]/unlock` (mở
  khoá sớm) — cả hai cần quyền `user:update`.
- **Route group `(admin)`**: `/users` hiện nằm ở `src/app/(admin)/users/` (URL không đổi). Quy tắc
  đặt route group cho trang mới: chỉ tạo group khi có ranh giới quyền hạn thật + khả năng cần
  layout riêng — trang ai đăng nhập cũng xem được thì để thẳng ngoài `app/`, không group.
- **`src/components/`** đang được dựng theo hướng Shadcn-style (`ui/`, `layout/`, `common/`) — chỉ
  file nào **thực sự có nơi dùng** mới nên giữ, tránh tạo component rỗng "để sau".
- **Chưa có backup database tự động** — self-host Postgres qua Docker Compose, VPS mất là mất data.
  Xem [docs/disaster-recovery.md](docs/disaster-recovery.md) và
  [docs/HUONG_DAN_CHON_CONG_NGHE_HA_TANG.md](docs/HUONG_DAN_CHON_CONG_NGHE_HA_TANG.md).

## Tài liệu khác trong `docs/`

- [GOTCHAS.md](docs/GOTCHAS.md) — bug/bẫy đã gặp thật + cách xử lý, đọc trước khi debug lỗi quen mặt.
- [disaster-recovery.md](docs/disaster-recovery.md) — khôi phục backup, rollback deploy, xoay vòng secret, mất VPS.
- [HUONG_DAN_CHON_CONG_NGHE_HA_TANG.md](docs/HUONG_DAN_CHON_CONG_NGHE_HA_TANG.md) — so sánh database/object-storage/VPS managed (Neon, Supabase, R2, VPS Việt Nam...) kèm giá thật đã kiểm chứng.
- [HUONG_DAN_DUNG_DBEAVER_VA_PRISMA_STUDIO.md](docs/HUONG_DAN_DUNG_DBEAVER_VA_PRISMA_STUDIO.md) — cách xem/sửa database, kể cả kết nối production qua SSH tunnel.
- [HUONG_DAN_CAI_COOLIFY_QUAN_LY_NHIEU_DU_AN.md](docs/HUONG_DAN_CAI_COOLIFY_QUAN_LY_NHIEU_DU_AN.md) — deploy nhiều dự án trên 1 VPS bằng Coolify.

## Nguyên tắc khi thêm cấu trúc mới

Dự án này **cố tình tối giản** — không dựng sẵn thư mục/pattern cho nhu cầu chưa tồn tại
(`src/hooks/`, `src/types/`, `src/features/` đều đã bị từ chối vì lý do này). Trước khi tạo
component/hook/type/route-group mới, tự hỏi: đã có ≥2 nơi cần dùng thật chưa, hay đang tạo "để sau
dùng"? Nếu là vế sau, đợi tới khi có nhu cầu thật.
