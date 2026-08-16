'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Menu, Heart, MapPin, LogOut, Check, ChevronDown } from 'lucide-react';
import {
  ALL_CITIES,
  ALL_CITIES_LABEL,
  useSelectedCity,
  VN_CITIES,
} from '@/lib/use-selected-city';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { NotificationBell } from '@/components/shared/notification-bell';
import { useCurrentUser, notifyAuthChanged } from '@/lib/use-current-user';
import { useConfirm } from '@/components/ui/confirm';
import { logout } from '@/lib/data/auth';
import { clearActiveView } from '@/lib/active-view';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { isApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils';

type Role = 'CUSTOMER' | 'OWNER' | 'STAFF' | 'ADMIN' | 'SUPER_ADMIN';

interface NavItem {
  href: string;
  label: string;
  authOnly?: boolean;
  /** Render khi user chưa login HOẶC role trong list. Nếu không set → mọi role. */
  showForRoles?: Role[];
  /** Render khi user chưa login HOẶC role KHÔNG trong list. */
  hideForRoles?: Role[];
}

const NAV: NavItem[] = [
  { href: '/venues', label: 'Khám phá' },
  { href: '/vouchers', label: 'Voucher' },
  { href: '/account/bookings', label: 'Booking của tôi', authOnly: true },
  // Customer (hoặc chưa login) → mời đăng ký làm chủ sân.
  { href: '/account/become-owner', label: 'Trở thành chủ sân', showForRoles: ['CUSTOMER'] },
  // OWNER/ADMIN → link thẳng tới dashboard quản lý.
  {
    href: '/owner',
    label: 'Quản lý sân',
    showForRoles: ['OWNER', 'ADMIN', 'SUPER_ADMIN'],
  },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const confirm = useConfirm();
  const user = useCurrentUser();
  const isLoggedIn = !!user;
  const isLoading = user === undefined;

  async function handleLogout() {
    const ok = await confirm({
      title: 'Đăng xuất khỏi tài khoản?',
      tone: 'warning',
      confirmText: 'Đăng xuất',
      cancelText: 'Ở lại',
    });
    if (!ok) return;
    try {
      await logout();
    } catch (e) {
      toast.error(isApiError(e) ? e.message : 'Đăng xuất thất bại');
      return;
    }
    notifyAuthChanged();
    // Clear active view cookie để lần login sau show lại dialog chọn vai trò.
    clearActiveView();
    toast.success('Đã đăng xuất');
    router.push('/');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-primary to-emerald-700 text-white shadow-sm">
            <span className="text-base">🏟️</span>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-base font-bold tracking-tight">SportsBooking</span>
            <span className="hidden text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:block">
              Đặt sân nhanh — Chơi liền tay
            </span>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.filter((item) => {
            if (item.authOnly && !isLoggedIn) return false;
            const role = user?.role as Role | undefined;
            if (item.showForRoles) {
              // Chưa login: dùng default 'CUSTOMER' để hiện link "Trở thành chủ sân"
              const effectiveRole = role ?? 'CUSTOMER';
              if (!item.showForRoles.includes(effectiveRole)) return false;
            }
            if (item.hideForRoles && role && item.hideForRoles.includes(role)) {
              return false;
            }
            return true;
          }).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                pathname?.startsWith(item.href) && 'bg-muted text-foreground',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {/* Icon Heart + Bell chỉ hiện khi đã login */}
          {isLoggedIn && (
            <>
              <Button variant="ghost" size="icon" className="hidden md:inline-flex" asChild>
                <Link href="/account/favorites">
                  <Heart className="h-4 w-4" />
                </Link>
              </Button>
              <NotificationBell className="hidden md:inline-flex" />
            </>
          )}

          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="h-5 w-5" />
          </Button>

          {/* Auth area */}
          {isLoading ? (
            <div className="hidden h-9 w-32 animate-pulse rounded-md bg-muted md:block" />
          ) : isLoggedIn ? (
            <div className="hidden items-center gap-2 md:flex">
              <Link
                href="/account/profile"
                className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">
                    {user.fullName[0]?.toUpperCase() ?? 'U'}
                  </AvatarFallback>
                </Avatar>
                <span className="max-w-[120px] truncate text-sm font-medium">
                  {user.fullName}
                </span>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                title="Đăng xuất"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <Button asChild variant="outline" size="sm" className="hidden md:inline-flex">
                <Link href="/login">Đăng nhập</Link>
              </Button>
              <Button asChild size="sm" className="hidden md:inline-flex">
                <Link href="/register">Đăng ký</Link>
              </Button>
            </>
          )}

          {/* Mobile avatar — vẫn hiện cho cả 2 state, link đổi tuỳ login */}
          <Link href={isLoggedIn ? '/account/profile' : '/login'} className="md:hidden">
            <Avatar className="h-9 w-9">
              <AvatarFallback>
                {isLoggedIn ? user.fullName[0]?.toUpperCase() ?? 'U' : '?'}
              </AvatarFallback>
            </Avatar>
          </Link>
        </div>
      </div>

      <div className="container hidden items-center gap-2 pb-3 text-xs text-muted-foreground md:flex">
        <MapPin className="h-3.5 w-3.5" />
        <span>Đang xem sân tại</span>
        <CityPicker />
      </div>
    </header>
  );
}

function CityPicker() {
  const [city, setCity] = useSelectedCity();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);

  // Click outside → close
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function pick(next: string) {
    setCity(next);
    setOpen(false);
    // Điều hướng đến /venues với filter city (venues page sẽ đọc qua useSelectedCity)
    router.push('/venues');
  }

  const displayLabel = city === ALL_CITIES ? ALL_CITIES_LABEL : city;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary"
      >
        {displayLabel}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute left-0 top-6 z-50 max-h-[60vh] w-56 overflow-y-auto rounded-md border bg-popover py-1 shadow-lg">
          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Chọn khu vực
          </p>
          <button
            type="button"
            onClick={() => pick(ALL_CITIES)}
            className={cn(
              'flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
              city === ALL_CITIES && 'bg-primary/5 text-primary',
            )}
          >
            {ALL_CITIES_LABEL}
            {city === ALL_CITIES && <Check className="h-3.5 w-3.5" />}
          </button>
          {VN_CITIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => pick(c)}
              className={cn(
                'flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
                c === city && 'bg-primary/5 text-primary',
              )}
            >
              {c}
              {c === city && <Check className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
