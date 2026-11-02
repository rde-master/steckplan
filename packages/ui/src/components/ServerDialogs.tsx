// Desktop: Server-Verbindungen – Liste, „Mit Server verbinden“, „Auf Server hochladen“.
import { useEffect, useState, type FormEvent } from 'react';
import { errorMessage } from '../lib/api';
import type { DesktopBridge, ServerInfo } from '../lib/desktop';
import { texts } from '../texts';
import { Banner, Button, Field, Modal, TextInput } from './ui';

const t = texts.servers;

/** http:// zu einem anderen Rechner → Warnung (gleiche Regel wie im Main-Prozess) */
export function insecureUrl(url: string): boolean {
  const text = /^[a-z]+:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
  try {
    const u = new URL(text);
    return u.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  } catch {
    return false;
  }
}

export function useServers(desktop: DesktopBridge): ServerInfo[] {
  const [servers, setServers] = useState<ServerInfo[]>([]);
  useEffect(() => {
    const load = () => desktop.servers.list().then(setServers, () => undefined);
    void load();
    return desktop.servers.onChanged(() => void load());
  }, [desktop]);
  return servers;
}

/** Abschnitt im Startfenster: gespeicherte Server öffnen/entfernen, neu verbinden. */
export function ServersSection({ desktop, connectRequest }: { desktop: DesktopBridge; connectRequest: number }) {
  const servers = useServers(desktop);
  const [connecting, setConnecting] = useState(connectRequest > 0);
  const [lastRequest, setLastRequest] = useState(connectRequest);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  if (connectRequest !== lastRequest) {
    setLastRequest(connectRequest);
    setConnecting(true);
  }
  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  return (
    <section aria-label={t.title}>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t.title}</h2>
        <div className="flex-1" />
        <Button variant="ghost" onClick={() => setConnecting(true)}>
          ＋ {t.connect}
        </Button>
      </div>
      {error && <Banner tone="error">{error}</Banner>}
      {servers.length === 0 ? (
        <p className="text-sm text-slate-500">{t.empty}</p>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900" data-testid="servers">
          {servers.map((server) => (
            <li key={server.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => void run(() => desktop.servers.open(server.id))}>
                <div className="text-sm font-medium">{server.label}</div>
                <div className="truncate text-xs text-slate-500">
                  {server.url}
                  {server.insecure && <span className="ml-2 text-amber-700 dark:text-amber-300">⚠ {t.insecureShort}</span>}
                </div>
              </button>
              <Button variant="primary" onClick={() => void run(() => desktop.servers.open(server.id))}>
                {t.open}
              </Button>
              {confirmRemove === server.id ? (
                <>
                  <Button variant="danger" onClick={() => void run(() => desktop.servers.remove(server.id))}>
                    {t.removeConfirm}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmRemove(null)}>
                    {texts.common.cancel}
                  </Button>
                </>
              ) : (
                <Button variant="ghost" aria-label={`${t.remove}: ${server.label}`} onClick={() => setConfirmRemove(server.id)}>
                  {t.remove}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {connecting && <ConnectServerDialog desktop={desktop} onClose={() => setConnecting(false)} />}
    </section>
  );
}

export function ConnectServerDialog({ desktop, onClose }: { desktop: DesktopBridge; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const server = await desktop.servers.add({ url, key, label });
      onClose();
      await desktop.servers.open(server.id);
    } catch (err) {
      setError(errorMessage(err).replace(/^Error invoking remote method '[^']+': (Server)?Error: /, ''));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={t.connectTitle} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">{t.connectIntro}</p>
        <Field label={t.url}>
          <TextInput value={url} placeholder="https://steckplan.example.de" autoFocus onChange={(e) => setUrl(e.target.value)} />
        </Field>
        {url && insecureUrl(url) && <Banner tone="warn">{t.insecure}</Banner>}
        <Field label={t.key} hint={t.keyHint}>
          <TextInput type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
        </Field>
        <Field label={t.label}>
          <TextInput value={label} placeholder={t.labelPlaceholder} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        {error && <Banner tone="error">{error}</Banner>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{texts.common.cancel}</Button>
          <Button type="submit" variant="primary" disabled={busy || !url.trim() || !key.trim()}>
            {busy ? t.checking : t.connectButton}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Lokales Projekt auf einen gespeicherten Server hochladen. */
export function UploadToServerDialog({ desktop, projectId, onClose }: { desktop: DesktopBridge; projectId: string; onClose: () => void }) {
  const servers = useServers(desktop);
  const [selected, setSelected] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const target = selected || servers[0]?.id || '';
  return (
    <Modal title={t.uploadTitle} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">{t.uploadIntro}</p>
        {servers.length === 0 ? (
          <Banner tone="info">{t.uploadNoServers}</Banner>
        ) : (
          <div className="space-y-1" role="radiogroup" aria-label={t.title}>
            {servers.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input type="radio" name="upload-server" checked={target === s.id} onChange={() => setSelected(s.id)} />
                <span className="font-medium">{s.label}</span>
                <span className="text-xs text-slate-500">{s.url}</span>
              </label>
            ))}
          </div>
        )}
        {error && <Banner tone="error">{error}</Banner>}
        {done && <Banner tone="success">{t.uploaded}</Banner>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{done ? texts.common.close : texts.common.cancel}</Button>
          {!done && (
            <Button
              variant="primary"
              disabled={busy || !target}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await desktop.uploadToServer(projectId, target);
                  setDone(true);
                } catch (err) {
                  setError(errorMessage(err).replace(/^Error invoking remote method '[^']+': (Server)?Error: /, ''));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? t.uploading : t.upload}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
