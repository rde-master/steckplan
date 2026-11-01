import { useEffect, useState, type FormEvent } from 'react';
import { formatAppTitle, type HealthInfo } from '@steckplan/core';
import { errorMessage } from '../lib/api';
import type { DesktopBridge, RecentFile } from '../lib/desktop';
import { useSession } from '../lib/session';
import { texts } from '../texts';
import { Banner, Button, Field, Spinner, TextInput } from '../components/ui';
import { WebAccessDialog } from '../components/WebAccessDialog';

export function DesktopStartPage({ desktop }: { desktop: DesktopBridge }) {
  const [name, setName] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentFile[]>([]);
  const [version, setVersion] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [showWeb, setShowWeb] = useState(false);

  useEffect(() => desktop.onMenuCommand((command) => command === 'webAccess' && setShowWeb(true)), [desktop]);

  useEffect(() => {
    desktop.getSettings().then((s) => setName(s.name), (err: unknown) => setError(errorMessage(err)));
    const loadRecent = () => desktop.listRecent().then(setRecent, () => undefined);
    void loadRecent();
    fetch('/api/health')
      .then((r) => r.json() as Promise<HealthInfo>)
      .then((h) => setVersion(h.version), () => undefined);
    return desktop.onRecentChanged(() => void loadRecent());
  }, [desktop]);

  if (name === null) return <Spinner />;
  if (!name) return <NamePrompt desktop={desktop} onSaved={setName} />;

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-slate-50 dark:bg-slate-950">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
        <div className="flex items-center gap-3">
          <img src="/icon.svg" alt="" className="h-12 w-12" />
          <div>
            <h1 className="text-xl font-semibold">{texts.app.name}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{texts.app.tagline}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => void run(() => desktop.newProject())}>
            {texts.desktop.newProject}
          </Button>
          <Button onClick={() => void run(() => desktop.openProject())}>{texts.desktop.openProject}</Button>
          <Button variant="ghost" onClick={() => void run(() => desktop.openLibrary())}>
            {texts.desktop.library}
          </Button>
          <Button variant="ghost" onClick={() => setShowWeb(true)}>
            {texts.webAccess.title}
          </Button>
        </div>
        {showWeb && <WebAccessDialog desktop={desktop} onClose={() => setShowWeb(false)} />}
        {error && <Banner tone="error">{error}</Banner>}
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{texts.desktop.recent}</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-slate-500">{texts.desktop.recentEmpty}</p>
          ) : (
            <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900">
              {recent.map((file) => (
                <li key={file.path}>
                  <button
                    type="button"
                    disabled={!file.exists}
                    onClick={() => void run(() => desktop.openRecent(file.path))}
                    className="w-full px-4 py-2 text-left hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-slate-800"
                  >
                    <div className="text-sm font-medium">{file.name}</div>
                    <div className="truncate text-xs text-slate-500">
                      {file.exists ? file.path : `${texts.desktop.missing}: ${file.path}`}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <SettingsSection desktop={desktop} name={name} onSaved={setName} />
      </main>
      <footer className="px-6 py-2 text-right text-xs text-slate-400">{version && formatAppTitle(version)}</footer>
    </div>
  );
}

function NamePrompt({ desktop, onSaved }: { desktop: DesktopBridge; onSaved: (name: string) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const refresh = useSession((s) => s.refresh);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const settings = await desktop.setName(value);
      await refresh();
      onSaved(settings.name);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-slate-100 p-4 dark:bg-slate-950">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <img src="/icon.svg" alt="" className="h-10 w-10" />
          <h1 className="text-lg font-semibold">{texts.desktop.welcome}</h1>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">{texts.desktop.askName}</p>
        <Field label={texts.desktop.yourName}>
          <TextInput value={value} onChange={(e) => setValue(e.target.value)} maxLength={40} autoFocus required />
        </Field>
        {error && <Banner tone="error">{error}</Banner>}
        <Button type="submit" variant="primary" className="w-full" disabled={!value.trim()}>
          {texts.desktop.continue}
        </Button>
      </form>
    </div>
  );
}

function SettingsSection({ desktop, name, onSaved }: { desktop: DesktopBridge; name: string; onSaved: (name: string) => void }) {
  const [value, setValue] = useState(name);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useSession((s) => s.refresh);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{texts.desktop.settings}</h2>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setMessage(null);
          setError(null);
          try {
            const settings = await desktop.setName(value);
            await refresh();
            onSaved(settings.name);
            setMessage(texts.desktop.nameSaved);
          } catch (err) {
            setError(errorMessage(err));
          }
        }}
      >
        <div className="min-w-48 flex-1">
          <Field label={texts.desktop.yourName}>
            <TextInput value={value} onChange={(e) => setValue(e.target.value)} maxLength={40} required />
          </Field>
        </div>
        <Button type="submit" disabled={!value.trim() || value.trim() === name}>
          {texts.common.save}
        </Button>
      </form>
      {message && <div className="mt-2"><Banner tone="success">{message}</Banner></div>}
      {error && <div className="mt-2"><Banner tone="error">{error}</Banner></div>}
    </section>
  );
}
