// Laufzeit einer Live-Verbindung: jede Sekunde ein WebSocket-Ping (Browser antworten von selbst mit Pong), daraus
// Laufzeit hin und zurück, Schwankung und verlorene Pings. Dient der Anzeige im Führen-Bildschirm (Player-Stand)
// und dem Ausgleich der Verzögerung beim Weiterrechnen der Abspielposition. Beendet nichts (das macht keepAlive).
import type { WebSocket } from 'ws';
import type { PlayerLink } from '@steckplan/core';

export const LINK_INTERVAL_MS = 1000;
/** so viele Messungen zählen für Mittelwert, Höchstwert und Verluste (bei 1 s: die letzte halbe Minute) */
const WINDOW = 30;
/** ohne Pong so lange gilt ein Ping als verloren */
const LOST_AFTER_MS = 2000;

interface Sample {
  /** Nummer der Messung: ein Pong ohne bzw. mit fremder Nummer (keepAlive) zählt nicht */
  id: number;
  sentAt: number;
  rttMs?: number;
}

export class LinkMonitor {
  private readonly samples: Sample[] = [];
  private seq = 0;
  private lastPongAt = 0;
  private readonly startedAt: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly socket: WebSocket,
    intervalMs: number = LINK_INTERVAL_MS,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.startedAt = now();
    socket.on('pong', this.onPong);
    socket.once('close', () => this.stop());
    if (intervalMs <= 0) return;
    this.timer = setInterval(() => this.ping(), intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.socket.off('pong', this.onPong);
  }

  ping(): void {
    if (this.socket.readyState !== this.socket.OPEN) return;
    const id = ++this.seq;
    const payload = Buffer.alloc(4);
    payload.writeUInt32BE(id);
    this.samples.push({ id, sentAt: this.now() });
    if (this.samples.length > WINDOW) this.samples.shift();
    try {
      this.socket.ping(payload);
    } catch {
      // wird gerade geschlossen
    }
  }

  private readonly onPong = (data: Buffer): void => {
    if (!data || data.length !== 4) return;
    const id = data.readUInt32BE(0);
    const sample = this.samples.find((s) => s.id === id);
    if (!sample || sample.rttMs !== undefined) return;
    const at = this.now();
    sample.rttMs = Math.max(0, at - sample.sentAt);
    this.lastPongAt = at;
  };

  /** zuletzt gemessene Laufzeit (ms) */
  get rttMs(): number | undefined {
    for (let i = this.samples.length - 1; i >= 0; i--) if (this.samples[i]!.rttMs !== undefined) return this.samples[i]!.rttMs;
    return undefined;
  }

  /** Verzögerung in eine Richtung (Sekunden, geschätzt als halbe Laufzeit, Median der letzten Messungen) – 0 ohne Messung */
  oneWaySec(): number {
    const values = this.samples.flatMap((s) => (s.rttMs !== undefined ? [s.rttMs] : [])).slice(-9).sort((a, b) => a - b);
    if (!values.length) return 0;
    const median = values[Math.floor(values.length / 2)]!;
    return Math.min(0.5, median / 2000);
  }

  stats(): Omit<PlayerLink, 'leadRoom' | 'connections'> {
    const now = this.now();
    const measured = this.samples.flatMap((s) => (s.rttMs !== undefined ? [s.rttMs] : []));
    // verloren: ohne Antwort und lange genug her
    const lost = this.samples.filter((s) => s.rttMs === undefined && now - s.sentAt > LOST_AFTER_MS).length;
    const last = this.rttMs;
    return {
      ...(last !== undefined ? { rttMs: Math.round(last) } : {}),
      ...(measured.length ? { avgMs: Math.round(measured.reduce((a, b) => a + b, 0) / measured.length), maxMs: Math.round(Math.max(...measured)) } : {}),
      lost,
      samples: this.samples.length,
      // seit der letzten Antwort (bzw. seit dem Verbinden)
      silentMs: Math.round(now - (this.lastPongAt || this.startedAt)),
    };
  }
}
