import { describe, expect, it } from 'vitest';
import { checkForUpdate, isNewerVersion, LATEST_RELEASE_API, parseLatestRelease, parseVersion } from './update';

describe('Hinweis auf eine neue Version', () => {
  it('liest Versionen mit und ohne „v“, keine Vorabversionen', () => {
    expect(parseVersion('v0.47.1')).toEqual([0, 47, 1]);
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion('1.0.0-rc1')).toBeNull();
    expect(parseVersion('neueste')).toBeNull();
  });

  it('vergleicht nach Zahlen, nicht nach Text', () => {
    expect(isNewerVersion('0.47.0', '0.46.0')).toBe(true);
    expect(isNewerVersion('0.100.0', '0.99.9')).toBe(true);
    expect(isNewerVersion('1.0.0', '0.99.9')).toBe(true);
    expect(isNewerVersion('0.46.0', '0.46.0')).toBe(false);
    expect(isNewerVersion('0.45.9', '0.46.0')).toBe(false);
    expect(isNewerVersion('kaputt', '0.46.0')).toBe(false);
  });

  it('nimmt nur fertige, neuere Veröffentlichungen und nur die eigene Download-Seite', () => {
    const release = { tag_name: 'v0.48.0', html_url: 'https://github.com/rde-master/steckplan/releases/tag/v0.48.0' };
    expect(parseLatestRelease(release, '0.47.0')).toEqual({ version: '0.48.0', url: release.html_url });
    expect(parseLatestRelease(release, '0.48.0')).toBeNull();
    expect(parseLatestRelease({ ...release, prerelease: true }, '0.47.0')).toBeNull();
    expect(parseLatestRelease({ ...release, draft: true }, '0.47.0')).toBeNull();
    // fremde Adresse: nicht übernehmen, stattdessen die feste Seite
    expect(parseLatestRelease({ tag_name: 'v0.48.0', html_url: 'https://example.com/boese' }, '0.47.0')).toEqual({ version: '0.48.0', url: 'https://github.com/rde-master/steckplan/releases/latest' });
    expect(parseLatestRelease(null, '0.47.0')).toBeNull();
    expect(parseLatestRelease({ message: 'API rate limit exceeded' }, '0.47.0')).toBeNull();
  });

  it('fragt die öffentliche Angabe ab; Fehler, Ablehnung und Zeitüberschreitung ergeben keinen Hinweis', async () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const ok = (body: unknown) => (url: string, init: { headers: Record<string, string> }) => {
      seen.push({ url, headers: init.headers });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
    };
    await expect(checkForUpdate('0.47.0', ok({ tag_name: 'v0.47.1', html_url: 'https://github.com/rde-master/steckplan/releases/tag/v0.47.1' }))).resolves.toMatchObject({ version: '0.47.1' });
    expect(seen[0]!.url).toBe(LATEST_RELEASE_API);
    // nichts Persönliches in der Anfrage
    expect(seen[0]!.headers).toEqual({ Accept: 'application/vnd.github+json', 'User-Agent': 'Steckplan' });

    await expect(checkForUpdate('0.47.0', () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }))).resolves.toBeNull();
    await expect(checkForUpdate('0.47.0', () => Promise.reject(new Error('kein Netz')))).resolves.toBeNull();
    const hanging = (_url: string, init: { signal: AbortSignal }) => new Promise<never>((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('abgebrochen'))));
    await expect(checkForUpdate('0.47.0', hanging, { timeoutMs: 20 })).resolves.toBeNull();
  });
});
