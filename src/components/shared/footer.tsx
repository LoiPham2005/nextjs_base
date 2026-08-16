import Link from 'next/link';
import { Facebook, Instagram, Youtube } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="container py-12">
        <div className="grid gap-10 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-primary to-emerald-700 text-white">
                <span>🏟️</span>
              </div>
              <span className="text-base font-bold">SportsBooking</span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Nền tảng đặt sân thể thao #1 Việt Nam. Hơn 600 sân, 50.000 booking thành công.
            </p>
            <div className="mt-4 flex gap-2">
              <a className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" href="#">
                <Facebook className="h-4 w-4" />
              </a>
              <a className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" href="#">
                <Instagram className="h-4 w-4" />
              </a>
              <a className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" href="#">
                <Youtube className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold">Khám phá</h4>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><Link href="/venues?sport=football_5" className="hover:text-foreground">Bóng đá</Link></li>
              <li><Link href="/venues?sport=badminton" className="hover:text-foreground">Cầu lông</Link></li>
              <li><Link href="/venues?sport=tennis" className="hover:text-foreground">Tennis</Link></li>
              <li><Link href="/venues?sport=pickleball" className="hover:text-foreground">Pickleball</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold">Hỗ trợ</h4>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><Link href="/help" className="hover:text-foreground">Trung tâm hỗ trợ</Link></li>
              <li><Link href="/policies/cancellation" className="hover:text-foreground">Chính sách huỷ</Link></li>
              <li><Link href="/policies/terms" className="hover:text-foreground">Điều khoản sử dụng</Link></li>
              <li><Link href="/policies/privacy" className="hover:text-foreground">Bảo mật</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold">Đối tác</h4>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><Link href="/owner" className="hover:text-foreground">Trở thành chủ sân</Link></li>
              <li><Link href="/contact" className="hover:text-foreground">Liên hệ kinh doanh</Link></li>
              <li><Link href="/careers" className="hover:text-foreground">Tuyển dụng</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start gap-4 border-t pt-6 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} SportsBooking. All rights reserved.</p>
          <div className="flex items-center gap-3">
            <span>Thanh toán an toàn qua</span>
            <span className="rounded bg-background px-2 py-1 font-medium text-foreground shadow-sm">VNPay</span>
            <span className="rounded bg-background px-2 py-1 font-medium text-foreground shadow-sm">MoMo</span>
            <span className="rounded bg-background px-2 py-1 font-medium text-foreground shadow-sm">ZaloPay</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
