// Übersicht aller OSC-Befehle der Vorstellung: Adresse, Wert, Wirkung, Beispiel, HTTP-Gegenstück –
// dazu der Zustand des Empfangs und je Befehl „Ausprobieren“ (schickt ihn über HTTP an die offene Vorstellung).
import { Play } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
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
  /** Schlüssel der Zeile */
  key: string;
  action: RemoteAction;
  address: string;
  /** Nummer steht in der Adresse (/steckplan/lied/13) statt als Wert */
  numberInAddress?: boolean;
  /** Wert: Beschreibung, Beispiel, Vorgabe beim Ausprobieren */
  value?: { label: string; example: number; optional?: boolean };
  meaning: string;
}

/** Adresse, wie sie gesendet wird (Nummer ggf. in der Adresse) */
function shownAddress(c: CommandInfo, value?: number): string {
  return c.numberInAddress ? `${c.address}/${value ?? c.value?.example ?? 1}` : c.address;
}

/** grandMA3: SendOSC <OSC-Zeile> "<Adresse>,<Typen>,<Werte>" */
function grandMa3(c: CommandInfo): string {
  if (!c.value || c.numberInAddress) return `SendOSC 1 "${shownAddress(c)},,"`;
  const v = c.value.example;
  return `SendOSC 1 "${c.address},${Number.isInteger(v) ? 'i' : 'f'},${v}"`;
}

const COMMANDS: CommandInfo[] = [
  { key: 'play', action: 'play', address: '/steckplan/play', meaning: t.meanings.play },
  { key: 'pause', action: 'pause', address: '/steckplan/pause', meaning: t.meanings.pause },
  { key: 'toggle', action: 'toggle', address: '/steckplan/toggle', meaning: t.meanings.toggle },
  { key: 'stop', action: 'stop', address: '/steckplan/stop', meaning: t.meanings.stop },
  { key: 'forward', action: 'forward', address: '/steckplan/forward', value: { label: t.seconds, example: 5, optional: true }, meaning: t.meanings.forward },
  { key: 'back', action: 'back', address: '/steckplan/back', value: { label: t.seconds, example: 5, optional: true }, meaning: t.meanings.back },
  { key: 'seek', action: 'seek', address: '/steckplan/seek', value: { label: t.seconds, example: 61.5 }, meaning: t.meanings.seek },
  { key: 'lied', action: 'item', address: '/steckplan/lied', numberInAddress: true, value: { label: t.number, example: 13 }, meaning: t.meanings.lied },
  { key: 'item', action: 'item', address: '/steckplan/item', value: { label: t.number, example: 3 }, meaning: t.meanings.item },
  { key: 'next', action: 'next', address: '/steckplan/next', meaning: t.meanings.next },
  { key: 'prev', action: 'prev', address: '/steckplan/prev', meaning: t.meanings.prev },
  { key: 'sceneNext', action: 'sceneNext', address: '/steckplan/scene/next', meaning: t.meanings.sceneNext },
  { key: 'scenePrev', action: 'scenePrev', address: '/steckplan/scene/prev', meaning: t.meanings.scenePrev },
  { key: 'lineNext', action: 'lineNext', address: '/steckplan/line/next', meaning: t.meanings.lineNext },
  { key: 'linePrev', action: 'linePrev', address: '/steckplan/line/prev', meaning: t.meanings.linePrev },
  { key: 'tcForward', action: 'tcForward', address: '/steckplan/tc/forward', value: { label: t.seconds, example: 0.1, optional: true }, meaning: t.meanings.tcForward },
  { key: 'tcBack', action: 'tcBack', address: '/steckplan/tc/back', value: { label: t.seconds, example: 0.1, optional: true }, meaning: t.meanings.tcBack },
  { key: 'tap', action: 'tap', address: '/steckplan/tap', meaning: t.meanings.tap },
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
    const raw = values[command.key] ?? (command.value ? String(command.value.example) : '');
    const value = raw.trim() === '' ? undefined : Number(raw.replace(',', '.'));
    setResult(null);
    void api
      .remote(command.action, value)
      .then((r) => setResult(r.rooms > 0 ? { ok: true, text: t.sent(shownAddress(command, value), r.rooms) } : { ok: false, text: t.noRoom }))
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
                <th className="px-3 py-2">{t.columns.grandma3}</th>
                {canTry && <th className="px-3 py-2">{t.columns.try}</th>}
              </tr>
            </thead>
            <tbody>
              {COMMANDS.map((c) => (
                <tr key={c.key} className="border-t border-slate-100 align-top dark:border-slate-800">
                  <td className="px-3 py-2 font-mono whitespace-nowrap">{c.numberInAddress ? `${c.address}/‹${c.value!.label}›` : c.address}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{c.numberInAddress ? t.inAddress : c.value ? (c.value.optional ? `[${c.value.label}]` : c.value.label) : '–'}</td>
                  <td className="px-3 py-2">{c.meaning}</td>
                  <td className="px-3 py-2 font-mono text-xs whitespace-nowrap" data-testid="osc-grandma3">{grandMa3(c)}</td>
                  {canTry && (
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="flex items-center gap-1">
                        {c.value && (
                          <input
                            aria-label={`${c.value.label}: ${shownAddress(c, 0).replace(/\/0$/, '')}${c.numberInAddress ? '/…' : ''}`}
                            className="w-16 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-800"
                            inputMode="decimal"
                            value={values[c.key] ?? String(c.value.example)}
                            onChange={(e) => setValues({ ...values, [c.key]: e.target.value })}
                          />
                        )}
                        <Button variant="secondary" className="min-h-7 px-2 py-0.5 text-xs" aria-label={`${t.columns.try}: ${c.numberInAddress ? `${c.address}/…` : c.address}`} onClick={() => run(c)}>
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
        <DeskCueSection canTry={canTry} />
        <section className="space-y-1 rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-900" data-testid="osc-grandma3-help">
          <h2 className="font-semibold">{t.grandma3.title}</h2>
          <ol className="list-decimal space-y-1 pl-5">
            {t.grandma3.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="font-mono text-xs">{t.grandma3.example}</p>
        </section>
        <p className="text-xs text-slate-500">{t.httpHint}</p>
      </main>
    </div>
  );
}

/** Lichtpult-Cue als Text: Adresse, Beispiel, Ausprobieren und die letzten zehn */
function DeskCueSection({ canTry }: { canTry: boolean }) {
  const d = t.desk;
  const load = useCallback(() => api.getDeskCues(), []);
  const { data, reload } = useLoader(load);
  const [text, setText] = useState('Cue 1');
  const [error, setError] = useState<string | null>(null);
  const cues = data?.cues ?? [];
  // neue Cues vom Pult ohne Neuladen zeigen
  useEffect(() => {
    const timer = window.setInterval(reload, 3000);
    return () => window.clearInterval(timer);
  }, [reload]);
  return (
    <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-900" data-testid="osc-desk-cue">
      <h2 className="font-semibold">{d.title}</h2>
      <p>{d.intro}</p>
      <p>
        <span className="font-mono">{d.address}</span> · {d.value} · <span className="font-mono text-xs">{d.example}</span>
      </p>
      <p className="text-xs text-slate-500">{d.macro}</p>
      {canTry && (
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label={d.text} className="w-48 rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800" value={text} onChange={(e) => setText(e.target.value)} />
          <Button
            variant="secondary"
            className="min-h-8 px-2 py-0.5 text-xs"
            aria-label={`${t.columns.try}: ${d.address}`}
            onClick={() => {
              setError(null);
              void api
                .sendDeskCue(text)
                .then(() => reload())
                .catch((e: unknown) => setError(errorMessage(e)));
            }}
          >
            <Play size={12} aria-hidden /> {t.send}
          </Button>
        </div>
      )}
      {error && <Banner tone="error">{error}</Banner>}
      <div>
        <div className="text-xs font-semibold text-slate-500">{d.history}</div>
        {cues.length === 0 ? (
          <p className="text-slate-500">{d.empty}</p>
        ) : (
          <ol className="text-sm" data-testid="osc-desk-history">
            {cues.map((c, i) => (
              <li key={`${c.at}-${i}`} className={i === 0 ? 'font-semibold' : 'text-slate-500'}>
                <span className="mr-2 text-xs tabular-nums">{formatDateTime(c.at)}</span>
                {c.text}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
