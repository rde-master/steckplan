// Lichtpult: zuletzt gelaufener Cue (per OSC /steckplan/cue als Text) groß, darunter die letzten zehn mit Uhrzeit.
import { Lightbulb } from 'lucide-react';
import type { DeskCue } from '@steckplan/core';
import { texts } from '../../texts';

const t = texts.regie.performance;

function clock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function DeskCuePanel({ cues, className = '' }: { cues: DeskCue[]; className?: string }) {
  const [last, ...history] = cues;
  return (
    <section className={`space-y-2 rounded-xl border border-slate-700 bg-slate-900 p-3 ${className}`} aria-label={t.deskTitle} data-testid="desk-cues">
      <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">
        <Lightbulb size={14} className="text-amber-400" aria-hidden /> {t.deskTitle}
      </div>
      {!last ? (
        <p className="text-sm text-slate-500">{t.deskEmpty}</p>
      ) : (
        <>
          <div className="flex items-baseline gap-3">
            <span className="min-w-0 flex-1 text-2xl font-bold break-words text-amber-200" data-testid="desk-cue-last">
              {last.text}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-slate-500">{clock(last.at)}</span>
          </div>
          {history.length > 0 && (
            <ol className="max-h-40 space-y-0.5 overflow-y-auto border-t border-slate-800 pt-1.5 text-sm" aria-label={t.deskHistory} data-testid="desk-cue-history">
              {history.map((c, i) => (
                <li key={`${c.at}-${i}`} className="flex items-baseline gap-2 text-slate-400">
                  <span className="w-16 shrink-0 text-xs tabular-nums text-slate-600">{clock(c.at)}</span>
                  <span className="min-w-0 flex-1 truncate" title={c.text}>
                    {c.text}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
