// Führen: OSC der Regie – Schalter „OSC senden“ (automatisch beim Start des Eintrags, bei Szenen und Events; je Gerät
// gemerkt), Knöpfe für die Befehle von Hand zum aktuellen Eintrag und die zuletzt gesendeten Befehle.
import { Radio, Send } from 'lucide-react';
import { useState } from 'react';
import type { OscCommand, OscLogEntry } from '@steckplan/core';
import { api, errorMessage } from '../../lib/api';
import { texts } from '../../texts';

const t = texts.regie.osc.lead;
const KEY = 'steckplan.oscAuto';

export function readOscAuto(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function writeOscAuto(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    // ohne Speicher gilt die Wahl bis zum Neuladen
  }
}

function clock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function OscLeadPanel({ projectId, auto, onAuto, manual, log, className = '' }: { projectId: string; auto: boolean; onAuto: (on: boolean) => void; manual: OscCommand[]; log: OscLogEntry[]; className?: string }) {
  const [error, setError] = useState('');
  const send = async (c: OscCommand) => {
    setError('');
    try {
      await api.sendOscCommand(projectId, c.id);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <section className={`space-y-2 rounded-xl border border-slate-700 bg-slate-900 p-3 ${className}`} aria-label={t.title} data-testid="osc-lead">
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">
          <Radio size={14} className="text-sky-400" aria-hidden /> {t.title}
        </span>
        <span className="flex-1" />
        <label className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${auto ? 'border-emerald-500 bg-emerald-500/15 text-emerald-200' : 'border-slate-600 text-slate-300'}`} title={t.autoHint}>
          <input type="checkbox" className="sr-only" checked={auto} onChange={(e) => onAuto(e.target.checked)} data-testid="osc-auto" />
          {t.auto}: {auto ? texts.regie.performance.on : texts.regie.performance.off}
        </label>
      </div>
      {manual.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="osc-manual">
          {manual.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => void send(c)}
              className="flex min-h-11 items-center gap-1.5 rounded-lg border border-sky-600 bg-sky-900/40 px-3 text-sm font-semibold text-sky-100 hover:bg-sky-800 active:scale-95"
              title={c.address}
              data-testid="osc-manual-button"
            >
              <Send size={14} aria-hidden /> {c.label || c.address || '–'}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
      {log.length > 0 && (
        <ol className="max-h-28 space-y-0.5 overflow-y-auto text-xs" data-testid="osc-log">
          {log.slice(0, 6).map((e, i) => (
            <li key={`${e.at}-${i}`} className={`flex gap-2 ${e.error ? 'text-red-400' : 'text-slate-400'}`}>
              <span className="shrink-0 tabular-nums text-slate-500">{clock(e.at)}</span>
              <span className="min-w-0 flex-1 truncate" title={`${e.source} · ${e.text} → ${e.target}${e.error ? ` (${e.error})` : ''}`}>
                <span className="text-slate-300">{e.source}</span> · <span className="font-mono">{e.text}</span>
                {e.error ? ` – ${e.error}` : ''}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
