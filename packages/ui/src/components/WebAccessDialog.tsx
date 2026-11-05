// Desktop: Weboberfläche fürs Handy starten/beenden, Passwörter, Port, QR-Code und verbundene Personen.
import { useEffect, useState, type FormEvent } from 'react';
import { errorMessage } from '../lib/api';
import type { DesktopBridge, WebAccessStatus } from '../lib/desktop';
import { texts } from '../texts';
import { AccessBadge, Banner, Button, Field, Modal, Spinner, TextInput } from './ui';

const t = texts.webAccess;
const LOOPBACK = '127.0.0.1';

export function WebAccessDialog({ desktop, onClose }: { desktop: DesktopBridge; onClose: () => void }) {
  const [status, setStatus] = useState<WebAccessStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [editingPasswords, setEditingPasswords] = useState(false);

  // Status (u. a. verbundene Personen) regelmäßig aktualisieren, solange der Dialog offen ist
  useEffect(() => {
    let active = true;
    const load = () =>
      desktop.webAccess.status().then(
        (s) => active && setStatus(s),
        (err: unknown) => active && setError(errorMessage(err)),
      );
    void load();
    const timer = window.setInterval(() => void load(), 2000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [desktop]);

  async function run(action: () => Promise<WebAccessStatus>, success?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setStatus(await action());
      if (success) setNotice(success);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return (
      <Modal title={t.title} onClose={onClose}>
        {error ? <Banner tone="error">{error}</Banner> : <Spinner />}
      </Modal>
    );
  }

  const selected = address ?? status.address ?? '';
  const showPasswordForm = !status.hasPasswords || editingPasswords;

  return (
    <Modal title={t.title} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">{t.intro}</p>
        {error && <Banner tone="error">{error}</Banner>}
        {notice && <Banner tone="success">{notice}</Banner>}

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t.passwords}</h3>
          {showPasswordForm ? (
            <PasswordForm
              busy={busy}
              missing={!status.hasPasswords}
              onCancel={status.hasPasswords ? () => setEditingPasswords(false) : undefined}
              onSubmit={async (passwords) => {
                if (await run(() => desktop.webAccess.setPasswords(passwords), t.passwordsSaved)) setEditingPasswords(false);
              }}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>{t.passwordsSet}</span>
              <Button variant="ghost" onClick={() => setEditingPasswords(true)}>
                {t.changePasswords}
              </Button>
            </div>
          )}
        </section>

        {status.running && status.url ? (
          <section className="space-y-3">
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
              {status.qrSvg && (
                <img
                  src={`data:image/svg+xml;utf8,${encodeURIComponent(status.qrSvg)}`}
                  alt={t.qrAlt}
                  className="h-48 w-48 shrink-0 rounded-md bg-white"
                />
              )}
              <div className="min-w-0 space-y-2 text-sm">
                <div>
                  {t.running}{' '}
                  <a className="break-all font-mono font-semibold text-sky-700 dark:text-sky-300" href={status.url} target="_blank" rel="noreferrer" data-testid="web-url">
                    {status.url}
                  </a>
                </div>
                {status.actualPort !== null && status.actualPort !== status.port && <Banner tone="warn">{t.portBusy(status.port, status.actualPort)}</Banner>}
                {status.address === LOOPBACK && <Banner tone="warn">{t.loopbackHint}</Banner>}
                <p className="text-xs text-slate-500 dark:text-slate-400">{t.firewall}</p>
                <Button variant="danger" disabled={busy} onClick={() => void run(() => desktop.webAccess.stop())}>
                  {t.stop}
                </Button>
              </div>
            </div>
            <People status={status} busy={busy} onDisconnect={(id) => void run(() => desktop.webAccess.disconnect(id))} />
          </section>
        ) : (
          <section className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
              <Field label={t.address}>
                <select
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                  value={selected}
                  onChange={(e) => setAddress(e.target.value)}
                >
                  {status.interfaces.map((i) => (
                    <option key={i.address} value={i.address}>
                      {i.address} ({i.name})
                    </option>
                  ))}
                </select>
              </Field>
              <PortField port={status.port} busy={busy} onSave={(port) => void run(() => desktop.webAccess.setPort(port))} />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t.portHint}</p>
            <Button variant="primary" disabled={busy || !status.hasPasswords || !selected} onClick={() => void run(() => desktop.webAccess.start(selected))}>
              {t.start}
            </Button>
          </section>
        )}
      </div>
    </Modal>
  );
}

function PasswordForm({
  busy,
  missing,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  missing: boolean;
  onSubmit: (passwords: { edit: string; read: string; direction?: string }) => void;
  onCancel?: () => void;
}) {
  const [edit, setEdit] = useState('');
  const [read, setRead] = useState('');
  const [direction, setDirection] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit({ edit, read, ...(direction ? { direction } : {}) });
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      {missing && <Banner tone="warn">{t.passwordsMissing}</Banner>}
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label={t.editPassword}>
          <TextInput type="password" autoComplete="new-password" value={edit} onChange={(e) => setEdit(e.target.value)} />
        </Field>
        <Field label={t.readPassword}>
          <TextInput type="password" autoComplete="new-password" value={read} onChange={(e) => setRead(e.target.value)} />
        </Field>
        <Field label={t.directionPassword}>
          <TextInput type="password" autoComplete="new-password" value={direction} placeholder={t.directionOptional} onChange={(e) => setDirection(e.target.value)} />
        </Field>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">{t.passwordHint}</p>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={busy || !edit || !read}>
          {t.savePasswords}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            {texts.common.cancel}
          </Button>
        )}
      </div>
    </form>
  );
}

function PortField({ port, busy, onSave }: { port: number; busy: boolean; onSave: (port: number) => void }) {
  const [value, setValue] = useState(String(port));
  const parsed = Number(value);
  return (
    <Field label={t.port}>
      <div className="flex gap-1">
        <TextInput inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ''))} />
        <Button disabled={busy || !value || parsed === port} onClick={() => onSave(parsed)}>
          {t.savePort}
        </Button>
      </div>
    </Field>
  );
}

function People({ status, busy, onDisconnect }: { status: WebAccessStatus; busy: boolean; onDisconnect: (sessionId: string) => void }) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold">{t.people}</h3>
      {status.people.length === 0 ? (
        <p className="text-sm text-slate-500">{t.nobody}</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
          {status.people.map((p) => (
            <li key={p.sessionId} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="font-medium">{p.name}</span>
              <AccessBadge access={p.access} />
              <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{p.projects.length ? p.projects.join(', ') : t.noProject}</span>
              <Button variant="ghost" disabled={busy} onClick={() => onDisconnect(p.sessionId)}>
                {t.disconnect}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
