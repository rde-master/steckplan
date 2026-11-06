// Lese-Schlüssel des Projekts (QR-Code auf den Etiketten) und die öffentliche Adresse dazu –
// gemeinsam für den Etiketten-Export und den Link zur persönlichen Helfer-Seite.
import { api } from './api';
import { getDesktop } from './desktop';
import { texts } from '../texts';

export type ShareInfo = { ok: true; base: string; token: string; hint: string } | { ok: false; reason: string };

/** Adresse und Schlüssel ermitteln; mit create legt Bearbeiten den Schlüssel bei Bedarf an */
export async function resolveShare(projectId: string, create: boolean): Promise<ShareInfo> {
  const settings = await api.getLabelQr().catch(() => null);
  if (!settings?.enabled) return { ok: false, reason: texts.labelQr.exportOff };
  const desktop = getDesktop();
  const base = (settings.baseUrl || (desktop ? ((await desktop.webAccess.status().catch(() => null))?.url ?? '') : window.location.origin)).replace(/\/+$/, '');
  if (!base) return { ok: false, reason: texts.labelQr.exportNoAddress };
  let share = await api.getShare(projectId).catch(() => null);
  if (!share && create) share = await api.ensureShare(projectId).catch(() => null);
  if (!share) return { ok: false, reason: texts.labelQr.exportNoKey };
  return { ok: true, base, token: share.token, hint: settings.hint };
}

/** Link zur persönlichen Helfer-Seite einer Person (ohne Passwort, nur für sich selbst eintragen) */
export function personLink(share: { base: string; token: string }, personId: string): string {
  return `${share.base}/s/${share.token}?p=${encodeURIComponent(personId)}`;
}
