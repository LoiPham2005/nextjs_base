# nextjs_base — Next.js 16 + Prisma

Bộ khung Next.js 16 (App Router) + Prisma + PostgreSQL cho ứng dụng web có đăng
nhập, đã siết bảo mật và có sẵn đường mở REST API cho mobile.

**Ngăn xếp:** Next.js 16 · React 19 · TypeScript (strict) · Prisma 7 · Zod 4 ·
jose (JWT session) · Tailwind CSS 4 · Vitest 4 · pnpm 10 · Node 24 · Docker

---

## Khởi chạy lần đầu

```bash
pnpm install                       # cài dependencies (corepack tự dùng đúng pnpm)
cp .env.example .env               # rồi mở .env điền giá trị

# Sinh khoá ký session và dán vào SESSION_SECRET
openssl rand -base64 48

docker compose up -d postgres      # hoặc trỏ DATABASE_URL tới Postgres sẵn có
pnpm db:migrate                    # tạo bảng
pnpm db:seed:dev                   # nạp dữ liệu mẫu
pnpm dev                           # http://localhost:3000
```

Tài khoản sau khi `db:seed:dev`:

| Email                   | Quyền | Mật khẩu         |
| ----------------------- | ----- | ---------------- |
| `admin@example.com`     | ADMIN | theo `.env`      |
| `dev.admin@example.com` | ADMIN | `devpassword123` |
| `user1@example.com`     | USER  | `devpassword123` |

---

## Cấu trúc

```
nextjs_base/
├── prisma.config.ts           # Cấu hình Prisma CLI (Prisma 7 bỏ `url` khỏi schema)
├── prisma/
│   ├── schema.prisma          # Schema database
│   ├── migrations/            # Migration đã commit — bắt buộc để deploy
│   └── seeds/                 # seed-prod (dữ liệu nền) & seed-dev (dữ liệu mẫu)
├── src/
│   ├── proxy.ts               # CSP + chặn route chưa đăng nhập (Next 16 gọi là Proxy)
│   ├── app/
│   │   ├── (auth)/            # Trang login/register + Server Action xác thực + nút OAuth
│   │   ├── (admin)/users/     # CRUD người dùng (chỉ ADMIN) — route group khu quản trị
│   │   ├── api/
│   │   │   ├── health/        # Health check — KHÔNG versioned, đọc bởi Docker/deploy script
│   │   │   └── v1/            # REST API cho mobile, có version — xem mục riêng bên dưới
│   │   │       ├── auth/      # register, login, refresh, logout, me, oauth/*
│   │   │       ├── users/     # CRUD qua JSON, kể cả status/unlock
│   │   │       └── openapi.json/  # Đặc tả OpenAPI sinh từ Zod schema
│   │   ├── error.tsx          # Error boundary
│   │   ├── global-error.tsx   # Bắt lỗi xảy ra ngay trong root layout
│   │   ├── not-found.tsx
│   │   └── loading.tsx
│   ├── components/            # layout/ (Header, Footer), common/ (Logo), ui/ (Shadcn-style)
│   ├── lib/
│   │   ├── env.ts             # Validate biến môi trường bằng Zod lúc khởi động
│   │   ├── session.ts         # Ký/verify JWT — không dính cookie, dùng chung web+mobile
│   │   ├── auth.ts            # Bản cho web: đọc cookie, requireUser/requireAdmin
│   │   ├── api/               # Bản cho REST API: Bearer token, envelope JSON, map lỗi
│   │   ├── oauth/             # OAuth 2.0 + PKCE tự viết (Google/Github/Facebook/Apple)
│   │   ├── openapi/           # Đăng ký Zod schema → tài liệu OpenAPI (/api/v1/openapi.json)
│   │   ├── prisma.ts          # Prisma Client singleton (an toàn với HMR)
│   │   ├── crypto.ts          # Argon2id + so sánh giả chống dò qua thời gian
│   │   ├── rate-limit.ts      # Giới hạn tần suất đăng nhập theo IP
│   │   └── logger.ts          # Log JSON một dòng, tự che trường nhạy cảm
│   ├── schemas/               # Zod schema (nguồn sự thật cho validation)
│   └── services/              # Tầng nghiệp vụ — nơi duy nhất gọi Prisma
├── realtime/                  # Máy chủ WebSocket — TIẾN TRÌNH RIÊNG, ngoài Next
├── Dockerfile                 # 4 stage: deps / builder / migrator / runner
└── docker-compose.yml         # postgres + migrate (chạy 1 lần) + web
```

---

## Mô hình bảo mật

Đọc phần này trước khi thêm tính năng — nó giải thích vì sao code được viết như vậy.

### Server Action là endpoint công khai

Đây là điểm dễ sai nhất của App Router. Mỗi Server Action là một HTTP endpoint
mà bất kỳ ai cũng POST tới được, **kể cả khi trang chứa nó nằm sau Proxy**.
Proxy chỉ chặn được người chưa đăng nhập; một tài khoản USER hợp lệ vẫn gửi
thẳng request tới action dành cho ADMIN được.

Vì vậy quyền được kiểm ở **nhiều lớp độc lập**:

| Lớp                           | Chặn được gì                         | Ở đâu                              |
| ----------------------------- | ------------------------------------ | ---------------------------------- |
| Proxy (chỉ trang, KHÔNG /api) | Người chưa đăng nhập vào trang       | `src/proxy.ts`                     |
| Trang (`requireAdmin`)        | Người đăng nhập nhưng không đủ quyền | `src/app/(admin)/users/page.tsx`   |
| **Server Action (bắt buộc)**  | Request gửi thẳng tới action         | `src/app/(admin)/users/actions.ts` |
| **Route handler (bắt buộc)**  | Mọi request tới REST API             | `src/app/api/**`                   |

Thêm action mới thì **luôn** tự kiểm quyền trong action đó. Ràng buộc này được
khoá bằng test trong `src/app/(admin)/users/actions.test.ts`.

### Những điểm khác

- **Quyền lấy từ database, không lấy từ token.** Token sống 7 ngày; trong
  khoảng đó user có thể bị xoá hoặc hạ quyền. `getCurrentUser()` luôn đọc lại DB.
- **`role` không bao giờ đọc từ form.** Nếu đọc, người dùng tự phong ADMIN
  bằng một field ẩn.
- **Thông điệp đăng nhập sai luôn giống nhau** và tốn thời gian như nhau, kể cả
  khi email không tồn tại (`CryptoUtils.fakeCompare`) — không thì đo thời gian
  phản hồi là dò được email đã đăng ký.
- **`?next=` được lọc.** Chỉ nhận đường dẫn nội bộ; `//evil.com` bị chặn.
- **CSP có nonce sinh theo từng request**, dựng trong `src/proxy.ts`.
- **Biến môi trường validate lúc khởi động** — sai thì app không lên, thay vì
  chết ở request đầu tiên chạm tới nó.
- **Rate limit đăng nhập**: 5 lần / 5 phút mỗi IP. State nằm trong RAM một
  tiến trình — khi chạy nhiều replica thì thay bằng Redis, chỗ gọi giữ nguyên.

---

## Mật khẩu, quyền hạn và xác thực email

### Băm mật khẩu — Argon2id, tự nâng cấp dần

Dùng `@node-rs/argon2` với tham số OWASP (19 MiB, 2 lượt, 1 luồng). Argon2id
tốn cả CPU lẫn **bộ nhớ**, nên dàn GPU dò offline bị chặn bởi băng thông bộ nhớ
— thứ đắt và khó mở rộng hơn số nhân.

Kho mật khẩu cũ băm bằng bcrypt **vẫn đăng nhập được**. Không thể chuyển đổi
một hash sang thuật toán khác nếu không biết mật khẩu gốc, nên việc nâng cấp
diễn ra ngay lúc đăng nhập thành công — khi mật khẩu còn trong bộ nhớ:

1. `verifyPassword` nhận diện thuật toán từ chính chuỗi hash.
2. Đúng mật khẩu + hash cũ → trả về `needsRehash: true`.
3. `AuthService` băm lại bằng Argon2id và ghi đè.

Người dùng không thấy gì khác. Lỗi ở bước ghi đè bị nuốt có chủ đích — họ đã
nhập đúng mật khẩu, một thao tác nền thất bại không được phép chặn đăng nhập.

Đổi tham số Argon2 trong `src/lib/crypto.ts` cũng kích hoạt đúng cơ chế này:
mọi hash sinh bằng tham số cũ sẽ được băm lại ở lần đăng nhập kế tiếp.

### Phân quyền — RBAC lai giữa code và database

Ba bảng: `roles`, `permissions`, `role_permissions`. Nhưng **không phải RBAC
thuần database** — phân công như sau:

|                            | Nơi giữ                         | Vì sao                                                                                                                                                           |
| -------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Danh mục quyền TỒN TẠI     | Code (`src/lib/permissions.ts`) | Một quyền chỉ có nghĩa khi có mã kiểm tra nó. Cho tạo quyền từ giao diện sẽ sinh ra những dòng không ràng buộc điều gì. TypeScript vẫn bắt lỗi gõ sai tên quyền. |
| Việc GÁN quyền cho vai trò | Database                        | "Kế toán được xem báo cáo nhưng không xoá đơn" là quyết định nghiệp vụ, khác nhau theo khách hàng, và không nên cần deploy.                                      |

```ts
// Trang / layout
await requirePermission("user:read");

// Route handler
await requireApiPermission(request, "user:delete");

// Có xét quyền `:own`
await permissionService.canActOnResource(session.role, ownerId, session.sub, {
  any: "user:read",
  own: "profile:read:own",
});
```

**Thêm quyền mới**: khai báo trong `PERMISSIONS`, thêm mô tả vào
`PERMISSION_DESCRIPTIONS`, gán mặc định trong `DEFAULT_ROLE_PERMISSIONS`, rồi
`pnpm db:seed`. Không cần viết migration.

**Thêm vai trò mới**: chèn thẳng vào bảng `roles` lúc chạy. Không cần deploy.

#### Cache — và hai giới hạn phải biết

`permissionService` giữ bản đồ vai trò → quyền trong RAM, TTL 60 giây. Không có
nó thì mỗi request là một lần join ba bảng chỉ để đọc dữ liệu đổi vài lần một
năm.

1. **Cache theo tiến trình.** Chạy nhiều replica thì `invalidate()` chỉ xoá bản
   sao của replica đang xử lý request đó; các replica khác tự làm mới sau TTL.
   Cần đồng bộ tức thì thì chuyển cache sang Redis — chỗ gọi giữ nguyên.
2. **Mọi thao tác ghi phân quyền BẮT BUỘC gọi `permissionService.invalidate()`.**
   Quên thì quản trị viên bỏ tick một quyền, thử lại ngay, thấy vẫn làm được,
   và kết luận hệ thống hỏng.

⚠️ Quyền được tra theo `role` **lấy từ token**, không phải từ database. Người
vừa bị đổi vai trò vẫn giữ vai trò cũ tới khi token hết hạn. Với thao tác nhạy
cảm (xoá dữ liệu, chuyển tiền, đổi quyền người khác), đọc lại `role` từ database
ngay trong route đó.

**Seed chỉ THÊM, không ghi đè.** Nếu seed áp lại `DEFAULT_ROLE_PERMISSIONS` thì
mỗi lần deploy sẽ xoá sạch cấu hình khách hàng đã chỉnh — và không ai hiểu vì
sao phân quyền "tự quay về như cũ".

### Danh tính người dùng — email, username, fullName

- `email` — bắt buộc, **luôn hạ về chữ thường** trước khi ghi và trước khi tra.
  Không chuẩn hoá thì `Loi@x.com` và `loi@x.com` thành hai tài khoản.
- `username` — tuỳ chọn, unique, chỉ `[a-z0-9_]{3,32}`. Cấm chữ hoa ngay từ
  đầu vào thay vì tự hạ xuống, để người dùng biết chính xác tên họ sẽ là gì.
- `fullName` — tên hiển thị. Tách bạch với `username`: một cái để người khác
  đọc, một cái để đăng nhập.

Đăng nhập nhận **cả hai** qua một trường `identifier`. Có ký tự `@` thì tra theo
email, không thì tra theo username — `usernameSchema` cấm `@` nên không nhập
nhằng.

⚠️ **Phá vỡ tương thích**: trường đăng nhập đổi từ `email` sang `identifier`.
Client mobile đang chạy phải cập nhật theo.

### Xác thực email và đặt lại mật khẩu

Token dùng một lần, lưu trong bảng `verification_tokens`:

- **Chỉ lưu SHA-256**, không lưu token gốc — rò database không mất tài khoản.
- **Dùng một lần thật sự**: đánh dấu bằng `updateMany` có điều kiện `usedAt:
null` rồi kiểm tra số dòng. Đọc-trước-ghi-sau sẽ để hai request song song
  dùng được cùng một token.
- **Cấp mới thì huỷ token cũ cùng loại**, trong cùng transaction.
- **Hạn khác nhau theo loại**: xác thực email 24 giờ, đặt lại mật khẩu 60 phút.
  Link đặt lại mật khẩu bị lộ là mất tài khoản, nên phải ngắn hơn.
- **Đổi mật khẩu thu hồi toàn bộ refresh token.** Luồng này thường xuất phát từ
  nghi ngờ bị chiếm tài khoản; để phiên cũ sống thì việc đổi gần như vô nghĩa.

`/api/v1/auth/forgot-password` **luôn trả 200**, kể cả khi email không tồn tại và
kể cả khi gửi thư thất bại. Bất kỳ khác biệt nào — mã lỗi, thời gian phản hồi —
đều biến nó thành công cụ dò danh sách người dùng. Lỗi thật vẫn vào log.

### Gửi email

`src/lib/mailer.ts` chỉ định nghĩa interface. Bộ khung **cố tình không chọn nhà
cung cấp**: mỗi dự án bị ràng buộc khác nhau (SMTP nội bộ của khách, Resend,
SES…), cắm cứng một cái chỉ tạo ra việc phải gỡ ra.

- **Dev**: nội dung email ghi ra log — lấy link trong đó mà test.
- **Production**: bản mặc định **ném lỗi**, buộc phải cấu hình thật. Im lặng
  nuốt email nguy hiểm hơn nhiều: người dùng bấm "quên mật khẩu", hệ thống báo
  thành công, thư không bao giờ tới.

```ts
setMailer({
  async send({ to, subject, text }) {
    /* gọi nhà cung cấp */
  },
});
```

`NEXT_PUBLIC_APP_URL` là **bắt buộc** khi bật luồng email — link trong thư dựng
từ nó. Thiếu thì việc gửi ném lỗi ngay, thay vì gửi đi một email chứa link
localhost mà không rút lại được.

---

## Các lệnh

```bash
# Phát triển
pnpm dev              # dev server (Turbopack đã là mặc định ở Next 16)
pnpm build            # build production
pnpm start            # chạy bản build

# Chất lượng — `pnpm check` chạy cả 4
pnpm typecheck
pnpm lint             # thêm :fix để tự sửa
pnpm format           # thêm :check để chỉ kiểm tra
pnpm test             # thêm :watch hoặc :coverage
pnpm check

# Database
pnpm db:migrate       # tạo migration mới (dev)
pnpm db:deploy        # áp migration đã có (production)
pnpm db:generate
pnpm db:studio
pnpm db:seed:dev      # dữ liệu mẫu
pnpm db:seed:prod     # chỉ tài khoản admin nền
pnpm db:reset         # XOÁ SẠCH rồi tạo lại
```

`make help` liệt kê các lệnh tương đương.

---

## Deploy

Hỗ trợ hai cách, chọn một:

|              | **Docker**                            | **VPS trực tiếp**                |
| ------------ | ------------------------------------- | -------------------------------- |
| Hợp khi      | máy chưa có gì, muốn dựng nhanh       | VPS đã có sẵn Postgres, muốn nhẹ |
| Postgres     | container kèm theo                    | tự cài trên máy                  |
| RAM tiêu tốn | nhiều hơn                             | ít hơn                           |
| Migration    | service `migrate` tự chạy trước `web` | `scripts/deploy-vps.sh` chạy     |

### Cách 1 — Docker

```bash
# Lần đầu
docker compose up -d          # postgres → migrate (1 lần) → web

# Mỗi lần deploy sau đó
./scripts/deploy-docker.sh    # pull → build → up → health check → dọn image cũ
```

Bước dọn image ở cuối **không phải tuỳ chọn**. Mỗi lần build, image cũ mất tag
và thành `<none>` nhưng vẫn chiếm đĩa; VPS 20–40GB deploy vài chục lần là đầy,
và Docker hỏng khi hết chỗ chứ không báo trước. Script chỉ dọn **sau khi** đã
xác nhận service khoẻ — deploy hỏng thì image cũ chính là đường lùi.

`web` chỉ khởi động sau khi service `migrate` kết thúc thành công, nên schema
luôn được áp trước request đầu tiên. Image runtime chạy bằng user không phải
root và có `HEALTHCHECK` gọi `/api/health`.

Cần `.env` có `SESSION_SECRET` — không có thì container dừng ngay kèm thông báo
rõ ràng, đó là chủ ý.

### Cách 2 — VPS trực tiếp (systemd + Caddy)

```bash
# --- một lần trên máy chủ ---
sudo mkdir -p /etc/nextjs-base
sudo cp .env.example /etc/nextjs-base/env   # rồi điền giá trị thật
sudo chmod 600 /etc/nextjs-base/env         # file này chứa SESSION_SECRET

sudo cp deploy/nextjs-base.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now nextjs-base

sudo cp deploy/Caddyfile /etc/caddy/Caddyfile   # đổi example.com
sudo systemctl reload caddy

# --- mỗi lần deploy ---
./scripts/deploy-vps.sh     # pull → install → migrate → build → restart → health check
```

**Vì sao Caddy chứ không phải nginx.** Caddy tự xin và tự gia hạn chứng chỉ
Let's Encrypt ngay trong tiến trình của nó — không certbot, không cron. Cert
hết hạn lúc 3 giờ sáng là nguyên nhân downtime phổ biến nhất của deploy thủ
công, và Caddy xoá hẳn nguyên nhân đó. Cấu hình cũng ngắn hơn khoảng 4 lần.

Repo cố tình chỉ có **một** file reverse proxy. Giữ sẵn thêm một file nginx
"phòng khi cần" nghe hợp lý, nhưng file thứ hai không ai chạy là file không ai
kiểm chứng — nó sẽ âm thầm sai theo thời gian.

Nếu VPS đã chạy nginx cho dự án khác (thêm Caddy sẽ tranh cổng 80/443), viết
một server block nginx trỏ tới `127.0.0.1:3000` là xong. Chỉ cần nhớ đúng một
điều bên dưới.

> **Bẫy chung cho mọi reverse proxy:** phải **ghi đè** `X-Forwarded-For` bằng
> IP thật — `{remote_host}` ở Caddy, `$remote_addr` ở nginx (KHÔNG dùng
> `$proxy_add_x_forwarded_for`). Nếu chỉ nối thêm vào header sẵn có, client tự
> gửi header giả là né sạch rate limit đăng nhập.

#### Vài điểm dễ vấp

- **`pnpm build` tự chép `public/` và `.next/static/` vào `.next/standalone/`**
  ([scripts/prepare-standalone.mjs](scripts/prepare-standalone.mjs)). Next.js
  cố tình không làm bước này. Quên nó thì server vẫn trả HTML 200 nhưng toàn bộ
  CSS/JS trả 404 — trang hiện ra trần trụi mà không có lỗi nào báo.
- **File env nằm ở `/etc/nextjs-base/env`, không phải `.env` trong mã nguồn.**
  `server.js` của bản standalone tự `process.chdir()` vào thư mục của nó nên
  `.env` ở gốc dự án không bao giờ được nạp trên production. systemd truyền
  biến vào qua `EnvironmentFile`.
- **App chỉ lắng nghe `127.0.0.1`.** Reverse proxy là cửa duy nhất ra Internet;
  bind `0.0.0.0` là để lộ cổng 3000, đi vòng qua cả TLS lẫn rate limit.
- Yêu cầu **Node ≥ 22.9**. Node 20 đã hết vòng đời hỗ trợ từ tháng 4/2026.

---

## Realtime (WebSocket)

Tiến trình **riêng**, không nằm trong Next.js — xem [realtime/](realtime/).

```bash
pnpm realtime:dev      # cổng 3002
pnpm realtime:build    # gói thành một file bằng esbuild
pnpm realtime:start    # chạy bản đã build
```

**Vì sao phải tách khỏi Next.** App Router là mô hình request/response, không
giữ được kết nối WebSocket lâu dài. Nhét socket vào Next bằng custom server thì
phá `output: "standalone"`, và **mỗi lần deploy web là rớt sạch kết nối đang
mở** — với app chat thì đó là lỗi nghiêm trọng.

**Vì sao KHÔNG dùng NestJS.** Tiến trình này chỉ làm một việc và nó dùng lại
`verifySession` cùng tầng service của app chính, nên web, mobile và socket chung
đúng một token, một tầng nghiệp vụ. Cân nhắc framework có DI khi nó phình ra
nhiều gateway, queue consumer và cron — không phải chỉ vì có socket.

**Vì sao `realtime/` nằm ngoài `src/`.** `src/` là ứng dụng Next; mọi thứ trong
đó nằm trong đồ thị module của Next. Để bên ngoài thì việc lỡ import một thứ chỉ
chạy được trong Next (`next/headers`, `server-only`) sẽ lộ ngay lúc bundle, thay
vì build xanh rồi chết lúc chạy.

### Điểm cần biết

- **Xác thực ở handshake**, không phải sau khi đã nối. Cho nối trước rồi mới
  kiểm tra nghĩa là kẻ tấn công vẫn giữ được kết nối mở và tiêu tài nguyên.
- **`REDIS_URL` bắt buộc từ instance thứ hai trở đi.** Thiếu nó thì client nối
  vào máy A không nhận được tin phát từ máy B — im lặng, không lỗi nào.
- **`connectionStateRecovery`** bật sẵn: mạng rớt rồi quay lại trong 2 phút thì
  nối tiếp phiên cũ. Quan trọng với mobile.
- **`ack` callback** là cách client phân biệt "đã gửi" với "mất mạng".

### Ba thứ quyết định app chat sống hay chết — chưa có trong khung này

Đây là khung kết nối, không phải app chat hoàn chỉnh. Trước khi làm chat thật:

1. **Push notification.** Socket chết ngay khi người dùng thoát app; mỗi tin
   nhắn phải đi hai đường — socket cho người online, FCM/APNs cho người offline.
2. **ULID do client sinh** làm khoá idempotent, để gửi lại khi mất mạng không
   tạo tin nhắn trùng.
3. **Sequence number theo từng hội thoại** để sắp xếp — đừng tin đồng hồ máy
   client.

Chọn sai framework thì sửa được; thiếu ba thứ trên thì phải làm lại từ đầu.

---

## REST API cho mobile (Flutter)

Web và mobile dùng chung tầng service; chỉ khác cách mang danh tính:
**web dùng cookie, mobile dùng `Authorization: Bearer`**. Cùng một endpoint
phục vụ được cả hai — `getApiSession()` đọc header trước, không có thì fallback
cookie.

Quan trọng: **Proxy cố tình không chạy trên `/api`** ([src/proxy.ts](src/proxy.ts)).
Proxy nói chuyện bằng redirect và HTML, còn client mobile cần JSON kèm đúng
status code. Hệ quả: route handler là lớp kiểm quyền **duy nhất** của API, nên
mọi handler phải gọi `requireApiUser()` hoặc `requireApiAdmin()`.

### Các endpoint có sẵn

| Method                                                                       | Đường dẫn | Quyền |
| ---------------------------------------------------------------------------- | --------- | ----- |
| ⚠️ Toàn bộ endpoint client (mobile) nằm dưới **`/api/v1`** — versioning thêm |
| sớm có chủ đích, xem mục "Vì sao có `/v1`" bên dưới. Riêng `/api/health`     |
| không versioned vì đó là healthcheck hạ tầng (Docker/deploy script đọc trực  |
| tiếp), không phải hợp đồng dữ liệu cho client.                               |

| `POST` | `/api/v1/auth/register` | công khai |
| `POST` | `/api/v1/auth/login` | công khai |
| `POST` | `/api/v1/auth/refresh` | refresh token |
| `POST` | `/api/v1/auth/logout` | đã đăng nhập |
| `GET` | `/api/v1/auth/me` | đã đăng nhập |
| `POST` | `/api/v1/auth/forgot-password` | công khai |
| `POST` | `/api/v1/auth/reset-password` | token trong email |
| `POST` | `/api/v1/auth/verify-email` | token trong email |
| `POST` | `/api/v1/auth/verify-email/request` | đã đăng nhập |
| `POST` | `/api/v1/auth/change-password` | đã đăng nhập |
| `GET` | `/api/v1/auth/oauth/{provider}/start` | công khai (redirect) |
| `GET`\* | `/api/v1/auth/oauth/{provider}/callback` | công khai (redirect) |
| `GET` | `/api/v1/users` | ADMIN |
| `POST` | `/api/v1/users` | ADMIN |
| `GET` | `/api/v1/users/{id}` | ADMIN hoặc chính mình |
| `DELETE` | `/api/v1/users/{id}` | ADMIN |
| `PATCH` | `/api/v1/users/{id}/status` | ADMIN |
| `POST` | `/api/v1/users/{id}/unlock` | ADMIN |
| `GET` | `/api/v1/openapi.json` | công khai |
| `GET` | `/api/health` | công khai (unversioned)|

\* Apple bắt buộc `POST` cho endpoint callback — xem `src/lib/oauth/`.

**Tài liệu tương tác**: `/api/v1/openapi.json` sinh tự động từ Zod schema thật
(`src/lib/openapi/registry.ts`) — dán URL này vào editor.swagger.io hoặc
Postman ("Import từ link") để có docs luôn khớp code, không lệch tay.

### Vì sao có `/v1`

Mobile không deploy tức thời như web — app đã lên store không thể ép user
update ngay. Đổi hợp đồng API breaking mà không versioning sẽ làm bản cũ hỏng
ngay lập tức, không cách nào cứu. Thêm `/v1` từ đầu, trước khi có user thật,
để việc này không bao giờ phải làm trong hoảng loạn sau này.

### Định dạng response

Thành công `{ "data": ... }`, thất bại `{ "error": { "code", "message", "fields"? } }`.

Client nên switch-case theo **`code`**, không theo `message` — message là lời
văn hiển thị cho người dùng và có thể đổi bất cứ lúc nào.

`VALIDATION_ERROR` (422) · `UNAUTHENTICATED` (401) · `FORBIDDEN` (403) ·
`NOT_FOUND` (404) · `CONFLICT` (409) · `RATE_LIMITED` (429) ·
`ACCOUNT_BANNED` (403) · `ACCOUNT_LOCKED` (423) · `INTERNAL_ERROR` (500)

### Mô hình token

`login`/`register` trả về:

```json
{
  "data": {
    "user": { "id": "...", "email": "...", "role": "USER" },
    "accessToken": "eyJ...",
    "expiresIn": 900,
    "tokenType": "Bearer",
    "refreshToken": "hZ8...",
    "refreshExpiresAt": "2026-09-02T06:49:58.739Z"
  }
}
```

- **Access token** — JWT, mặc định 15 phút, không thu hồi được. Hạn ngắn chính
  là thứ giới hạn thiệt hại khi bị lộ.
- **Refresh token** — chuỗi ngẫu nhiên, mặc định 30 ngày, **chỉ lưu SHA-256
  trong database**. Rò database không đồng nghĩa với rò phiên đăng nhập.
- **Xoay vòng mỗi lần refresh.** Token cũ bị thu hồi ngay khi cấp token mới.
- **Phát hiện dùng lại.** Nếu một token đã thu hồi lại được dùng, toàn bộ phiên
  của tài khoản đó bị huỷ — kể cả token mới vừa cấp. Token đã xoay vòng mà còn
  được dùng lại chỉ có một cách giải thích hợp lý là nó đã bị đánh cắp; lúc đó
  không phân biệt được bên nào là kẻ trộm nên đá cả hai ra là phản ứng đúng.

Phía Flutter: lưu cả hai bằng `flutter_secure_storage`, gắn interceptor để khi
gặp 401 thì gọi `/api/v1/auth/refresh` rồi thử lại request. **Không cần CORS** vì
app native không phải trình duyệt.

### Thêm endpoint mới

```ts
// src/app/api/posts/route.ts
import { requireApiAdmin } from "@/lib/api/auth";
import { apiOk, handleApiError, parseJsonBody } from "@/lib/api/response";
import { createPostSchema } from "@/schemas/post.schema";
import { postService } from "@/services/post.service";

export async function POST(request: Request) {
  try {
    await requireApiAdmin(request); // BẮT BUỘC — proxy không bảo vệ /api
    const body = await parseJsonBody(request, createPostSchema);
    return apiOk({ post: await postService.create(body) }, 201);
  } catch (error) {
    return handleApiError(error, { route: "POST /api/posts" });
  }
}
```

`handleApiError` tự ánh xạ lỗi có kiểu ở tầng service sang status tương ứng
(`UserAlreadyExistsError` → 409, `UserNotFoundError` → 404…), và nuốt mọi lỗi
lạ thành 500 mà không để lộ nội dung ra ngoài.

---

## Việc còn để ngỏ

- **Rate limit dùng Redis** khi chạy nhiều hơn một instance.
- **Dọn refresh token hết hạn**: `tokenService.purgeExpired()` đã sẵn sàng,
  chỉ cần gắn vào một cron. Bảng `refresh_tokens` chỉ tăng, mỗi lần đăng nhập
  thêm một dòng.
- **Error tracking** (Sentry/OpenTelemetry): điểm nối đã có sẵn trong
  `src/app/error.tsx` và `src/lib/logger.ts`.
- **Phân trang UI** cho `/users`: API đã có, trang web thì chưa dùng.
- **Form chưa chạy khi tắt JavaScript.** Next 16 không nhúng `$ACTION_ID` cho
  form dùng `useActionState`, nên submit cần JS. Không ảnh hưởng người dùng
  bình thường.
