import Link from "next/link";
import { userService } from "@/services/user.service";
import { UserForm } from "./user-form";
import { UserDeleteButton } from "./user-delete-button";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const users = await userService.list();

  return (
    <main className="container">
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <Link href="/" style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
            ← Quay lại trang chủ
          </Link>
          <h1 style={{ fontSize: "2rem", fontWeight: 800, marginTop: 4 }}>
            Quản lý Người dùng (Users Management)
          </h1>
        </div>
        <span className="badge badge-primary">Total: {users.length}</span>
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
            <p style={{ fontSize: "0.88rem", marginTop: 4 }}>
              Hãy thêm người dùng ở form trên để trải nghiệm Server Action + Prisma.
            </p>
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
                    <span>📅 {new Date(user.createdAt).toLocaleDateString("vi-VN")}</span>
                  </div>
                </div>
                <UserDeleteButton id={user.id} email={user.email} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
