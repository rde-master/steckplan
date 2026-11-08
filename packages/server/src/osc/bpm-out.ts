// Tempo per OSC senden: Solange in der Vorstellung jemand führt, geht das gültige Tempo des aktuellen Punkts
// (manuell getappt vor gespeichert) als Text an das Lichtpult, z. B. /cmd "Master 3.1 At BPM 120".
// Gesendet wird nur bei einer Änderung (anderer Punkt, anderes Tempo, andere Einstellung).
import dgram from 'node:dgram';
import { bpmCommand, isArtNetHost, OSC_BPM_DEFAULTS } from '@steckplan/core';

export interface OscBpmConfig {
  enabled: boolean;
  host: string;
  port: number;
  address: string;
  command: string;
}

export interface OscOut {
  send(packet: Uint8Array, host: string, port: number): void;
  close(): void;
}

function padded(text: string): Buffer {
  const raw = Buffer.from(`${text}\0`, 'utf8');
  return Buffer.concat([raw, Buffer.alloc((4 - (raw.length % 4)) % 4)]);
}

/** OSC-Nachricht mit Text- (s), Ganzzahl- (i) bzw. Kommazahl-Argumenten (f) */
export function encodeOsc(address: string, args: (string | number)[]): Uint8Array {
  const tags = `,${args.map((a) => (typeof a === 'string' ? 's' : Number.isInteger(a) ? 'i' : 'f')).join('')}`;
  const parts = [padded(address), padded(tags)];
  for (const a of args) {
    if (typeof a === 'string') parts.push(padded(a));
    else {
      const b = Buffer.alloc(4);
      if (Number.isInteger(a)) b.writeInt32BE(a);
      else b.writeFloatBE(a);
      parts.push(b);
    }
  }
  return new Uint8Array(Buffer.concat(parts));
}

/** UDP-Sender; das Socket entsteht erst beim ersten Paket */
export function udpOscOut(onError: (message: string) => void = () => undefined): OscOut {
  let socket: dgram.Socket | null = null;
  const open = (): dgram.Socket => {
    const s = dgram.createSocket('udp4');
    s.on('error', (error) => onError(error.message));
    s.on('listening', () => s.setBroadcast(true));
    s.bind();
    s.unref();
    return s;
  };
  return {
    send(packet, host, port) {
      socket ??= open();
      socket.send(packet, port, host, (error) => {
        if (error) onError(error.message);
      });
    },
    close() {
      socket?.close();
      socket = null;
    },
  };
}

/** Einstellung aus dem Dokument prüfen und mit Vorgaben ergänzen; ungültig/aus → undefined */
export function oscBpmConfig(raw: unknown): OscBpmConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Partial<OscBpmConfig>;
  if (r.enabled !== true || typeof r.host !== 'string' || !isArtNetHost(r.host)) return undefined;
  const port = typeof r.port === 'number' && Number.isInteger(r.port) && r.port >= 1 && r.port <= 65535 ? r.port : OSC_BPM_DEFAULTS.port;
  const address = typeof r.address === 'string' && r.address.startsWith('/') ? r.address.trim() : OSC_BPM_DEFAULTS.address;
  const command = typeof r.command === 'string' && r.command.trim() ? r.command : OSC_BPM_DEFAULTS.command;
  return { enabled: true, host: r.host.trim(), port, address, command };
}

export class BpmSender {
  private last = '';

  constructor(private readonly out: OscOut | undefined) {}

  /** Tempo des aktuellen Punkts (undefined: keins bzw. niemand führt); force sendet auch ohne Änderung */
  update(bpm: number | undefined, config: OscBpmConfig | undefined, force = false): string | null {
    if (!this.out || !config || bpm === undefined) {
      if (!force) this.last = '';
      return null;
    }
    const text = bpmCommand(config.command, bpm);
    const key = `${config.host}:${config.port}:${config.address}:${text}`;
    if (key === this.last && !force) return null;
    this.last = key;
    this.out.send(encodeOsc(config.address, [text]), config.host, config.port);
    return text;
  }
}
