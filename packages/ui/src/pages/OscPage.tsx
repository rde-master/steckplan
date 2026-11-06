// Übersicht aller OSC-Befehle der Vorstellung: Adresse, Wert, Wirkung, Beispiel, HTTP-Gegenstück –
// dazu der Zustand des Empfangs und je Befehl „Ausprobieren“ (schickt ihn über HTTP an die offene Vorstellung).
import { Play } from 'lucide-react';
import { useCallback, useState } from 'react';
import { can, type RemoteAction } from '@steckplan/core';
import { AppHeader, MainNav } from '../components/AppHeader';
import { Banner, Button, Spinner } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useLoader } from '../lib/useLoader';
import { useSession } from '../lib/session';
import { texts } from '../texts';

const t = texts.oscPage;

interface CommandInfo {
  action: RemoteAction;
  address: string;
  /** Wert: Beschreibung, Beispiel, Vorgabe beim Ausprobieren */
  value?: { label: string; example: number; optional?: boolean };
  meaning: string;
}

const COMMANDS: CommandInfo[] = [
  { action: 'play', address: '/steckplan/play', meaning: t.meanings.play },
  { action: 'pause', address: '/steckplan/pause', meaning: t.meanings.pause },
  { action: 'toggle', address: '/steckplan/toggle', meaning: t.meanings.toggle },
  { action: 'stop', address: '/steckplan/stop', meaning: t.meanings.stop },
  { action: 'forward', address: '/steckplan/forward', value: { label: t.seconds, example: 5, optional: true }, meaning: t.meanings.forward },
  { action: 'back', address: '/steckplan/back', value: { label: t.seconds, example: 5, optional: true }, meaning: t.meanings.back },
  { action: 'seek', address: '/steckplan/seek', value: { label: t.seconds, example: 61.5 }, meaning: t.meanings.seek },
  { action: 'item', address: '/steckplan/item', value: { label: t.number, example: 3 }, meaning: t.meanings.item },
  { action: 'next', address: '/steckplan/next', meaning: t.meanings.next },
  { action: 'prev', address: '/steckplan/prev', meaning: t.meanings.prev },
  { action: 'sceneNext', address: '/steckplan/scene/next', meaning: t.meanings.sceneNext },
  { action: 'scenePrev', address: '/steckplan/scene/prev', meaning: t.meanings.scenePrev },
];

export function OscPage() {
  const session = useSession((s) => s.session);
  const canTry = !!session && can(session.access, 'editShow');
  const load = useCallback(() => api.getOsc(), []);
  const { data, error } = useLoader(load);
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const host = window.location.hostname;

  const run = (command: CommandInfo) => {
    const raw = values[command.action] ?? (command.value ? String(command.value.example) : '');
    const value = raw.trim() === '' ? undefined : Number(raw.replace(',', '.'));
    setResult(null);
    void api
      .remote(command.action, value)
      .then((r) => setResult(r.rooms > 0 ? { ok: true, text: t.sent(command.address, r.rooms) } : { ok: false, text: t.noRoom }))
      .catch((e: unknown) => setResult({ ok: false, text: errorMessage(e) }));
  };

  return (
    <div className="flex min-h-full flex-col bg-slate-50 dark:bg-slate-950">
      <AppHeader title={t.title} nav={<MainNav active="osc" />} />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-4 p-4" data-testid="osc-page">
        <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-900">
          <p>{t.intro}</p>
          {!data ? (
            error ? <Banner tone="error">{error}</Banner> : <Spinner />
          ) : (
            <p data-testid="osc-page-status">
              {data.status.listening ? (
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">{t.listening(host, data.status.port ?? data.settings.port)}</span>
              ) : (
                <span className="font-semibold text-amber-700 dark:text-amber-400">{data.status.error ? t.failed(data.status.error) : t.off}</span>
              )}
              {data.status.last && <span className="ml-2 text-slate-500">{t.last(data.status.last.address, formatDateTime(data.status.last.at))}</span>}
            </p>
          )}
          <p className="text-xs text-slate-500">{t.rules}</p>
        </section>

        {result && <Banner tone={result.ok ? 'success' : 'warn'}>{result.text}</Banner>}

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <table className="w-full text-left text-sm" data-testid="osc-commands">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase dark:bg-slate-800">
              <tr>
                <th className="px-3 py-2">{t.columns.address}</th>
                <th className="px-3 py-2">{t.columns.value}</th>
                <th className="px-3 py-2">{t.columns.meaning}</th>
                <th className="px-3 py-2">{t.columns.http}</th>
                {canTry && <th className="px-3 py-2">{t.columns.try}</th>}
              </tr>
            </thead>
            <tbody>
              {COMMANDS.map((c) => (
                <tr key={c.action} className="border-t border-slate-100 align-top dark:border-slate-800">
                  <td className="px-3 py-2 font-mono whitespace-nowrap">{c.address}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{c.value ? (c.value.optional ? `[${c.value.label}]` : c.value.label) : '–'}</td>
                  <td className="px-3 py-2">{c.meaning}</td>
                  <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{JSON.stringify(c.value ? { action: c.action, value: c.value.example } : { action: c.action })}</td>
                  {canTry && (
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="flex items-center gap-1">
                        {c.value && (
                          <input
                            aria-label={`${c.value.label}: ${c.address}`}
                            className="w-16 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-800"
                            inputMode="decimal"
                            value={values[c.action] ?? String(c.value.example)}
                            onChange={(e) => setValues({ ...values, [c.action]: e.target.value })}
                          />
                        )}
                        <Button variant="secondary" className="min-h-7 px-2 py-0.5 text-xs" aria-label={`${t.columns.try}: ${c.address}`} onClick={() => run(c)}>
                          <Play size={12} aria-hidden /> {t.send}
                        </Button>
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">{t.httpHint}</p>
      </main>
    </div>
  );
}
