import type { ReactNode } from 'react';
import { useSession } from '../lib/session';
import { getDesktop } from '../lib/desktop';
import { navigate } from '../lib/router';
import { texts } from '../texts';
import { AccessBadge, Button } from './ui';

export function AppHeader({ title, left, nav, right }: { title?: ReactNode; left?: ReactNode; nav?: ReactNode; right?: ReactNode }) {
  const session = useSession((s) => s.session);
  const logout = useSession((s) => s.logout);

  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-900">
      {left}
      <img src="/icon.png" alt="" className="h-7 w-7 shrink-0" />
      <div className={`min-w-0 ${nav ? '' : 'flex-1'}`}>
        <h1 className="truncate text-base font-semibold leading-tight">{title ?? texts.app.name}</h1>
      </div>
      {nav && <div className="flex min-w-0 flex-1 items-center">{nav}</div>}
      {right}
      {session && session.via === 'desktopKey' && (
        <div className="flex items-center gap-2 text-sm">
          <span className="hidden text-slate-600 sm:inline dark:text-slate-300">{session.name}</span>
          <AccessBadge access={session.access} />
        </div>
      )}
      {session && session.via === 'browser' && (
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

/** Umschalter Projekte / Bibliothek (nur im Browser; am Desktop gibt es eigene Fenster). */
export function MainNav({ active }: { active: 'projects' | 'library' | 'settings' }) {
  const session = useSession((s) => s.session);
  const mode = useSession((s) => s.mode);
  if (getDesktop()) return null;
  const showSettings = mode === 'standalone' && !!session && session.access !== 'read';
  const item = (key: 'projects' | 'library' | 'settings', href: string, label: string) => (
    <a
      href={href}
      aria-current={active === key ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault();
        navigate(href);
      }}
      className={`rounded-md px-2 py-1 text-sm ${active === key ? 'bg-slate-200 font-semibold dark:bg-slate-700' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
    >
      {label}
    </a>
  );
  return (
    <nav className="flex gap-1 sm:ml-4" aria-label="Hauptnavigation">
      {item('projects', '/', texts.nav.projects)}
      {item('library', '/bibliothek', texts.nav.library)}
      {showSettings && item('settings', '/einstellungen', texts.nav.settings)}
    </nav>
  );
}
