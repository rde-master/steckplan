import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadWithReload } from './lazyPage';

/** sessionStorage gibt es unter Node nicht – einfacher Ersatz */
function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) } as unknown as Storage;
}

afterEach(() => vi.unstubAllGlobals());

describe('Seiten bei Bedarf laden', () => {
  it('liefert die geladene Seite', async () => {
    await expect(loadWithReload(() => Promise.resolve('Seite'))).resolves.toBe('Seite');
  });

  it('lädt nach einem Fehler einmal neu (neue Version auf dem Server), beim zweiten Fehler kurz danach nicht mehr', async () => {
    vi.stubGlobal('sessionStorage', fakeStorage());
    const reload = vi.fn();
    const failing = () => Promise.reject(new Error('Failed to fetch dynamically imported module'));
    let settled = false;
    void loadWithReload(failing, () => 100_000, reload).finally(() => (settled = true));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(reload).toHaveBeenCalledTimes(1);
    // bis zum Neuladen bleibt die Seite offen (kein Fehlerbild)
    expect(settled).toBe(false);
    // direkt nach dem Neuladen wieder ein Fehler: nicht in einer Schleife neu laden
    await expect(loadWithReload(failing, () => 105_000, reload)).rejects.toThrow('Failed to fetch');
    expect(reload).toHaveBeenCalledTimes(1);
    // später (anderes Update) wieder
    void loadWithReload(failing, () => 200_000, reload);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('ohne Speicher (privater Modus): kein Neuladen, der Fehler wird gezeigt', async () => {
    const reload = vi.fn();
    await expect(loadWithReload(() => Promise.reject(new Error('weg')), () => 100_000, reload)).rejects.toThrow('weg');
    expect(reload).not.toHaveBeenCalled();
  });
});
