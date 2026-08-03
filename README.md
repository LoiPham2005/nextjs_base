# nextjs_base — Next.js 16 + Prisma

Bộ khung Next.js 16 (App Router) + Prisma + PostgreSQL cho ứng dụng web có đăng
nhập, đã siết bảo mật và có sẵn đường mở REST API cho mobile.

**Ngăn xếp:** Next.js 16 · React 19 · TypeScript (strict) · Prisma 6 · Zod 4 ·
jose (JWT session) · Tailwind CSS 4 · Vitest 4 · pnpm 10 · Docker

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
├── prisma/
│   ├── schema.prisma          # Schema database
│   ├── migrations/            # Migration đã commit — bắt buộc để deploy
│   └── seeds/                 # seed-prod (dữ liệu nền) & seed-dev (dữ liệu mẫu)
├── src/
│   ├── proxy.ts               # CSP + chặn route chưa đăng nhập (Next 16 gọi là Proxy)
│   ├── app/
│   │   ├── (auth)/            # Trang login/register + Server Action xác thực
│   │   ├── users/             # CRUD người dùng (chỉ ADMIN)
│   │   ├── api/               # REST API cho mobile — xem mục riêng bên dưới
│   │   │   ├── auth/          # register, login, refresh, logout, me
│   │   │   ├── users/         # CRUD qua JSON
│   │   │   └── health/        # Health check có kiểm tra database
│   │   ├── error.tsx          # Error boundary
│   │   ├── global-error.tsx   # Bắt lỗi xảy ra ngay trong root layout
│   │   ├── not-found.tsx
│   │   └── loading.tsx
│   ├── components/            # Component dùng chung (SiteHeader)
│   ├── lib/
│   │   ├── env.ts             # Validate biến môi trường bằng Zod lúc khởi động
│   │   ├── session.ts         # Ký/verify JWT — không dính cookie, dùng chung web+mobile
│   │   ├── auth.ts            # Bản cho web: đọc cookie, requireUser/requireAdmin
│   │   ├── api/               # Bản cho REST API: Bearer token, envelope JSON, map lỗi
│   │   ├── prisma.ts          # Prisma Client singleton (an toàn với HMR)
│   │   ├── crypto.ts          # bcrypt + so sánh giả chống dò qua thời gian
│   │   ├── rate-limit.ts      # Giới hạn tần suất đăng nhập
│   │   └── logger.ts          # Log JSON một dòng, tự che trường nhạy cảm
│   ├── schemas/               # Zod schema (nguồn sự thật cho validation)
│   └── services/              # Tầng nghiệp vụ — nơi duy nhất gọi Prisma
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

| Lớp                           | Chặn được gì                         | Ở đâu                      |
| ----------------------------- | ------------------------------------ | -------------------------- |
| Proxy (chỉ trang, KHÔNG /api) | Người chưa đăng nhập vào trang       | `src/proxy.ts`             |
| Trang (`requireAdmin`)        | Người đăng nhập nhưng không đủ quyền | `src/app/users/page.tsx`   |
| **Server Action (bắt buộc)**  | Request gửi thẳng tới action         | `src/app/users/actions.ts` |
| **Route handler (bắt buộc)**  | Mọi request tới REST API             | `src/app/api/**`           |

Thêm action mới thì **luôn** tự kiểm quyền trong action đó. Ràng buộc này được
khoá bằng test trong `src/app/users/actions.test.ts`.

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
docker compose up -d          # postgres → migrate (1 lần) → web
docker compose logs -f web
```

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

| Method   | Đường dẫn            | Quyền                 |
| -------- | -------------------- | --------------------- |
| `POST`   | `/api/auth/register` | công khai             |
| `POST`   | `/api/auth/login`    | công khai             |
| `POST`   | `/api/auth/refresh`  | refresh token         |
| `POST`   | `/api/auth/logout`   | đã đăng nhập          |
| `GET`    | `/api/auth/me`       | đã đăng nhập          |
| `GET`    | `/api/users`         | ADMIN                 |
| `POST`   | `/api/users`         | ADMIN                 |
| `GET`    | `/api/users/{id}`    | ADMIN hoặc chính mình |
| `DELETE` | `/api/users/{id}`    | ADMIN                 |
| `GET`    | `/api/health`        | công khai             |

### Định dạng response

Thành công `{ "data": ... }`, thất bại `{ "error": { "code", "message", "fields"? } }`.

Client nên switch-case theo **`code`**, không theo `message` — message là lời
văn hiển thị cho người dùng và có thể đổi bất cứ lúc nào.

`VALIDATION_ERROR` (422) · `UNAUTHENTICATED` (401) · `FORBIDDEN` (403) ·
`NOT_FOUND` (404) · `CONFLICT` (409) · `RATE_LIMITED` (429) · `INTERNAL_ERROR` (500)

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
gặp 401 thì gọi `/api/auth/refresh` rồi thử lại request. **Không cần CORS** vì
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

- **Prisma 7** đã phát hành (repo đang dùng 6.19). Bản 7 đổi generator và cần
  driver adapter — nên làm thành một PR riêng để review kỹ, không gộp vào đây.
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
