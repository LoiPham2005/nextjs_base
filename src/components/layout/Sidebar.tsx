// 'use client';

// import Link from 'next/link';
// import { usePathname } from 'next/navigation';
// import {
//   Home,
//   Search,
//   Library,
//   ListMusic,
//   Heart,
//   History,
//   Plus,
//   Sparkles,
//   TrendingUp,
//   User,
//   Settings,
// } from 'lucide-react';
// import { Logo } from '@/components/common/Logo';
// import { cn } from '@/lib/utils';
// import { ScrollArea } from '@/components/ui/scroll-area';
// import { mockPlaylists } from '@/mocks/playlists';
// import { Button } from '@/components/ui/button';

// const mainNav = [
//   { href: '/home', label: 'Trang chủ', icon: Home },
//   { href: '/search', label: 'Tìm kiếm', icon: Search },
//   { href: '/library', label: 'Thư viện', icon: Library },
// ];

// const libraryNav = [
//   { href: '/library?tab=playlists', label: 'Playlist', icon: ListMusic },
//   { href: '/library?tab=favorites', label: 'Yêu thích', icon: Heart },
//   { href: '/library?tab=history', label: 'Lịch sử', icon: History },
// ];

// const discoverNav = [
//   { href: '/home#trending', label: 'Trending', icon: TrendingUp },
//   { href: '/home#new', label: 'Mới ra', icon: Sparkles },
// ];

// export function Sidebar() {
//   const pathname = usePathname();

//   return (
//     <aside className="hidden lg:flex flex-col w-64 h-screen sticky top-0 border-r border-border bg-background">
//       <div className="p-6">
//         <Logo />
//       </div>

//       <ScrollArea className="flex-1 px-3">
//         <nav className="space-y-1">
//           {mainNav.map((item) => {
//             const active = pathname === item.href;
//             return (
//               <Link
//                 key={item.href}
//                 href={item.href}
//                 className={cn(
//                   'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
//                   active
//                     ? 'bg-primary/10 text-primary'
//                     : 'text-muted-foreground hover:bg-accent hover:text-foreground',
//                 )}
//               >
//                 <item.icon className="h-5 w-5" />
//                 {item.label}
//               </Link>
//             );
//           })}
//         </nav>

//         <div className="mt-6">
//           <h3 className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
//             Khám phá
//           </h3>
//           <nav className="space-y-1">
//             {discoverNav.map((item) => (
//               <Link
//                 key={item.href}
//                 href={item.href}
//                 className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-all"
//               >
//                 <item.icon className="h-4 w-4" />
//                 {item.label}
//               </Link>
//             ))}
//           </nav>
//         </div>

//         <div className="mt-6">
//           <h3 className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
//             Thư viện
//           </h3>
//           <nav className="space-y-1">
//             {libraryNav.map((item) => (
//               <Link
//                 key={item.href}
//                 href={item.href}
//                 className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-all"
//               >
//                 <item.icon className="h-4 w-4" />
//                 {item.label}
//               </Link>
//             ))}
//           </nav>
//         </div>

//         <div className="mt-6">
//           <div className="flex items-center justify-between px-3 mb-2">
//             <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
//               Playlist của tôi
//             </h3>
//             <Button size="icon-sm" variant="ghost">
//               <Plus className="h-4 w-4" />
//             </Button>
//           </div>
//           <nav className="space-y-1">
//             {mockPlaylists.slice(0, 5).map((pl) => (
//               <Link
//                 key={pl.id}
//                 href={`/playlist/${pl.id}`}
//                 className="block px-3 py-2 rounded-xl text-sm text-muted-foreground hover:bg-accent hover:text-foreground truncate transition-all"
//               >
//                 {pl.name}
//               </Link>
//             ))}
//           </nav>
//         </div>
//       </ScrollArea>

//       <div className="p-3 border-t border-border">
//         <Link
//           href="/profile"
//           className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm hover:bg-accent transition-all"
//         >
//           <User className="h-5 w-5" />
//           <span>Tài khoản</span>
//         </Link>
//         <Link
//           href="/settings"
//           className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm hover:bg-accent transition-all"
//         >
//           <Settings className="h-5 w-5" />
//           <span>Cài đặt</span>
//         </Link>
//       </div>
//     </aside>
//   );
// }
