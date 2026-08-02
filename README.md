# Next.js 16 + Prisma Standalone Application (`nextjs_prisma_base`)

Dự án **Next.js 16 (App Router)** + **Prisma ORM** + **Services Layer** dạng **Single App (Phẳng - Tối giản)** được tối ưu hóa cho trải nghiệm làm Web mượt mà, siêu tốc độ với **Server Components**, **Server Actions** & **Turbopack**.

```
nextjs_prisma_base/
├── prisma/
│   ├── schema.prisma       # Prisma Database schema
│   └── seed.ts             # Seed script tạo dữ liệu mẫu
├── src/
│   ├── app/                # Next.js App Router (Pages, Layout, CSS, Server Actions)
│   ├── services/           # Business Logic Services (UserService, AuthService)
│   ├── schemas/            # Zod validation schemas (user.schema.ts, auth.schema.ts)
│   └── lib/
│       ├── prisma.ts       # Singleton Prisma Client (chống trào connection pool khi dev HMR)
│       └── crypto.ts       # Password hashing & bcrypt utilities
├── package.json            # 1 file package.json duy nhất ở root
├── docker-compose.yml      # Cấu hình Docker cho Postgres & Next.js
├── Dockerfile              # Docker build cho bản sản xuất Next.js
└── README.md
```

---

## 📱 Hướng dẫn Mở rộng sang Mobile App (Khi cần sau này)

Khi dự án mở rộng thêm ứng dụng Mobile (Flutter / React Native / iOS / Android), bạn **KHÔNG CẦN VIẾT LẠI CODE CŨ**. 

### 💡 Quy trình 3 bước thêm REST API cho Mobile:

#### Bước 1: Tạo thư mục Route Handler trong `src/app/api/`
Ví dụ muốn làm API lấy danh sách người dùng cho Mobile, tạo file `src/app/api/users/route.ts`.

#### Bước 2: Gọi lại đúng Service đã viết sẵn trong `src/services/`
Dùng lại `userService` mà không cần viết lại câu lệnh Prisma Query nào.

#### Bước 3: Trả về dữ liệu dạng JSON (`NextResponse.json`)

---

### 📝 Mã mẫu tạo REST API cho Mobile (Copy & Dùng):

#### 1. API Lấy danh sách người dùng (`src/app/api/users/route.ts`)
```typescript
import { NextResponse } from "next/server";
import { userService } from "@/services/user.service";

export async function GET() {
  const users = await userService.list(); // 👈 Dùng lại Service sẵn có!
  return NextResponse.json({ success: true, data: users });
}
```

#### 2. API Đăng nhập cho Mobile (`src/app/api/auth/login/route.ts`)
```typescript
import { NextResponse } from "next/server";
import { authService, InvalidCredentialsError } from "@/services/auth.service";
import { loginSchema } from "@/schemas/auth.schema";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ success: false, errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const user = await authService.validateUser(parsed.data);
    return NextResponse.json({ success: true, user });
  } catch (err) {
    if (err instanceof InvalidCredentialsError) {
      return NextResponse.json({ success: false, message: err.message }, { status: 401 });
    }
    return NextResponse.json({ success: false, message: "Lỗi máy chủ" }, { status: 500 });
  }
}
```

---

## ⚡ Các lệnh Thực thi Chính (`package.json`)

```bash
pnpm dev          # ⚡ Chạy Dev mode với Turbopack HMR siêu tốc
pnpm build        # 📦 Biên dịch bản sản xuất (Production build)
pnpm start        # 🚀 Khởi chạy máy chủ sản xuất
pnpm typecheck    # 🔍 Kiểm tra lỗi TypeScript
pnpm lint         # 🧹 Kiểm tra ESLint
pnpm test         # 🧪 Chạy Vitest unit tests cho các services
pnpm db:migrate   # 🗄️ Chạy Prisma Migration cập nhật DB
pnpm db:generate  # 🔄 Sinh Prisma Client mới nhất
pnpm db:seed      # 🌱 Nạp dữ liệu mẫu
```

---

## 🛠 Hướng dẫn Khởi chạy Lần đầu

1. **Cài đặt dependencies**:
   ```bash
   pnpm install
   ```

2. **Cấu hình Môi trường**:
   ```bash
   cp .env.example .env
   # Điền DATABASE_URL của PostgreSQL trong file .env
   ```

3. **Khởi tạo Database**:
   ```bash
   pnpm db:migrate
   ```

4. **Khởi chạy máy chủ Dev**:
   ```bash
   pnpm dev
   ```
   Mở trình duyệt tại [http://localhost:3000](http://localhost:3000).
