// Handy-Ansicht (bis 900 px Breite): Zeichenfläche so groß wie möglich,
// oben eine Kopfzeile mit Burgermenü, unten eine Fußzeile mit den wichtigsten Werkzeugen.
// Alles Weitere (Werkzeugleisten, Filter, Seiten) wandert ins Menü; Eigenschaften und
// Bibliothek erscheinen als unteres Blatt über der Zeichenfläche.
import { X, type LucideIcon } from 'lucide-react';
import { createContext, useContext, type ReactNode } from 'react';
import type { Issue } from '@steckplan/core';
import { createPortal } from 'react-dom';
import { useIsNarrow } from '../lib/useProjectDoc';
import { texts } from '../texts';
import { Button } from './ui';

const m = texts.mobile;

/** Bis zu dieser Breite gilt die Handy-Ansicht. */
export const PHONE_MAX_WIDTH = 900;

export function usePhone(): boolean {
  return useIsNarrow(PHONE_MAX_WIDTH);
}

/** Ziel im Burgermenü, in das die Ansichten ihre Werkzeuge und Filter legen (nur in der Handy-Ansicht gesetzt). */
const MenuSlot = createContext<HTMLElement | null | undefined>(undefined);
export const MobileMenuSlot = MenuSlot.Provider;

/** Inhalt in der Handy-Ansicht ins Burgermenü verschieben, sonst an Ort und Stelle zeigen. */
export function InMobileMenu({ title, children }: { title: string; children: ReactNode }) {
  const slot = useContext(MenuSlot);
  if (slot === undefined) return <>{children}</>;
  if (slot === null) return null;
  return createPortal(
    <section aria-label={title} className="border-t border-slate-200 py-2 dark:border-slate-700">
      <h2 className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="[&_[role=toolbar]]:border-0 [&>*]:border-b-0">{children}</div>
    </section>,
    slot,
  );
}

/** Schublade von links mit dem Menü; bleibt eingehängt (nur versteckt), damit die Ansichten ihre Inhalte hineinlegen können. */
export function MenuDrawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <div className={open ? 'fixed inset-0 z-40 flex' : 'hidden'} data-testid="mobile-menu">
      <nav aria-label={m.menu} className="flex h-full w-[min(24rem,88%)] flex-col overflow-y-auto bg-white pb-[env(safe-area-inset-bottom)] shadow-xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-700">
          <span className="font-semibold">{m.menu}</span>
          <Button variant="ghost" aria-label={m.closeMenu} onClick={onClose}>
            <X size={20} aria-hidden />
          </Button>
        </div>
        {children}
      </nav>
      <button type="button" className="flex-1 bg-slate-900/40" aria-label={m.closeMenu} tabIndex={-1} onClick={onClose} />
    </div>
  );
}

/** Fußzeile mit großen Symbol-Knöpfen. */
export function MobileFooter({ children }: { children: ReactNode }) {
  return (
    <nav aria-label={m.footer} className="flex shrink-0 items-stretch justify-around border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-700 dark:bg-slate-900">
      {children}
    </nav>
  );
}

/** label = vollständiger Name (Bedienhilfe, Tooltip), short = kurze Beschriftung unter dem Symbol */
export function FooterButton({ label, short = label, icon: Icon, onClick, active = false, disabled = false, badge }: { label: string; short?: string; icon: LucideIcon; onClick: () => void; active?: boolean; disabled?: boolean; badge?: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`relative flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1 text-[10px] leading-tight disabled:opacity-40 ${active ? 'text-sky-700 dark:text-sky-300' : 'text-slate-600 dark:text-slate-300'}`}
    >
      <Icon size={22} strokeWidth={1.75} aria-hidden />
      <span className="max-w-full truncate" aria-hidden>{short}</span>
      {badge}
    </button>
  );
}

/** Unteres Blatt (halbe Höhe der Zeichenfläche); schließt nur über ✕. */
export function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <section
      aria-label={title}
      data-testid="bottom-sheet"
      className="absolute inset-x-0 bottom-0 z-20 flex h-1/2 flex-col rounded-t-xl border-t border-slate-200 bg-white shadow-[0_-8px_24px_rgba(15,23,42,0.18)] dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 py-1 pr-1 pl-3 dark:border-slate-700">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Button variant="ghost" aria-label={`${title} ${m.close.toLowerCase()}`} onClick={onClose}>
          <X size={20} aria-hidden />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

/** Kleine Zahl oben rechts am Fußzeilen-Knopf */
export function CountBadge({ count, tone = 'sky' }: { count: number; tone?: 'sky' | 'red' | 'amber' }) {
  const color = tone === 'red' ? 'bg-red-600' : tone === 'amber' ? 'bg-amber-500' : 'bg-sky-600';
  return <span className={`absolute top-0.5 left-1/2 ml-2 min-w-4 rounded-full px-1 text-[10px] leading-4 font-semibold text-white ${color}`}>{count}</span>;
}

/** Anzahl Fehler/Warnungen der Prüfungen (Hinweise zählen nicht) */
export function IssueBadge({ issues }: { issues: Issue[] }) {
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  if (errors + warnings === 0) return null;
  return <CountBadge count={errors + warnings} tone={errors ? 'red' : 'amber'} />;
}
