import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { logoutAction } from "@/app/(auth)/actions";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="site-header">
      <nav className="site-header__inner">
        <Link href="/" className="site-header__brand">
          nextjs-prisma-base
        </Link>

        <div className="site-header__actions">
          {user ? (
            <>
              {user.role === "ADMIN" && <Link href="/users">Người dùng</Link>}
              <span className="site-header__user">{user.email}</span>
              <form action={logoutAction}>
                <button type="submit" className="btn btn-ghost">
                  Đăng xuất
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login">Đăng nhập</Link>
              <Link href="/register" className="btn btn-primary btn-sm">
                Đăng ký
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
