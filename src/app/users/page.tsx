import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { userService } from "@/services/user.service";
import { UserForm } from "./user-form";
import { UserDeleteButton } from "./user-delete-button";

export const metadata: Metadata = { title: "Quản lý người dùng" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  // Lớp bảo vệ ở tầng trang. Server Action còn tự kiểm tra lại một lần nữa —
  // xem `actions.ts` để biết vì sao không thể chỉ dựa vào chỗ này.
  const currentUser = await requireAdmin("/users");

  const [users, total] = await Promise.all([userService.list(), userService.count()]);

  return (
    <main className="container">
      <div
        style={{
          marginBottom: 24,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <Link href="/" style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
            ← Quay lại trang chủ
          </Link>
          <h1 style={{ fontSize: "2rem", fontWeight: 800, marginTop: 4 }}>Quản lý người dùng</h1>
        </div>
        <span className="badge badge-primary">Tổng: {total}</span>
      </div>

      <section className="card">
        <h2 style={{ fontSize: "1.2rem", marginBottom: 16 }}>Thêm người dùng mới</h2>
        <UserForm />
      </section>

      <section className="card">
        <h2 style={{ fontSize: "1.2rem", marginBottom: 16 }}>Danh sách người dùng</h2>

        {users.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-muted)" }}>
            <p style={{ fontSize: "1.1rem" }}>Chưa có người dùng nào trong cơ sở dữ liệu.</p>
          </div>
        ) : (
          <ul className="user-list">
            {users.map((user) => (
              <li key={user.id} className="user-item">
                <div className="user-info">
                  <span className="user-email">{user.email}</span>
                  <div className="user-meta">
                    {user.name && <span>👤 {user.name}</span>}
                    <span className="badge badge-success">{user.role}</span>
                    <span>📅 {user.createdAt.toLocaleDateString("vi-VN")}</span>
                  </div>
                </div>
                {user.id === currentUser.id ? (
                  <span className="badge badge-primary">Bạn</span>
                ) : (
                  <UserDeleteButton id={user.id} email={user.email} />
                )}
              </li>
            ))}
          </ul>
        )}

        {total > users.length && (
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: 16 }}>
            Đang hiển thị {users.length}/{total} người dùng. Thêm phân trang khi cần xem hết.
          </p>
        )}
      </section>
    </main>
  );
}
