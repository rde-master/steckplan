// Server-Einstellungen (Docker, nur Bearbeiten-Zugang): Desktop-Zugangsschlüssel erzeugen und widerrufen.
import { useCallback, useState, type FormEvent } from 'react';
import { can } from '@steckplan/core';
import { AppHeader, MainNav } from '../components/AppHeader';
import { LabelQrSettings } from '../components/LabelQrSettings';
import { OscSettings } from '../components/OscSettings';
import { AccessBadge, Banner, Button, Field, Spinner, TextInput } from '../components/ui';
import { selectClass } from '../components/library/fields';
import { api, errorMessage, type DesktopKeyInfo } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useLoader } from '../lib/useLoader';
import { useSession } from '../lib/session';
import { texts } from '../texts';

const t = texts.settings;

export function SettingsPage() {
  const session = useSession((s) => s.session);
  const mode = useSession((s) => s.mode);
  const allowed = !!session && can(session.access, 'manageProjects') && mode === 'standalone';
  return (
    <div className="flex min-h-full flex-col bg-slate-50 dark:bg-slate-950">
      <AppHeader title={t.title} nav={<MainNav active="settings" />} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4">
        {allowed ? (
          <>
            <DesktopKeys />
            <LabelQrSettings addressHint={window.location.origin} />
            <OscSettings />
          </>
        ) : (
          <Banner tone="warn">{t.notAllowed}</Banner>
        )}
      </main>
    </div>
  );
}

function DesktopKeys() {
  const load = useCallback(() => api.listDesktopKeys().then((r) => r.keys), []);
  const { data: keys, error, reload } = useLoader(load);
  const [created, setCreated] = useState<{ key: string; label: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900" aria-label={t.keysTitle}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t.keysTitle}</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">{t.keysIntro}</p>
      <NewKeyForm
        onCreate={async (label, access) => {
          setActionError(null);
          setCopied(false);
          try {
            const result = await api.createDesktopKey(label, access);
            setCreated({ key: result.key, label: result.info.label });
            reload();
          } catch (err) {
            setActionError(errorMessage(err));
          }
        }}
      />
      {created && (
        <Banner tone="success">
          <div className="space-y-2">
            <div className="font-medium">{t.created(created.label)}</div>
            <div className="flex flex-wrap items-center gap-2">
              <code className="break-all rounded bg-white px-2 py-1 font-mono text-sm text-slate-900 dark:bg-slate-900 dark:text-slate-100" data-testid="new-key">
                {created.key}
              </code>
              <Button
                onClick={() => {
                  void navigator.clipboard?.writeText(created.key).then(() => setCopied(true));
                }}
              >
                {copied ? t.copied : t.copy}
              </Button>
            </div>
            <div className="text-xs">{t.onlyOnce}</div>
            <Button variant="ghost" onClick={() => setCreated(null)}>
              {t.hide}
            </Button>
          </div>
        </Banner>
      )}
      {(error || actionError) && <Banner tone="error">{actionError ?? error}</Banner>}
      {!keys ? (
        !error && <Spinner />
      ) : keys.length === 0 ? (
        <p className="text-sm text-slate-500">{t.noKeys}</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-slate-700 dark:border-slate-700" data-testid="desktop-keys">
          {keys.map((key) => (
            <KeyRow key={key.id} entry={key} onRevoke={() => void run(() => api.revokeDesktopKey(key.id))} onRemove={() => void run(() => api.removeDesktopKey(key.id))} />
          ))}
        </ul>
      )}
    </section>
  );
}

function NewKeyForm({ onCreate }: { onCreate: (label: string, access: 'edit' | 'read' | 'direction') => Promise<void> }) {
  const [label, setLabel] = useState('');
  const [access, setAccess] = useState<'edit' | 'read' | 'direction'>('edit');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!label.trim()) return;
    await onCreate(label.trim(), access);
    setLabel('');
  }
  return (
    <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
      <Field label={t.label}>
        <TextInput value={label} placeholder={t.labelPlaceholder} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
      </Field>
      <Field label={t.access}>
        <select className={selectClass} value={access} onChange={(e) => setAccess(e.target.value as 'edit' | 'read' | 'direction')}>
          <option value="edit">{texts.session.accessEdit}</option>
          <option value="direction">{texts.session.accessDirection}</option>
          <option value="read">{texts.session.accessRead}</option>
        </select>
      </Field>
      <Button type="submit" variant="primary" disabled={!label.trim()}>
        {t.create}
      </Button>
    </form>
  );
}

function KeyRow({ entry, onRevoke, onRemove }: { entry: DesktopKeyInfo; onRevoke: () => void; onRemove: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
      <div className="min-w-48 flex-1">
        <div className={`font-medium ${entry.revoked ? 'text-slate-400 line-through' : ''}`}>{entry.label}</div>
        <div className="text-xs text-slate-500">
          {t.createdAt(formatDateTime(entry.createdAt), entry.createdBy)} · {entry.lastUsedAt ? t.lastUsed(formatDateTime(entry.lastUsedAt)) : t.neverUsed}
          {entry.revokedAt ? ` · ${t.revokedAt(formatDateTime(entry.revokedAt))}` : ''}
        </div>
      </div>
      <AccessBadge access={entry.access} />
      {entry.revoked ? (
        <Button variant="ghost" onClick={onRemove}>
          {t.remove}
        </Button>
      ) : confirm ? (
        <span className="flex items-center gap-1">
          <Button variant="danger" onClick={onRevoke}>
            {t.revokeConfirm}
          </Button>
          <Button variant="ghost" onClick={() => setConfirm(false)}>
            {texts.common.cancel}
          </Button>
        </span>
      ) : (
        <Button variant="ghost" aria-label={`${t.revoke}: ${entry.label}`} onClick={() => setConfirm(true)}>
          {t.revoke}
        </Button>
      )}
    </li>
  );
}
