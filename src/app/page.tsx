import Link from "next/link";

export default function HomePage() {
  return (
    <main className="container">
      <header style={{ marginBottom: 48, textAlign: "center" }}>
        <span className="badge badge-primary" style={{ marginBottom: 16 }}>
          Next.js 16 + Prisma Stack
        </span>
        <h1
          style={{
            fontSize: "2.75rem",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            marginBottom: 16,
          }}
        >
          Kiến trúc Đơn giản & Tối ưu nhất
        </h1>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "1.15rem",
            maxWidth: 640,
            margin: "0 auto 24px",
          }}
        >
          Ứng dụng Next.js 16 (App Router) độc lập tích hợp Prisma ORM, Zod Schema & Clean Services
          trong cùng 1 dự án phẳng gọn gàng.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <Link href="/users" className="btn btn-primary">
            Quản lý Người dùng (Users Demo) →
          </Link>
        </div>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 20,
        }}
      >
        <div className="card">
          <div className="badge badge-success" style={{ marginBottom: 12 }}>
            Next.js App Router
          </div>
          <h3 style={{ marginBottom: 8, fontSize: "1.2rem" }}>src/app/</h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.92rem" }}>
            React 19 Server Components, Server Actions & UI Rendering với CSS variables hiện đại.
          </p>
        </div>

        <div className="card">
          <div className="badge badge-primary" style={{ marginBottom: 12 }}>
            Business Services
          </div>
          <h3 style={{ marginBottom: 8, fontSize: "1.2rem" }}>src/services/</h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.92rem" }}>
            UserService & AuthService xử lý toàn bộ logic nghiệp vụ, gọi Prisma trực tiếp và hỗ trợ
            Vitest unit tests.
          </p>
        </div>

        <div className="card">
          <div className="badge badge-primary" style={{ marginBottom: 12 }}>
            Prisma & Schemas
          </div>
          <h3 style={{ marginBottom: 8, fontSize: "1.2rem" }}>prisma/ & src/schemas/</h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.92rem" }}>
            Schema Prisma ở root, Zod validation trong `src/schemas/` và HMR-safe Prisma Client
            singleton trong `src/lib/prisma.ts`.
          </p>
        </div>
      </section>
    </main>
  );
}
