// Führen: Pause im Textfenster – Titel (z. B. „Pause“) groß, darunter die Restzeit. Minuten und Titel merkt sich das
// Gerät. Läuft die Pause, zählt die Anzeige hier mit; „+5 min“ verlängert, „Pause beenden“ zeigt wieder den Text.
import { Coffee, Plus, Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PAUSE_MAX_SEC, PAUSE_TITLE_MAX } from '@steckplan/core';
import { texts } from '../../texts';

export interface PauseState {
  title: string;
  /** Ende (performance.now, ms); fehlt = ohne Zeit */
  until?: number;
}

const MINUTES_KEY = 'steckplan.pauseMinutes';
const TITLE_KEY = 'steckplan.pauseTitle';
const DEFAULT_MINUTES = 15;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ohne Speicher gilt der Wert bis zum Neuladen
  }
}

/** Restzeit in Sekunden (aufgerundet), jede Viertelsekunde neu */
function useLeft(until: number | undefined): number | undefined {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (until === undefined) return;
    const timer = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(timer);
  }, [until]);
  return until === undefined ? undefined : Math.max(0, Math.ceil((until - now) / 1000));
}

export function formatPauseLeft(sec: number): string {
  const m = Math.floor(sec / 60);
  return `${m}:${String(sec % 60).padStart(2, '0')}`;
}

export function PauseControl({ pause, onChange }: { pause: PauseState | null; onChange: (pause: PauseState | null) => void }) {
  const t = texts.regie.performance;
  const [minutes, setMinutes] = useState(() => {
    const stored = Number(read(MINUTES_KEY));
    return Number.isFinite(stored) && read(MINUTES_KEY) !== null ? stored : DEFAULT_MINUTES;
  });
  const [title, setTitle] = useState(() => read(TITLE_KEY) ?? texts.regie.lyricsPage.pauseTitle);
  const left = useLeft(pause?.until);
  const maxMinutes = PAUSE_MAX_SEC / 60;
  const start = () => {
    const name = title.trim().slice(0, PAUSE_TITLE_MAX);
    onChange({ title: name, ...(minutes > 0 ? { until: performance.now() + minutes * 60_000 } : {}) });
  };
  const button = 'flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-sm font-semibold active:scale-95';
  const input = 'min-w-0 rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-slate-100';
  // eine Zeile (im Kasten „Textfenster“) – die Spalte rechts muss ohne Scrollen passen
  return (
    <div className="flex items-center gap-2 border-t border-slate-800 pt-2" role="group" aria-label={t.pause} data-testid="pause-control" data-active={pause ? true : undefined}>
      <Coffee size={16} className="shrink-0 text-amber-300" aria-hidden />
      {pause ? (
        <>
          <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2 rounded-md bg-amber-500/15 px-2 py-1 text-amber-100" role="status" data-testid="pause-running">
            <span className="min-w-0 truncate text-sm font-semibold">{pause.title || texts.regie.lyricsPage.pauseTitle}</span>
            <span className="shrink-0 font-semibold tabular-nums" data-testid="pause-left">
              {left === undefined ? t.pauseNoTime : left > 0 ? formatPauseLeft(left) : t.pauseOver}
            </span>
          </span>
          <button
            type="button"
            className={`${button} border-slate-600 text-slate-100 hover:bg-slate-800`}
            title={t.pauseExtendTitle}
            onClick={() => onChange({ ...pause, until: Math.min(Math.max(pause.until ?? performance.now(), performance.now()) + 5 * 60_000, performance.now() + PAUSE_MAX_SEC * 1000) })}
            data-testid="pause-extend"
          >
            <Plus size={14} aria-hidden /> {t.pauseExtend}
          </button>
          <button type="button" className={`${button} border-red-500 bg-red-500/15 text-red-100 hover:bg-red-500/25`} title={t.pauseStop} aria-label={t.pauseStop} onClick={() => onChange(null)} data-testid="pause-stop">
            <Square size={13} aria-hidden />
          </button>
        </>
      ) : (
        <>
          <input
            className={`${input} flex-1`}
            value={title}
            maxLength={PAUSE_TITLE_MAX}
            aria-label={t.pauseTitleLabel}
            title={t.pauseTitleLabel}
            onChange={(e) => {
              setTitle(e.target.value);
              write(TITLE_KEY, e.target.value);
            }}
            data-testid="pause-title"
          />
          <input
            type="number"
            min={0}
            max={maxMinutes}
            className={`${input} w-14 tabular-nums`}
            value={minutes}
            aria-label={t.pauseMinutes}
            title={t.pauseMinutesHint}
            onChange={(e) => {
              const value = Math.min(maxMinutes, Math.max(0, Math.round(Number(e.target.value) || 0)));
              setMinutes(value);
              write(MINUTES_KEY, String(value));
            }}
            data-testid="pause-minutes"
          />
          <button type="button" className={`${button} border-amber-500 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25`} onClick={start} data-testid="pause-start">
            {t.pauseStart}
          </button>
        </>
      )}
    </div>
  );
}
