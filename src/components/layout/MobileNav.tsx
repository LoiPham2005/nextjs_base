// 'use client';

// import Link from 'next/link';
// import { usePathname } from 'next/navigation';
// import { Home, Search, Library, User } from 'lucide-react';
// import { cn } from '@/lib/utils';

// const items = [
//   { href: '/home', label: 'Trang chủ', icon: Home },
//   { href: '/search', label: 'Tìm', icon: Search },
//   { href: '/library', label: 'Thư viện', icon: Library },
//   { href: '/profile', label: 'Tôi', icon: User },
// ];

// export function MobileNav() {
//   const pathname = usePathname();
//   return (
//     <nav className="lg:hidden fixed bottom-20 left-0 right-0 z-30 glass border-t border-border">
//       <div className="flex">
//         {items.map((item) => {
//           const active = pathname === item.href;
//           return (
//             <Link
//               key={item.href}
//               href={item.href}
//               className={cn(
//                 'flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors',
//                 active ? 'text-primary' : 'text-muted-foreground',
//               )}
//             >
//               <item.icon className="h-5 w-5" />
//               {item.label}
//             </Link>
//           );
//         })}
//       </div>
//     </nav>
//   );
// }
