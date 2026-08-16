// import Link from 'next/link';
// import { Mic2 } from 'lucide-react';
// import { cn } from '@/lib/utils';

// interface LogoProps {
//   className?: string;
//   size?: 'sm' | 'md' | 'lg';
//   showText?: boolean;
// }

// export function Logo({ className, size = 'md', showText = true }: LogoProps) {
//   const sizes = {
//     sm: { icon: 'h-6 w-6', text: 'text-lg' },
//     md: { icon: 'h-8 w-8', text: 'text-xl' },
//     lg: { icon: 'h-10 w-10', text: 'text-2xl' },
//   };
//   return (
//     <Link href="/home" className={cn('flex items-center gap-2 group', className)}>
//       <div className="rounded-xl gradient-primary p-2 shadow-lg shadow-primary/30 transition-transform group-hover:scale-110">
//         <Mic2 className={cn('text-white', sizes[size].icon)} />
//       </div>
//       {showText && (
//         <span className={cn('font-bold text-gradient', sizes[size].text)}>SingNow</span>
//       )}
//     </Link>
//   );
// }
