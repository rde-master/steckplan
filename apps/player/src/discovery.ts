// Suche nach der Steuersoftware: UDP-Rundruf an alle Netze (und an diesen Rechner), Antworten sammeln.
import dgram from 'node:dgram';
import { networkInterfaces } from 'node:os';
import { DISCOVERY_PORT, DISCOVERY_REQUEST, parseDiscoveryReply, type DiscoveryReply } from '@steckplan/core';

export interface FoundServer extends DiscoveryReply {
  host: string;
}

/** Rundruf-Adresse eines Netzes (IPv4 + Netzmaske) */
export function broadcastAddress(address: string, netmask: string): string | null {
  const a = address.split('.').map(Number);
  const m = netmask.split('.').map(Number);
  if (a.length !== 4 || m.length !== 4 || [...a, ...m].some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return null;
  return a.map((x, i) => (x & m[i]!) | (~m[i]! & 255)).join('.');
}

/** Wohin gerufen wird: alle Netze dieses Rechners, das allgemeine Rundruf-Ziel und dieser Rechner selbst */
export function discoveryTargets(interfaces: ReturnType<typeof networkInterfaces> = networkInterfaces()): string[] {
  const targets = new Set<string>(['255.255.255.255', '127.0.0.1']);
  for (const entries of Object.values(interfaces)) {
    for (const e of entries ?? []) {
      if (e.family !== 'IPv4' || e.internal) continue;
      const b = broadcastAddress(e.address, e.netmask);
      if (b) targets.add(b);
    }
  }
  return [...targets];
}

export class DiscoveryClient {
  private socket: dgram.Socket | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly onFound: (server: FoundServer) => void,
    private readonly port = DISCOVERY_PORT,
  ) {}

  /** Rufen alle intervalMs, bis stop() */
  async start(intervalMs = 2000): Promise<void> {
    if (this.socket) return;
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    socket.on('message', (msg, rinfo) => {
      const reply = parseDiscoveryReply(msg.toString('utf8'));
      if (reply) this.onFound({ ...reply, host: rinfo.address });
    });
    socket.on('error', () => undefined);
    await new Promise<void>((resolve) => socket.bind(0, () => resolve()));
    socket.setBroadcast(true);
    this.socket = socket;
    const call = () => {
      for (const target of discoveryTargets()) socket.send(DISCOVERY_REQUEST, this.port, target, () => undefined);
    };
    call();
    this.timer = setInterval(call, intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.socket?.close();
    this.socket = null;
  }
}

/** „192.168.1.20:8080“, „http://host:port“ → Adresse (ohne Port: 8080) */
export function parseAddress(text: string): { host: string; port: number } | null {
  const trimmed = text.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  const m = /^(\[[^\]]+\]|[^:]+)(?::(\d{1,5}))?$/.exec(trimmed);
  if (!m) return null;
  const port = m[2] ? Number(m[2]) : 8080;
  if (port < 1 || port > 65535) return null;
  return { host: m[1]!.replace(/^\[|\]$/g, ''), port };
}
