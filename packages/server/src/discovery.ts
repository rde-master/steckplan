// Suche im Netz: Player rufen per UDP (Rundruf) „STECKPLAN-DISCOVER/1“, die Steuersoftware antwortet mit Kennung,
// Name und HTTP-Port. Antwortet nur, solange ein Port da ist (Desktop: nur mit laufender Weboberfläche).
import dgram from 'node:dgram';
import { hostname } from 'node:os';
import { DISCOVERY_PORT, DISCOVERY_REQUEST, VERSION, type DiscoveryReply, type ServerMode } from '@steckplan/core';

export interface DiscoveryOptions {
  /** Kennung der Installation */
  serverId: () => string;
  mode: ServerMode;
  /** HTTP-Port, unter dem Player die Oberfläche erreichen; null = gerade nicht antworten */
  port: () => number | null;
  /** UDP-Port (Tests: eigener) */
  udpPort?: number;
  /** Name in der Antwort (Standard: Rechnername) */
  name?: string;
  log?: { warn: (msg: string) => void };
}

export class DiscoveryResponder {
  private socket: dgram.Socket | null = null;

  constructor(private readonly options: DiscoveryOptions) {}

  get active(): boolean {
    return this.socket !== null && this.options.port() !== null;
  }

  /** Lauschen beginnen; belegter Port (z. B. zweite Steuersoftware auf dem Rechner) wird nur gemeldet */
  async start(): Promise<boolean> {
    if (this.socket) return true;
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    socket.on('message', (msg, rinfo) => {
      if (msg.toString('utf8').trim() !== DISCOVERY_REQUEST) return;
      const port = this.options.port();
      if (port === null) return;
      const reply: DiscoveryReply = { app: 'steckplan', v: 1, id: this.options.serverId(), name: this.options.name ?? hostname(), port, mode: this.options.mode, version: VERSION };
      socket.send(Buffer.from(JSON.stringify(reply)), rinfo.port, rinfo.address, () => undefined);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('error', reject);
        socket.bind(this.options.udpPort ?? DISCOVERY_PORT, () => {
          socket.off('error', reject);
          resolve();
        });
      });
    } catch (error) {
      this.options.log?.warn(`Suche für Player nicht möglich (UDP ${this.options.udpPort ?? DISCOVERY_PORT}): ${(error as Error).message}`);
      socket.close();
      return false;
    }
    socket.on('error', (error) => this.options.log?.warn(`Suche für Player: ${error.message}`));
    this.socket = socket;
    return true;
  }

  async close(): Promise<void> {
    const socket = this.socket;
    this.socket = null;
    if (socket) await new Promise<void>((resolve) => socket.close(() => resolve()));
  }
}
