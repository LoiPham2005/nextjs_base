// 'use client';

// import Link from 'next/link';
// import { useRouter } from 'next/navigation';
// import { Search, Bell, ChevronLeft, ChevronRight } from 'lucide-react';
// import { Button } from '@/components/ui/button';
// import { Input } from '@/components/ui/input';
// import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
// import { currentUser } from '@/mocks/users';

// export function Topbar() {
//   const router = useRouter();
//   return (
//     <header className="sticky top-0 z-30 glass border-b border-border">
//       <div className="flex items-center gap-4 px-6 h-16">
//         <div className="hidden lg:flex items-center gap-2">
//           <Button size="icon-sm" variant="ghost" onClick={() => router.back()}>
//             <ChevronLeft className="h-4 w-4" />
//           </Button>
//           <Button size="icon-sm" variant="ghost" onClick={() => router.forward()}>
//             <ChevronRight className="h-4 w-4" />
//           </Button>
//         </div>

//         <div className="relative flex-1 max-w-2xl">
//           <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
//           <Input
//             placeholder="Tìm bài hát, ca sĩ, playlist..."
//             className="pl-10 h-10"
//             onFocus={() => router.push('/search')}
//           />
//         </div>

//         <div className="flex items-center gap-2">
//           <Button size="icon" variant="ghost">
//             <Bell className="h-5 w-5" />
//           </Button>
//           <Link href="/profile">
//             <Avatar className="h-9 w-9 ring-2 ring-border hover:ring-primary transition-all">
//               <AvatarImage src={currentUser.avatarUrl} alt={currentUser.displayName} />
//               <AvatarFallback>{currentUser.displayName[0]}</AvatarFallback>
//             </Avatar>
//           </Link>
//         </div>
//       </div>
//     </header>
//   );
// }
