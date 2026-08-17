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
pnpm test:e2e                   # Playwright — tự build production rồi chạy trình duyệt thật
pnpm check                      # cả 4 lệnh trên theo thứ tự — chạy trước khi coi là xong việc

# 1 file test
pnpm test src/services/auth.service.test.ts
# 1 test theo tên (khớp chuỗi)
pnpm test -- -t "khoá tài khoản khi sai mật khẩu chạm ngưỡng"

pnpm db:generate                # sinh lại Prisma Client sau khi sửa schema.prisma
pnpm db:migrate                 # tạo + áp migration mới (dev)
pnpm db:studio                  # GUI xem/sửa data — http://localhost:5555
pnpm db:seed:dev                # dữ liệu mẫu (roles, user demo)
pnpm db:purge                   # dọn token hết hạn + nhật ký cũ (qua tsconfig.scripts.json)

pnpm realtime:dev               # WebSocket, tiến trình riêng (cổng 3002)
pnpm worker:dev                 # job nền, tiến trình riêng — cần REDIS_URL
```

⚠️ `pnpm test:e2e` cần database đã seed (`pnpm db:seed:dev`) — bộ test đăng nhập bằng tài
khoản mẫu. Nó tự `pnpm build && pnpm start` trên cổng 3100, cố ý chạy bản production chứ không
phải `next dev`: CSP và React Refresh khác nhau giữa hai môi trường, mà đó đúng là chỗ dễ hỏng.

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
- **API mới**: `PATCH /api/v1/users/[id]/status` (khoá/mở khoá), `POST /api/v1/users/[id]/unlock`
  (mở khoá sớm) — cả hai cần quyền `user:update`. Thêm `PATCH /api/v1/users/[id]` (sửa hồ sơ):
  chính mình cần `profile:update:own`, người khác cần `user:update`, **riêng `roleKey` luôn đòi
  `user:update`** kể cả khi sửa chính mình — nếu không thì mọi user tự phong ADMIN được bằng một
  field trong body.
- **Quản trị vai trò** (`roleService`, `/roles`, `/api/v1/roles*`): ba bảng RBAC giờ có đường ghi
  từ ứng dụng, trước đây chỉ sửa được bằng SQL tay. Bốn quyền mới: `role:read/create/update/delete`
  — nhớ `pnpm db:seed` sau khi pull để đồng bộ danh mục quyền xuống database. Mọi đường ghi phân
  quyền BẮT BUỘC gọi `permissionService.invalidate()`.
- **Trang cho luồng email**: `/forgot-password`, `/reset-password`, `/verify-email` (trong
  `(auth)/`). Link trong email trỏ tới đây; trước đó chỉ có REST API nên bấm link là 404.
  `/verify-email` cố ý xác thực khi BẤM NÚT chứ không khi mở trang — bộ quét link của Gmail sẽ
  đốt mất token dùng-một-lần trước khi người dùng kịp bấm.
- **Rate limit có store cắm được** (`src/lib/rate-limit.ts`): `REDIS_URL` → Redis, không có →
  RAM. Hàm đã thành **async**, nên `rateLimit()`/`resetRateLimit()`/`enforceRateLimit()` đều phải
  `await`. Redis chết thì fail-open (tạm cho qua), có chủ đích.
- **Route group `(admin)`**: `/users` và `/roles` nằm ở `src/app/(admin)/` (URL không đổi). Quy tắc
  đặt route group cho trang mới: chỉ tạo group khi có ranh giới quyền hạn thật + khả năng cần
  layout riêng — trang ai đăng nhập cũng xem được thì để thẳng ngoài `app/`, không group.
- **E2E Playwright** (`e2e/`): lớp duy nhất bắt được loại lỗi "form gửi tên trường khác với
  schema" — typecheck không thấy (`safeParse` nhận `unknown`), unit test không thấy (gọi thẳng
  service). Giữ bộ này HẸP, chỉ những luồng mà hỏng là dịch vụ chết.
- **Ngưỡng coverage theo vùng** (`vitest.config.ts`): `src/services/**` và `src/lib/api/**`. Ý
  nghĩa là "không được tụt" — đừng hạ ngưỡng để CI xanh.
- **`tsconfig.scripts.json`**: script Node ngoài Next (như `pnpm db:purge`) cần nó để stub
  `server-only`. Đừng đưa alias đó vào `tsconfig.json` gốc — làm vậy là gỡ chốt chặn cho cả app.
- **Giao diện đã chốt MỘT hệ: Shadcn-style trong `src/components/ui/`.** Trước đó dự án có hai hệ
  song song — class thủ công (`.btn`, `.input-field`) ở `globals.css` và component Tailwind ở
  `ui/`. Chính chỗ hai hệ chạm nhau đã đẻ ra hai bug thật: header trắng đè nền tối, và nút chữ
  chàm trên nền chàm. Nay `.btn*`/`.input-field` đã bị xoá khỏi `globals.css`; **nút và ô nhập
  luôn dùng `<Button>`/`<Input>`**. Class CSS chỉ còn giữ những thứ thuần trình bày, không có
  trạng thái: `.card`, `.badge`, `.alert`, `.container`, `.form-grid`.
- **`ui/` chỉ giữ component có nơi dùng thật.** Hiện có đúng `button.tsx` và `input.tsx`; 6 file
  chưa ai dùng (avatar, badge, card, dialog, dropdown-menu, skeleton) đã bị xoá cùng 4 dependency
  chết. Cần lại thì `npx shadcn add <tên>` — nhanh hơn và chuẩn hơn bản tự viết để đó.
- **`(admin)/layout.tsx`** lo sidebar + `requireUser()` chung cho khu quản trị. ⚠️ Layout **không
  phải ranh giới bảo mật** — Server Action không đi qua nó. Mỗi trang vẫn tự `requirePermission`
  (mỗi trang cần quyền khác nhau), mỗi action vẫn tự kiểm quyền.
- **`src/lib/cn.ts`** (đổi tên từ `utils.ts`) — chỉ chứa hàm `cn()`. Tên `utils` là bãi rác, đổi
  tên để không ai nhét hàm không liên quan vào. `format.ts` (tiền VNĐ, ngày `vi-VN`, số điện thoại VN, slug bỏ dấu) hiện chưa nơi nào gọi tới, nhưng **được giữ lại** vì không lệnh nào tạo lại được — khác hẳn component shadcn. Bù lại nó có `format.test.ts` phủ kín: tiện ích chưa dùng mà không test thì tới ngày cần dùng mới phát hiện đã hỏng.
- **Chưa có backup database tự động** — self-host Postgres qua Docker Compose, VPS mất là mất data.
  Xem [docs/disaster-recovery.md](docs/disaster-recovery.md) và
  [docs/HUONG_DAN_CHON_CONG_NGHE_HA_TANG.md](docs/HUONG_DAN_CHON_CONG_NGHE_HA_TANG.md).

## Hạ tầng đã có (thêm sau khi README được viết)

Sáu lớp dưới đây đều theo **cùng một khuôn**: một interface hẹp + bản mặc định cho dev, cắm nhà
cung cấp thật bằng một hàm `setX()` lúc khởi động. Giống hệt `src/lib/mailer.ts` — bộ khung cố ý
không chọn sẵn nhà cung cấp cho bạn.

| Lớp                      | File                            | Mặc định khi chưa cấu hình                 |
| ------------------------ | ------------------------------- | ------------------------------------------ |
| Kiểm quyền Server Action | `src/lib/define-action.ts`      | — (luôn bật)                               |
| Cache                    | `src/lib/cache.ts`              | RAM tiến trình                             |
| Job queue                | `src/lib/queue.ts` + `worker/`  | Dev: chạy ngay tại chỗ · Prod: **ném lỗi** |
| Nhật ký thao tác         | `src/services/audit.service.ts` | — (luôn ghi)                               |
| Giám sát lỗi             | `src/lib/observability.ts`      | Không làm gì (log vẫn có)                  |
| Lưu trữ file             | `src/lib/storage.ts`            | Dev: ghi đĩa · Prod: **ném lỗi**           |

Vài điểm dễ sai:

- **`defineAction` biến kiểm quyền thành ràng buộc KIỂU.** Mọi Server Action mới phải bọc bằng nó
  — không khai báo quyền là không biên dịch được. Đừng quay lại lối viết `if (!session) return`
  thủ công: quên một chỗ thì không có gì báo.
- **Job queue: `enqueue()` ném lỗi trên production khi thiếu `REDIS_URL`.** Cố ý — job bị nuốt
  trong im lặng nghĩa là email không bao giờ gửi mà không ai biết. Mọi email đã đi qua hàng đợi.
- **`worker/` là tiến trình thứ ba**, sau `web` và `realtime`. Cả ba đường deploy đã nối sẵn.
  Thiếu nó thì job nằm trong Redis mà không ai chạy.
- **`logger.error()` tự đẩy sang `captureException`** — không cần rải `Sentry.captureException`
  khắp nơi, và cũng đừng làm vậy.
- **`assertUploadAllowed` đọc magic bytes, không tin `file.type`.** Với ảnh thì "không chứng minh
  được là ảnh" = từ chối (danh sách trắng). Với PDF/zip thì chưa kiểm được nội dung — phục vụ
  chúng từ tên miền khác kèm `Content-Disposition: attachment`.
- **Audit log KHÔNG có khoá ngoại tới `users`** — nhật ký phải sống lâu hơn đối tượng nó ghi lại.
  `record()` nuốt mọi lỗi để không làm hỏng thao tác chính; cần chắc chắn thì dùng
  `recordOrThrow()` trong cùng transaction.

- **`GET`/`DELETE /api/v1/auth/sessions[/id]`** — màn "thiết bị đang đăng nhập". Ràng buộc quyền
  sở hữu nằm TRONG câu truy vấn (`where: { id, userId }`), không phải một phép kiểm tra riêng —
  `id` đến từ URL nên người gọi tự đặt được. Trả 404 cho cả "không tồn tại" lẫn "của người khác".
  `TokenPair` giờ có thêm `sessionId` để client tự nhận ra phiên của mình; nó **đổi sau mỗi lần
  refresh** vì refresh token xoay vòng.
- **`/users` phân trang kiểu cursor**, không phải offset: danh sách đang được sửa liên tục nên
  offset lệch ngay khi có dòng chèn vào giữa. Không có nút "Trang trước" — mỗi trang là một URL
  riêng nên nút Back của trình duyệt làm đúng việc đó.

## Tài liệu khác trong `docs/`

- [DEPLOY_COOLIFY.md](docs/DEPLOY_COOLIFY.md) — deploy bằng Coolify (self-hosted PaaS). Bắt buộc
  chọn build pack **Docker Compose**, vì dự án cần 5 service chạy cùng nhau. Coolify tự cài
  Docker và có proxy riêng — **đừng cài Caddy tay**, sẽ tranh cổng 80/443.
- ⚠️ **Cổng trong `docker-compose.yml` phải bind `127.0.0.1:`.** `ufw` KHÔNG chặn được cổng do
  Docker công bố (Docker ghi luật vào chuỗi DOCKER của iptables, đứng trước ufw), nên bỏ tiền
  tố loopback là Postgres nghe thẳng trên IP công khai — và `ufw deny 5432` không cứu được.
- [DEPLOY_VPS.md](docs/DEPLOY_VPS.md) — deploy lên VPS bằng Docker / systemd / PM2. Cả ba đường
  đều chạy **hai** tiến trình (web + realtime); thiếu cái thứ hai thì WebSocket im lặng không hoạt
  động. Caddyfile phải có khối `/socket.io/*` sang cổng 3002, nếu không realtime chạy mà không ai
  tới được. PM2 mặc định 1 instance và **chặn** cluster khi thiếu `REDIS_URL` — nhiều tiến trình
  không Redis là ngưỡng rate limit bị nhân lên, im lặng.

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
