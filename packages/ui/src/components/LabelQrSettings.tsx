// Einstellungen: QR-Code auf den Geräte-Etiketten (an/aus, Adresse, Hinweis) und die Lese-Schlüssel je Projekt.
// Docker: Einstellungsseite; Desktop: Startfenster („Einstellungen …“).
import { RefreshCw, ShieldOff } from 'lucide-react';
import { useCallback, useState } from 'react';
import { api, errorMessage, type LabelQrSettings as Settings } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useLoader } from '../lib/useLoader';
import { texts } from '../texts';
import { ICON } from './icons';
import { Banner, Button, Field, Spinner, TextInput } from './ui';

const t = texts.labelQr;

export function LabelQrSettings({ addressHint }: { addressHint: string }) {
  const loadSettings = useCallback(() => api.getLabelQr(), []);
  const settings = useLoader(loadSettings);
  const loadLinks = useCallback(() => api.listShareLinks().then((r) => r.links), []);
  const links = useLoader(loadLinks);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = draft ?? settings.data;

  async function run(action: () => Promise<unknown>, done?: string) {
    setError(null);
    setMessage(null);
    try {
      await action();
      if (done) setMessage(done);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900" aria-label={t.title} data-testid="label-qr-settings">
      <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{t.title}</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">{t.intro}</p>
      {!current ? (
        settings.error ? <Banner tone="error">{settings.error}</Banner> : <Spinner />
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const saved = await api.setLabelQr(current);
              setDraft(null);
              settings.reload();
              return saved;
            }, t.saved);
          }}
        >
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={current.enabled} onChange={(e) => setDraft({ ...current, enabled: e.target.checked })} />
            {t.enabled}
          </label>
          <Field label={t.baseUrl} hint={t.baseUrlHint(addressHint)}>
            <TextInput value={current.baseUrl} placeholder={addressHint} inputMode="url" onChange={(e) => setDraft({ ...current, baseUrl: e.target.value })} />
          </Field>
          <Field label={t.hint}>
            <TextInput value={current.hint} maxLength={120} onChange={(e) => setDraft({ ...current, hint: e.target.value })} />
          </Field>
          <Button type="submit" variant="primary" disabled={!draft}>
            {t.save}
          </Button>
        </form>
      )}
      {message && <Banner tone="success">{message}</Banner>}
      {error && <Banner tone="error">{error}</Banner>}

      <h3 className="pt-2 text-sm font-semibold">{t.keys}</h3>
      <p className="text-xs text-slate-500">{t.keysHint}</p>
      {links.data && links.data.length === 0 && <p className="text-sm text-slate-500">{t.noKeys}</p>}
      <ul className="divide-y divide-slate-100 dark:divide-slate-800" data-testid="label-qr-links">
        {links.data?.map((link) => (
          <li key={link.key} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <span className="min-w-0 flex-1">
              <span className="font-medium">{link.name}</span>
              <span className="ml-2 text-xs text-slate-500">{t.created(formatDateTime(link.createdAt), link.createdBy)}</span>
            </span>
            <Button
              variant="ghost"
              className="text-xs"
              onClick={() => {
                if (window.confirm(t.renewConfirm(link.name))) void run(() => api.changeShareLink(link.key, 'renew').then(links.reload), t.renewed);
              }}
            >
              <RefreshCw {...ICON} /> {t.renew}
            </Button>
            <Button
              variant="ghost"
              className="text-xs"
              onClick={() => {
                if (window.confirm(t.revokeConfirm(link.name))) void run(() => api.changeShareLink(link.key, 'revoke').then(links.reload), t.revoked);
              }}
            >
              <ShieldOff {...ICON} /> {t.revoke}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
