// Netzprüfung des Steckplan Players: was der Player-Rechner über seine Verbindung weiß (WLAN, Signal, Band,
// Energiesparen des WLAN-Adapters, Akku) und wie schnell die Steuersoftware antwortet – bewertet als Liste von
// Prüfungen (gut / Hinweis / Problem) mit Tipp. Angezeigt vor dem ersten Verbinden (Statusseite), auf „Bereit“ und
// im Führen-Bildschirm beim Player.

export type CheckState = 'ok' | 'warn' | 'bad';

export interface NetCheck {
  id: 'network' | 'link' | 'signal' | 'band' | 'powersave' | 'battery' | 'latency';
  state: CheckState;
  /** was geprüft wurde und das Ergebnis, z. B. „WLAN-Signal 82 %“ */
  text: string;
  /** was zu tun ist (nur bei Hinweis/Problem) */
  tip?: string;
}

/** Messung der Laufzeit zur Steuersoftware (mehrere Anfragen hintereinander) */
export interface LatencySample {
  /** gesendet / beantwortet */
  sent: number;
  answered: number;
  avgMs?: number;
  maxMs?: number;
}

export interface NetFacts {
  connected: boolean;
  /** per Kabel angeschlossen (Ethernet mit Adresse) */
  wired: boolean;
  /** Name des WLANs (wenn per WLAN verbunden) */
  wifi?: string;
  /** Signalstärke 0–100 % */
  signal?: number;
  /** Frequenzband in GHz (2.4, 5, 6) */
  bandGHz?: number;
  /** Energiesparmodus des WLAN-Adapters (Windows): 0 = Höchstleistung … 3 = maximal sparen; am Netzteil / im Akku */
  powerSaveAc?: number;
  powerSaveDc?: number;
  /** läuft auf Akku */
  battery?: boolean;
  latency?: LatencySample;
}

export const SIGNAL_OK = 70;
export const SIGNAL_BAD = 50;
export const LATENCY_OK_MS = 30;
export const LATENCY_BAD_MS = 150;

/** Kanal → Band (bis 14: 2,4 GHz; sonst 5 GHz – 6 GHz meldet das System selbst) */
export function bandOfChannel(channel: number): number {
  return channel <= 14 ? 2.4 : 5;
}

/** Signal in dBm (macOS) → Prozent wie Windows (-100 dBm = 0 %, -50 dBm = 100 %) */
export function dbmToPercent(dbm: number): number {
  return Math.max(0, Math.min(100, Math.round(2 * (dbm + 100))));
}

const POWER_SAVE_TIP = 'Energieoptionen → Erweiterte Einstellungen → „Drahtlosadapter“ → „Energiesparmodus“: „Höchstleistung“ (Netz und Akku). Im Geräte-Manager beim WLAN-Adapter unter „Energieverwaltung“ „Computer kann das Gerät ausschalten“ abwählen.';

export function evaluateNet(f: NetFacts): NetCheck[] {
  const checks: NetCheck[] = [];
  if (!f.connected) {
    checks.push({ id: 'network', state: 'bad', text: 'Kein Netzwerk', tip: 'WLAN verbinden bzw. Netzwerkkabel einstecken.' });
    return checks;
  }
  const onWifi = !!f.wifi && !f.wired;
  checks.push(
    f.wired
      ? { id: 'link', state: 'ok', text: f.wifi ? 'Netzwerkkabel (und WLAN)' : 'Netzwerkkabel' }
      : f.wifi
        ? { id: 'link', state: 'ok', text: `WLAN „${f.wifi}“` }
        : { id: 'link', state: 'ok', text: 'Netzwerk verbunden' },
  );
  if (onWifi && f.signal !== undefined) {
    const state: CheckState = f.signal >= SIGNAL_OK ? 'ok' : f.signal >= SIGNAL_BAD ? 'warn' : 'bad';
    checks.push({
      id: 'signal',
      state,
      text: `WLAN-Signal ${f.signal} %`,
      ...(state !== 'ok' ? { tip: 'Player näher an den WLAN-Router/Access Point stellen, Sichtverbindung schaffen (keine Metallteile, Wände, Menschenmengen dazwischen) oder einen eigenen Access Point bei der Bühne aufstellen.' } : {}),
    });
  }
  if (onWifi && f.bandGHz !== undefined) {
    const slow = f.bandGHz < 3;
    checks.push({
      id: 'band',
      state: slow ? 'warn' : 'ok',
      text: `Frequenzband ${String(f.bandGHz).replace('.', ',')} GHz`,
      ...(slow ? { tip: '2,4 GHz ist oft überfüllt und störanfällig (Handys des Publikums, Funkstrecken). Am Router ein eigenes 5-GHz-WLAN für die Technik einrichten und den Player damit verbinden.' } : {}),
    });
  }
  const saving = [f.powerSaveAc, f.battery ? f.powerSaveDc : undefined].filter((v): v is number => v !== undefined);
  if (onWifi && saving.length) {
    const on = saving.some((v) => v > 0);
    checks.push({ id: 'powersave', state: on ? 'warn' : 'ok', text: on ? 'Energiesparen des WLAN-Adapters ist an' : 'WLAN-Adapter auf Höchstleistung', ...(on ? { tip: POWER_SAVE_TIP } : {}) });
  }
  if (f.battery) checks.push({ id: 'battery', state: 'warn', text: 'Läuft auf Akku', tip: 'Netzteil anschließen – im Akkubetrieb sparen WLAN und Rechner Energie und reagieren verzögert.' });
  const l = f.latency;
  if (l && l.sent > 0) {
    const lost = l.sent - l.answered;
    const lossShare = lost / l.sent;
    const state: CheckState =
      l.answered === 0 || lossShare > 0.2 || (l.avgMs ?? 0) >= LATENCY_BAD_MS ? 'bad' : lost > 0 || (l.avgMs ?? 0) >= LATENCY_OK_MS || (l.maxMs ?? 0) >= LATENCY_BAD_MS ? 'warn' : 'ok';
    const parts = l.answered ? [`Ø ${l.avgMs} ms`, `max ${l.maxMs} ms`] : [];
    if (lost) parts.push(`${lost} von ${l.sent} ohne Antwort`);
    checks.push({
      id: 'latency',
      state,
      text: l.answered ? `Steuersoftware antwortet: ${parts.join(' · ')}` : 'Steuersoftware antwortet nicht',
      ...(state !== 'ok' ? { tip: 'Verbindung zur Steuersoftware schwankt: Steuerrechner möglichst per Kabel an den Router, Player näher an den Access Point, andere Geräte (Gäste, Streams) aus dem Technik-WLAN nehmen.' } : {}),
    });
  }
  return checks;
}

/** Schlechtester Zustand der Liste */
export function worstCheck(checks: Pick<NetCheck, 'state'>[]): CheckState {
  return checks.some((c) => c.state === 'bad') ? 'bad' : checks.some((c) => c.state === 'warn') ? 'warn' : 'ok';
}

/** Prüfungen aus einem Lebenszeichen lesen (Server: nur Bekanntes, gekürzt) */
export function parseNetChecks(raw: unknown): NetCheck[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ids = new Set<NetCheck['id']>(['network', 'link', 'signal', 'band', 'powersave', 'battery', 'latency']);
  const result: NetCheck[] = [];
  for (const c of raw.slice(0, 10)) {
    if (!c || typeof c !== 'object') continue;
    const v = c as Record<string, unknown>;
    if (!ids.has(v.id as NetCheck['id']) || (v.state !== 'ok' && v.state !== 'warn' && v.state !== 'bad') || typeof v.text !== 'string') continue;
    result.push({ id: v.id as NetCheck['id'], state: v.state, text: v.text.slice(0, 120), ...(typeof v.tip === 'string' && v.tip ? { tip: v.tip.slice(0, 600) } : {}) });
  }
  return result;
}
