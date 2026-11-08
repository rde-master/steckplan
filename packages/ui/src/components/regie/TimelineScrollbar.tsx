// Scrollbalken für gezoomte Zeitleisten (Ausschnitt start … start + span von total): Griff ziehen verschiebt,
// Klick daneben springt mit dem Ausschnitt dorthin. Ungezoomt nicht sichtbar.
import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

export function TimelineScrollbar({ start, span, total, onChange, label, dark = false }: { start: number; span: number; total: number; onChange: (start: number) => void; label: string; dark?: boolean }) {
  const bar = useRef<HTMLDivElement>(null);
  const grab = useRef<{ x: number; start: number } | null>(null);
  if (total <= 0 || span >= total - 0.01) return null;
  const clamp = (s: number) => Math.min(Math.max(0, s), total - span);
  const perPx = () => total / (bar.current?.getBoundingClientRect().width || 1);
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const rect = bar.current!.getBoundingClientRect();
    const at = ((e.clientX - rect.left) / rect.width) * total;
    // neben den Griff geklickt: Ausschnitt dort mittig
    const next = at < start || at > start + span ? clamp(at - span / 2) : start;
    if (next !== start) onChange(next);
    grab.current = { x: e.clientX, start: next };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!grab.current) return;
    onChange(clamp(grab.current.start + (e.clientX - grab.current.x) * perPx()));
  };
  const up = () => {
    grab.current = null;
  };
  return (
    <div
      ref={bar}
      role="scrollbar"
      aria-label={label}
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={Math.round(total - span)}
      aria-valuenow={Math.round(start)}
      className={`relative h-3 cursor-pointer touch-none rounded-full select-none ${dark ? 'bg-slate-800' : 'bg-slate-200 dark:bg-slate-800'}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      data-testid="timeline-scrollbar"
    >
      <div
        className={`absolute top-0 bottom-0 rounded-full ${dark ? 'bg-slate-500 hover:bg-slate-400' : 'bg-slate-400 hover:bg-slate-500 dark:bg-slate-600 dark:hover:bg-slate-500'}`}
        style={{ left: `${(start / total) * 100}%`, width: `${Math.max(2, (span / total) * 100)}%` }}
        data-testid="timeline-scrollbar-thumb"
      />
    </div>
  );
}
