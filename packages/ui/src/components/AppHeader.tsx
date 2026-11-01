import type { ReactNode } from 'react';
import { useSession } from '../lib/session';
import { navigate } from '../lib/router';
import { texts } from '../texts';
import { AccessBadge, Button } from './ui';

export function AppHeader({ title, left, right }: { title?: ReactNode; left?: ReactNode; right?: ReactNode }) {
  const session = useSession((s) => s.session);
  const logout = useSession((s) => s.logout);

  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-900">
      {left}
      <img src="/icon.svg" alt="" className="h-7 w-7 shrink-0" />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold leading-tight">{title ?? texts.app.name}</h1>
      </div>
      {right}
      {session && session.via !== 'desktop' && (
        <div className="flex items-center gap-2 text-sm">
          <span className="hidden text-slate-600 sm:inline dark:text-slate-300">{session.name}</span>
          <AccessBadge access={session.access} />
          <Button
            variant="ghost"
            onClick={async () => {
              await logout();
              navigate('/anmelden', { replace: true });
            }}
          >
            {texts.session.logout}
          </Button>
        </div>
      )}
    </header>
  );
}
