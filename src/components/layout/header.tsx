import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { apiPath } from "@/lib/api/version";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { permissionService } from "@/services/permission.service";

/**
 * Thanh điều hướng.
 *
 * Dùng token màu của dự án (`surface`, `line`, `muted`) thay cho cặp nền-trắng
 * kèm biến thể `dark:` như trước. Nhánh `dark:` đó không bao giờ được kích hoạt
 * — không chỗ nào đặt class `dark` lên `<html>` — nên header hiện màu trắng đè
 * lên nền tối của toàn trang.
 */
export async function Header() {
  const user = await getCurrentUser();

  // Chỉ hiện mục quản trị cho người thật sự vào được. Link dẫn tới trang 404
  // không phải "bảo mật kém" (trang vẫn tự kiểm quyền), nhưng là giao diện tệ:
  // người dùng bấm vào thứ trông như dùng được rồi nhận trang không tìm thấy.
  const [canSeeUsers, canSeeRoles] = user
    ? await Promise.all([
        permissionService.can(user.role, "user:read"),
        permissionService.can(user.role, "role:read"),
      ])
    : [false, false];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Logo />

          <nav className="hidden items-center gap-1 md:flex">
            <NavLink href="/">Trang chủ</NavLink>
            {canSeeUsers && <NavLink href="/users">Người dùng</NavLink>}
            {canSeeRoles && <NavLink href="/roles">Vai trò</NavLink>}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="hidden text-sm text-muted sm:inline">
                {user.fullName ?? user.email}
              </span>
              <form action={apiPath("/auth/logout")} method="POST">
                <Button size="sm" variant="outline" type="submit">
                  Đăng xuất
                </Button>
              </form>
            </>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost">
                <Link href="/login">Đăng nhập</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">Đăng ký</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function NavLink({
  href,
  children,
}: {
  href: "/" | "/users" | "/roles";
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-token-md px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-elevated hover:text-content"
    >
      {children}
    </Link>
  );
}
