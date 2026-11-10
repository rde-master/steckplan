// Führen: Stand der Steckplan Player (bereit / synchronisiert / nicht verbunden, Medien), neue Kopplungen zulassen
// (Code am Player-Bildschirm), neu synchronisieren (einzeln oder alle) und Player entfernen.
import { Check, MonitorPlay, RefreshCw, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatBytes, type PlayersOverview, type PlayerStatus } from '@steckplan/core';
import { api, errorMessage } from '../../lib/api';
import { texts } from '../../texts';

const t = texts.players;
const POLL_MS = 2000;

function clock(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function stateOf(p: PlayerStatus): { label: string; dot: string } {
  if (!p.online) return { label: t.offline, dot: 'bg-slate-500' };
  if (p.resyncPending) return { label: t.resyncPending, dot: 'bg-amber-400 animate-pulse' };
  const phase = p.report?.phase ?? 'syncing';
  return { label: t.phases[phase] ?? phase, dot: phase === 'ready' ? 'bg-emerald-500' : phase === 'error' ? 'bg-red-500' : 'bg-amber-400 animate-pulse' };
}

export function PlayersPanel({ className = '' }: { className?: string }) {
  const [overview, setOverview] = useState<PlayersOverview | null>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      void api
        .players()
        .then((o) => alive && setOverview(o))
        .catch(() => undefined);
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [tick]);

  const run = async (action: () => Promise<unknown>) => {
    setError('');
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    }
    setTick((n) => n + 1);
  };

  if (!overview) return null;
  const { players, pairing, discoverable } = overview;
  const button = 'flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold active:scale-95 disabled:opacity-40';
  return (
    <section className={`space-y-2 rounded-xl border border-slate-700 bg-slate-900 p-3 ${className}`} aria-label={t.title} data-testid="players-panel">
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">
          <MonitorPlay size={14} className="text-sky-400" aria-hidden /> {t.title}
        </span>
        <span className="flex-1" />
        {players.length > 1 && (
          <button type="button" className={`${button} border-slate-600 text-slate-200 hover:bg-slate-800`} onClick={() => void run(() => api.resyncPlayer())} data-testid="players-resync-all">
            <RefreshCw size={13} aria-hidden /> {t.resyncAll}
          </button>
        )}
      </div>

      {pairing.map((r) => (
        <div key={r.requestId} className="space-y-1.5 rounded-lg border border-amber-500/60 bg-amber-500/10 p-2" data-testid="player-pairing">
          <p className="text-sm text-amber-100">{t.request(r.name)}</p>
          <p className="flex items-center gap-2 text-xs text-amber-200/80">
            {t.codeHint}
            <span className="rounded bg-black/40 px-2 py-0.5 font-mono text-lg font-bold tracking-[0.3em] text-white" data-testid="player-pairing-code">
              {r.code}
            </span>
          </p>
          <div className="flex gap-2">
            <button type="button" className={`${button} border-emerald-500 bg-emerald-600/30 text-emerald-100 hover:bg-emerald-600/50`} onClick={() => void run(() => api.approvePlayer(r.requestId))}>
              <Check size={14} aria-hidden /> {t.approve}
            </button>
            <button type="button" className={`${button} border-slate-600 text-slate-300 hover:bg-slate-800`} onClick={() => void run(() => api.rejectPlayer(r.requestId))}>
              <X size={14} aria-hidden /> {t.reject}
            </button>
          </div>
        </div>
      ))}

      {players.length === 0 && pairing.length === 0 && <p className="text-xs text-slate-400">{t.none}</p>}
      {!discoverable && <p className="text-xs text-amber-300/90" data-testid="players-not-discoverable">{t.notDiscoverable}</p>}

      {players.length > 0 && (
        <ul className="space-y-1.5" data-testid="players-list">
          {players.map((p) => {
            const state = stateOf(p);
            const r = p.report;
            return (
              <li key={p.id} className="rounded-lg bg-slate-800/60 px-2 py-1.5" data-testid="player-row" data-online={p.online || undefined} data-phase={p.online ? r?.phase : 'offline'}>
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${state.dot}`} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100" title={p.name}>{p.name}</span>
                  <button
                    type="button"
                    className={`${button} border-sky-600 text-sky-100 hover:bg-sky-900`}
                    title={t.resync}
                    aria-label={`${t.resync}: ${p.name}`}
                    disabled={p.resyncPending}
                    onClick={() => void run(() => api.resyncPlayer(p.id))}
                    data-testid="player-resync"
                  >
                    <RefreshCw size={14} className={p.resyncPending ? 'animate-spin' : ''} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-slate-500 hover:bg-slate-700 hover:text-red-300"
                    aria-label={`${t.remove}: ${p.name}`}
                    title={t.remove}
                    onClick={() => {
                      if (window.confirm(t.removeConfirm(p.name))) void run(() => api.removePlayer(p.id));
                    }}
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>
                <p className="mt-0.5 flex flex-wrap gap-x-2 pl-4 text-xs text-slate-400" data-testid="player-state">
                  <span>{state.label}</span>
                  {p.online && r && r.mediaTotal > 0 && <span>{t.media(r.mediaDone, r.mediaTotal)}</span>}
                  {p.online && r && r.bytesTotal > 0 && r.phase === 'syncing' && <span>{`${formatBytes(r.bytesDone)} / ${formatBytes(r.bytesTotal)}`}</span>}
                  {!p.online && p.lastSeen && <span>{t.lastSeen(clock(p.lastSeen))}</span>}
                  {r?.version && <span className="text-slate-500">v{r.version}</span>}
                </p>
                {p.online && r?.error && <p className="pl-4 text-xs text-red-400">{r.error}</p>}
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
