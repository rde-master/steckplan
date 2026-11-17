// Führen: welcher Cue läuft im grandMA3 in der Sequenz der aktuellen Lichtszene? Der Server fragt beim Wechsel der
// Lichtszene von selbst, der Knopf fragt jetzt; die Antwort kommt über die Live-Verbindung.
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { LightScene, Ma3CueState } from '@steckplan/core';
import { api, errorMessage } from '../../lib/api';
import { texts } from '../../texts';

const t = texts.regie.performance;

function clock(iso: string | undefined): string {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
}

export function Ma3CuePanel({ projectId, scene, state, canQuery }: { projectId: string; scene: LightScene | undefined; state: Ma3CueState | null; canQuery: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sequence = scene?.ma3Sequence;
  const query = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.queryMa3(projectId, scene?.id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  // Stand der aktuellen Szene (bzw. ihrer Sequenz); ältere Abfragen anderer Szenen nicht als „läuft“ zeigen
  const shown = state && sequence !== undefined && state.sequence === sequence ? state : null;
  const status = shown ? t.ma3Status[shown.status] : '';
  return (
    <section className="space-y-2 rounded-xl border border-slate-700 bg-slate-900 p-3" aria-label={t.ma3Title} data-testid="ma3-cue">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">{t.ma3Title}</span>
        {sequence !== undefined && (
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs tabular-nums text-slate-300" data-testid="ma3-cue-sequence">
            {t.ma3Sequence(sequence)}
          </span>
        )}
        {canQuery && (
          <button
            type="button"
            onClick={() => void query()}
            disabled={busy || sequence === undefined}
            title={t.ma3QueryTitle}
            className="flex items-center gap-1 rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40"
            data-testid="ma3-query"
          >
            <RefreshCw size={12} className={shown?.status === 'waiting' ? 'animate-spin' : ''} aria-hidden /> {t.ma3Query}
          </button>
        )}
      </div>
      {sequence === undefined ? (
        <p className="text-sm text-slate-500">{t.ma3NoSequence}</p>
      ) : !shown ? (
        <p className="text-sm text-slate-500">{t.ma3Never}</p>
      ) : (
        <div className="space-y-0.5" data-testid="ma3-cue-state" data-status={shown.status}>
          <div className="flex items-baseline gap-3">
            {shown.cue !== undefined ? (
              <span className="min-w-0 flex-1 text-xl font-bold break-words text-amber-200" data-testid="ma3-cue-current">
                {t.ma3Cue(shown.cue)}
                {shown.name && <span className="ml-2 font-semibold text-amber-100/80">{shown.name}</span>}
              </span>
            ) : (
              <span className="min-w-0 flex-1" />
            )}
            <span className="shrink-0 text-xs tabular-nums text-slate-500">{clock(shown.answeredAt ?? shown.askedAt)}</span>
          </div>
          {status && <p className={`text-sm ${shown.status === 'waiting' ? 'text-slate-400' : 'text-red-300'}`} data-testid="ma3-cue-status">{status}</p>}
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
