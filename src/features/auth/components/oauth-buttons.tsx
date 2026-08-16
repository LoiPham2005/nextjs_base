'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';

interface OAuthButtonsProps {
  providers?: Array<{
    id: 'google' | 'github' | 'facebook' | 'apple';
    name: string;
    icon?: string;
  }>;
}

export function OAuthButtons({
  providers = [
    { id: 'google', name: 'Google' },
    { id: 'github', name: 'GitHub' },
  ],
}: OAuthButtonsProps) {
  const [isPending, startTransition] = useTransition();

  const handleOAuthLogin = (provider: string) => {
    startTransition(() => {
      window.location.href = `/api/auth/oauth/${provider}`;
    });
  };

  return (
    <div className="flex flex-col gap-2.5 w-full">
      {providers.map((p) => (
        <Button
          key={p.id}
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => handleOAuthLogin(p.id)}
          className="w-full flex items-center justify-center gap-2"
        >
          <span>Tiếp tục với {p.name}</span>
        </Button>
      ))}
    </div>
  );
}
