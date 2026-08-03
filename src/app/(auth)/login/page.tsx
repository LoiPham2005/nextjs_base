import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Đăng nhập" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="container" style={{ maxWidth: 440 }}>
      <div className="card">
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 4 }}>Đăng nhập</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: 24 }}>
          Nhập thông tin tài khoản của bạn để tiếp tục.
        </p>

        <LoginForm nextPath={next} />

        <p style={{ marginTop: 20, fontSize: "0.9rem", color: "var(--text-muted)" }}>
          Chưa có tài khoản? <Link href="/register">Đăng ký</Link>
        </p>
      </div>
    </main>
  );
}
