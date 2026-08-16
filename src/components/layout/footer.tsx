import Link from "next/link";
import { Logo } from "@/components/layout/logo";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <Logo size="sm" />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            &copy; {currentYear} Bản quyền thuộc về hệ thống. Đã đăng ký bản quyền.
          </p>
          <div className="flex gap-6 text-xs text-gray-500 dark:text-gray-400">
            <Link href="/privacy" className="hover:underline">
              Chính sách bảo mật
            </Link>
            <Link href="/terms" className="hover:underline">
              Điều khoản sử dụng
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
