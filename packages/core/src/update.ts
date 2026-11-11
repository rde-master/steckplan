// Hinweis auf eine neue Version: Steckplan und der Steckplan Player fragen beim Start einmal bei GitHub nach der
// neuesten veröffentlichten Version (nur Lesen der öffentlichen Angabe, es werden keine Daten übermittelt).
// Installiert wird nichts von selbst – angezeigt wird ein Hinweis mit dem Weg zum Download.

/** Öffentliche Angabe zur neuesten Veröffentlichung */
export const LATEST_RELEASE_API = 'https://api.github.com/repos/rde-master/steckplan/releases/latest';
/** Nur Adressen unter diesem Anfang werden als Download-Seite angenommen */
export const RELEASES_PREFIX = 'https://github.com/rde-master/steckplan/releases';

export interface UpdateInfo {
  /** neue Version, z. B. „0.48.0“ */
  version: string;
  /** Seite der Veröffentlichung (Download) */
  url: string;
}

/** „v0.47.1“ bzw. „0.47.1“ → [0, 47, 1]; alles andere (auch Vorabversionen wie „1.0.0-rc1“) → null */
export function parseVersion(text: string): [number, number, number] | null {
  const m = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/.exec(text.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Ist candidate neuer als current? Unlesbare Angaben gelten nie als neuer. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i]! !== b[i]!) return a[i]! > b[i]!;
  }
  return false;
}

/** Antwort von GitHub prüfen: nur fertige Veröffentlichungen, nur neuere Versionen, nur die eigene Download-Seite */
export function parseLatestRelease(raw: unknown, current: string): UpdateInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const release = raw as Record<string, unknown>;
  if (release.draft === true || release.prerelease === true) return null;
  const tag = typeof release.tag_name === 'string' ? release.tag_name : '';
  const parsed = parseVersion(tag);
  if (!parsed || !isNewerVersion(tag, current)) return null;
  const url = typeof release.html_url === 'string' && release.html_url.startsWith(`${RELEASES_PREFIX}/`) ? release.html_url : `${RELEASES_PREFIX}/latest`;
  return { version: parsed.join('.'), url };
}

type FetchLike = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/**
 * Gibt es eine neuere Version? Ohne Netz, bei Fehlern oder Zeitüberschreitung: null (kein Hinweis, keine Meldung).
 * url: nur für Tests eine andere Adresse.
 */
export async function checkForUpdate(current: string, fetchImpl: FetchLike, options: { url?: string; timeoutMs?: number } = {}): Promise<UpdateInfo | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);
  try {
    const response = await fetchImpl(options.url || LATEST_RELEASE_API, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Steckplan' }, signal: controller.signal });
    if (!response.ok) return null;
    return parseLatestRelease(await response.json(), current);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
