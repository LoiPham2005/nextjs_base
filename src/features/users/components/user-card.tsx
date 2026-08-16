import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

interface UserCardProps {
  user: {
    id: string;
    email: string;
    fullName?: string | null;
    username?: string | null;
    roleKey?: string | null;
    isActive?: boolean;
    avatarUrl?: string | null;
  };
  actions?: React.ReactNode;
}

export function UserCard({ user, actions }: UserCardProps) {
  const initial = user.fullName?.[0] || user.email[0]?.toUpperCase() || 'U';

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <Avatar className="h-11 w-11">
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.fullName || user.email} />}
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                {user.fullName || user.email}
              </span>
              {user.roleKey && (
                <Badge variant={user.roleKey === 'ADMIN' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                  {user.roleKey}
                </Badge>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {user.email}
            </p>
          </div>
        </div>

        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </CardContent>
    </Card>
  );
}
