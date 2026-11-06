// OSC-Empfang (UDP): Einstellungen (an/aus, Port) in einer Datei, Empfänger, der Befehle an die Vorstellungen gibt.
import dgram from 'node:dgram';
import { readFile } from 'node:fs/promises';
import type { RemoteCommand } from '@steckplan/core';
import { writeFileAtomic } from '../storage/fs-utils';
import { oscToCommand, parseOsc } from './osc';

export interface OscSettings {
  enabled: boolean;
  port: number;
}

export interface OscStatus {
  listening: boolean;
  port?: number;
  error?: string;
  /** letzter erkannter Befehl (zur Kontrolle beim Einrichten) */
  last?: { address: string; at: string };
}

export const OSC_DEFAULTS: OscSettings = { enabled: false, port: 8000 };

export function validPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1024 && value <= 65535;
}

export class OscSettingsStore {
  private data: OscSettings = { ...OSC_DEFAULTS };

  constructor(private readonly file?: string) {}

  async load(): Promise<void> {
    if (!this.file) return;
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8')) as Partial<OscSettings>;
      this.data = { enabled: raw.enabled === true, port: validPort(raw.port) ? raw.port : OSC_DEFAULTS.port };
    } catch {
      // keine Datei: Standard
    }
  }

  get settings(): OscSettings {
    return { ...this.data };
  }

  async update(patch: Partial<OscSettings>): Promise<OscSettings> {
    this.data = { ...this.data, ...patch };
    if (this.file) await writeFileAtomic(this.file, JSON.stringify(this.data, null, 2));
    return this.settings;
  }
}

export class OscListener {
  private socket: dgram.Socket | null = null;
  private state: OscStatus = { listening: false };

  constructor(
    private readonly onCommand: (command: RemoteCommand, address: string) => void,
    private readonly log: { info: (msg: string) => void; warn: (msg: string) => void },
  ) {}

  get status(): OscStatus {
    return { ...this.state };
  }

  /** Einstellungen anwenden: starten, neu starten (anderer Port) oder beenden */
  async apply(settings: OscSettings): Promise<OscStatus> {
    await this.close();
    if (!settings.enabled) return this.status;
    const socket = dgram.createSocket('udp4');
    socket.on('message', (msg) => this.handle(msg));
    await new Promise<void>((resolve) => {
      socket.once('error', (error) => {
        this.state = { listening: false, error: error.message };
        this.log.warn(`OSC: Port ${settings.port} nicht verfügbar – ${error.message}`);
        socket.close();
        resolve();
      });
      socket.bind(settings.port, () => {
        this.socket = socket;
        socket.unref(); // hält den Prozess nicht am Leben
        socket.on('error', (error) => this.log.warn(`OSC: ${error.message}`));
        this.state = { listening: true, port: settings.port };
        this.log.info(`OSC: empfange auf UDP-Port ${settings.port}`);
        resolve();
      });
    });
    return this.status;
  }

  async close(): Promise<void> {
    const socket = this.socket;
    this.socket = null;
    this.state = { listening: false };
    if (socket) await new Promise<void>((resolve) => socket.close(() => resolve()));
  }

  private handle(msg: Buffer): void {
    let messages;
    try {
      messages = parseOsc(msg);
    } catch {
      return; // kein gültiges OSC
    }
    for (const message of messages) {
      const command = oscToCommand(message);
      if (!command) continue;
      this.state = { ...this.state, last: { address: message.address, at: new Date().toISOString() } };
      this.onCommand(command, message.address);
    }
  }
}
