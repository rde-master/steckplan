import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../lib/api';
import { navigate } from '../lib/router';
import { useSession } from '../lib/session';
import { texts } from '../texts';
import { Banner, Button, Field, TextInput } from '../components/ui';

const NAME_KEY = 'steckplan.loginName';

function readStoredName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function LoginPage({ next }: { next: string }) {
  const [name, setName] = useState(readStoredName);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setSession = useSession((s) => s.setSession);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await api.login(name, password);
      try {
        localStorage.setItem(NAME_KEY, name.trim());
      } catch {
        // egal
      }
      setSession(session);
      navigate(next, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-slate-100 p-4 dark:bg-slate-950">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <img src="/icon.png" alt="" className="h-10 w-10" />
          <div>
            <h1 className="text-lg font-semibold">{texts.app.name}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{texts.login.title}</p>
          </div>
        </div>
        <Field label={texts.login.name} hint={texts.login.nameHint}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" maxLength={40} required autoFocus={!name} />
        </Field>
        <Field label={texts.login.password} hint={texts.login.passwordHint}>
          <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required autoFocus={!!name} />
        </Field>
        {error && <Banner tone="error">{error}</Banner>}
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {texts.login.submit}
        </Button>
      </form>
    </div>
  );
}
