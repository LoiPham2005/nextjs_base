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
│   │   ├── api/health/        # Health check có kiểm tra database
│   │   ├── error.tsx          # Error boundary
│   │   ├── global-error.tsx   # Bắt lỗi xảy ra ngay trong root layout
│   │   ├── not-found.tsx
│   │   └── loading.tsx
│   ├── components/            # Component dùng chung (SiteHeader)
│   ├── lib/
│   │   ├── env.ts             # Validate biến môi trường bằng Zod lúc khởi động
│   │   ├── session.ts         # Ký/verify JWT (chạy được cả trong Proxy)
│   │   ├── auth.ts            # Đọc session, getCurrentUser, requireUser/requireAdmin
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

Vì vậy quyền được kiểm ở **hai lớp độc lập**:

| Lớp                          | Chặn được gì                         | Ở đâu                      |
| ---------------------------- | ------------------------------------ | -------------------------- |
| Proxy                        | Người chưa đăng nhập vào trang       | `src/proxy.ts`             |
| Trang (`requireAdmin`)       | Người đăng nhập nhưng không đủ quyền | `src/app/users/page.tsx`   |
| **Server Action (bắt buộc)** | Request gửi thẳng tới action         | `src/app/users/actions.ts` |

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

## Docker

```bash
docker compose up -d          # postgres → migrate (1 lần) → web
docker compose logs -f web
```

`web` chỉ khởi động sau khi service `migrate` chạy xong, nên schema luôn được
áp trước request đầu tiên. Image runtime chạy bằng user không phải root và có
`HEALTHCHECK` gọi `/api/health`.

Cần `.env` có `SESSION_SECRET` — không có thì container dừng ngay kèm thông báo
rõ ràng, đó là chủ ý.

---

## Thêm REST API cho mobile

Tầng service dùng lại được nguyên vẹn; route handler chỉ là lớp vỏ HTTP.

```ts
// src/app/api/users/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userService } from "@/services/user.service";

export async function GET() {
  // Route handler cũng là endpoint công khai — kiểm quyền y như Server Action.
  const session = await getSession();
  if (session?.role !== "ADMIN") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  return NextResponse.json({ data: await userService.list() });
}
```

Với client mobile không dùng cookie, cấp token bằng `signSession()` trong
`src/lib/session.ts` và đọc nó từ header `Authorization` thay vì cookie.

---

## Việc còn để ngỏ

- **Prisma 7** đã phát hành (repo đang dùng 6.19). Bản 7 đổi generator và cần
  driver adapter — nên làm thành một PR riêng để review kỹ, không gộp vào đây.
- **Rate limit dùng Redis** khi chạy nhiều hơn một instance.
- **Error tracking** (Sentry/OpenTelemetry): điểm nối đã có sẵn trong
  `src/app/error.tsx` và `src/lib/logger.ts`.
- **Phân trang** cho `/users`: service đã nhận `skip`/`take`, UI thì chưa dùng.
- **Form chưa chạy khi tắt JavaScript.** Next 16 không nhúng `$ACTION_ID` cho
  form dùng `useActionState`, nên submit cần JS. Không ảnh hưởng người dùng
  bình thường.
