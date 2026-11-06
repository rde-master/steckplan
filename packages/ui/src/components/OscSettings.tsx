// Einstellungen: OSC-Fernsteuerung der Vorstellung (an/aus, UDP-Port), Zustand und die Adressen.
// Docker: Einstellungsseite; Desktop: Startfenster („Einstellungen …“).
import { useCallback, useState } from 'react';
import { api, errorMessage, type OscSettings as Settings } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useLoader } from '../lib/useLoader';
import { texts } from '../texts';
import { Banner, Button, Field, Spinner, TextInput } from './ui';

const t = texts.osc;

export function OscSettings() {
  const load = useCallback(() => api.getOsc(), []);
  const { data, error: loadError, reload } = useLoader(load);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const current = draft ?? data?.settings;
  const status = data?.status;
  const portValid = !!current && Number.isInteger(current.port) && current.port >= 1024 && current.port <= 65535;

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900" aria-label={t.title} data-testid="osc-settings">
      <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{t.title}</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">{t.intro}</p>
      {!current ? (
        loadError ? <Banner tone="error">{loadError}</Banner> : <Spinner />
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            setSaved(false);
            void api
              .setOsc(current)
              .then(() => {
                setDraft(null);
                setSaved(true);
                reload();
              })
              .catch((err: unknown) => setError(errorMessage(err)));
          }}
        >
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={current.enabled} onChange={(e) => setDraft({ ...current, enabled: e.target.checked })} />
            {t.enabled}
          </label>
          <Field label={t.port} hint={t.portHint}>
            <TextInput value={String(current.port)} inputMode="numeric" aria-invalid={!portValid} onChange={(e) => setDraft({ ...current, port: Number(e.target.value) })} />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" disabled={!portValid}>
              {t.save}
            </Button>
            <span className="text-sm" role="status" data-testid="osc-status">
              {status?.listening ? <span className="text-emerald-700 dark:text-emerald-400">{t.listening(status.port ?? current.port)}</span> : status?.error ? <span className="text-red-700 dark:text-red-400">{t.failed(status.error)}</span> : <span className="text-slate-500">{t.off}</span>}
              {status?.last && <span className="ml-2 text-slate-500">{t.last(status.last.address, formatDateTime(status.last.at))}</span>}
            </span>
            {saved && <span className="text-sm text-emerald-700 dark:text-emerald-400">{t.saved}</span>}
          </div>
          {error && <Banner tone="error">{error}</Banner>}
        </form>
      )}
      <a
        href="/osc"
        target="_blank"
        rel="noopener"
        className="inline-block text-sm font-medium text-sky-700 underline dark:text-sky-400"
        onClick={(e) => {
          e.preventDefault();
          window.open('/osc', 'steckplan-osc')?.focus();
        }}
      >
        {t.allCommands}
      </a>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">{t.addresses}</summary>
        <table className="mt-2 w-full text-left text-xs">
          <tbody>
            {t.list.map(([address, meaning]) => (
              <tr key={address} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1 pr-3 font-mono whitespace-nowrap">{address}</td>
                <td className="py-1">{meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-slate-500">{t.rules}</p>
      </details>
    </section>
  );
}
