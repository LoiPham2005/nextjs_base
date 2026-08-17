import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { userService } from "@/services/user.service";
import { UserForm } from "./user-form";
import { UserDeleteButton } from "./user-delete-button";
import { UserStatusButton } from "./user-status-button";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Quản lý người dùng" };
export const dynamic = "force-dynamic";

/**
 * Số dòng mỗi trang.
 *
 * 20 chứ không phải 50: danh sách này có nút Khoá và Xoá ở mỗi dòng, và trang
 * càng dài thì càng dễ bấm nhầm dòng bên cạnh.
 */
const PER_PAGE = 20;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  // Lớp bảo vệ ở tầng trang. Server Action còn tự kiểm tra lại một lần nữa —
  // xem `actions.ts` để biết vì sao không thể chỉ dựa vào chỗ này.
  const currentUser = await requirePermission("user:read", "/users");

  const { cursor } = await searchParams;

  const [{ users, nextCursor }, total] = await Promise.all([
    userService.list({ cursor, take: PER_PAGE }),
    userService.count(),
  ]);

  return (
    <>
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
          <h1 className="page-title">Quản lý người dùng</h1>
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
                    {user.fullName && <span>👤 {user.fullName}</span>}
                    {user.username && <span>@{user.username}</span>}
                    <span className="badge badge-success">{user.roleName}</span>
                    {user.status === "BANNED" && (
                      <span className="badge badge-danger">Đã khoá</span>
                    )}
                    {user.status === "ACTIVE" &&
                      user.lockedUntil &&
                      user.lockedUntil > new Date() && (
                        <span className="badge badge-warning">Khoá tạm (sai mật khẩu)</span>
                      )}
                    <span>📅 {user.createdAt.toLocaleDateString("vi-VN")}</span>
                  </div>
                </div>
                {user.id === currentUser.id ? (
                  <span className="badge badge-primary">Bạn</span>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <UserStatusButton
                      id={user.id}
                      email={user.email}
                      status={user.status}
                      lockedUntil={user.lockedUntil?.toISOString() ?? null}
                    />
                    <UserDeleteButton id={user.id} email={user.email} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {/*
          Phân trang kiểu CURSOR, không phải offset.
          `OFFSET 10000` buộc Postgres đọc rồi vứt đi 10000 dòng ở mỗi lần lật
          trang. Tệ hơn: danh sách này đang được sửa liên tục (thêm, khoá, xoá),
          mà offset thì lệch ngay khi có dòng chèn vào giữa — người dùng lật
          trang và thấy một bản ghi hai lần, hoặc bỏ sót một bản ghi.

          Đổi lại, cursor không cho "Trang trước" miễn phí. Không sao: mỗi
          trang là một URL riêng, nên nút Back của trình duyệt chính là "trang
          trước" — hoạt động đúng, không cần code gì thêm.
        */}
        {(cursor || nextCursor) && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              marginTop: 20,
              paddingTop: 16,
              borderTop: "1px solid var(--border-color)",
            }}
          >
            <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              {users.length} / {total} người dùng
            </span>

            <div style={{ display: "flex", gap: 8 }}>
              {cursor && (
                <Button asChild variant="outline" size="sm">
                  <Link href="/users">← Về đầu danh sách</Link>
                </Button>
              )}
              {nextCursor && (
                <Button asChild variant="outline" size="sm">
                  <Link href={{ pathname: "/users", query: { cursor: nextCursor } }}>
                    Trang sau →
                  </Link>
                </Button>
              )}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
