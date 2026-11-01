// Weboberfläche per QR & Handy: zusätzlicher Zugang im lokalen Netz auf einer gewählten IPv4-Adresse.
// Ohne gesetzte Passwörter ist keine Anmeldung möglich; Passwörter liegen nur als Hash in den Einstellungen.
import { networkInterfaces } from 'node:os';
import {
  hashForStorage,
  PasswordChecker,
  qrCodeSvg,
  startExtraListener,
  type ConnectedPerson,
  type ExtraListener,
  type SteckplanServer,
} from '@steckplan/server';
import { isValidPort, type SettingsStore } from './settings';

export const LOOPBACK = '127.0.0.1';

export interface NetworkAddress {
  name: string;
  address: string;
}

export interface WebAccessStatus {
  running: boolean;
  url: string | null;
  qrSvg: string | null;
  /** eingestellter Port */
  port: number;
  /** tatsächlich genutzter Port (weicht ab, wenn der eingestellte belegt war) */
  actualPort: number | null;
  address: string | null;
  interfaces: NetworkAddress[];
  hasPasswords: boolean;
  people: ConnectedPerson[];
}

/** IPv4-Adressen der Netzwerkkarten (ohne interne) und zuletzt „nur dieser Rechner“. */
export function listAddresses(): NetworkAddress[] {
  const result: NetworkAddress[] = [];
  for (const [name, entries] of Object.entries(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) result.push({ name, address: entry.address });
    }
  }
  result.push({ name: 'Nur dieser Rechner', address: LOOPBACK });
  return result;
}

export class WebAccess {
  private listener: ExtraListener | null = null;
  private url: string | null = null;
  private qr: string | null = null;
  private checker: PasswordChecker | null;

  constructor(
    private readonly server: SteckplanServer,
    private readonly settings: SettingsStore,
  ) {
    const { edit, read } = settings.webAccess;
    this.checker = edit && read ? new PasswordChecker({ stored: { edit, read } }) : null;
  }

  /** Für den eingebetteten Server: Anmeldung nur, solange die Weboberfläche läuft. */
  readonly passwords = (): PasswordChecker | null => (this.listener ? this.checker : null);

  get running(): boolean {
    return this.listener !== null;
  }

  status(): WebAccessStatus {
    const interfaces = listAddresses();
    const saved = this.settings.webAccess.address;
    return {
      running: this.running,
      url: this.url,
      qrSvg: this.qr,
      port: this.settings.webAccess.port,
      actualPort: this.listener?.port ?? null,
      address: this.listener?.host ?? (saved && interfaces.some((i) => i.address === saved) ? saved : (interfaces[0]?.address ?? null)),
      interfaces,
      hasPasswords: this.checker !== null,
      people: this.running ? this.server.connectedPeople() : [],
    };
  }

  async setPasswords(input: unknown): Promise<void> {
    const { edit, read } = (input ?? {}) as { edit?: unknown; read?: unknown };
    if (typeof edit !== 'string' || typeof read !== 'string' || !edit || !read) {
      throw new Error('Bitte beide Passwörter eingeben.');
    }
    if (edit.normalize('NFC') === read.normalize('NFC')) throw new Error('Bearbeiten- und Lese-Passwort müssen sich unterscheiden.');
    const stored = { edit: hashForStorage(edit), read: hashForStorage(read) };
    await this.settings.updateWebAccess(stored);
    this.checker = new PasswordChecker({ stored });
    // Wer mit den alten Passwörtern angemeldet ist, wird abgemeldet.
    this.server.endSessions((s) => s.via === 'browser', 'Die Passwörter wurden geändert.');
  }

  async setPort(port: unknown): Promise<void> {
    if (!isValidPort(port)) throw new Error('Bitte einen Port zwischen 1024 und 65535 eingeben.');
    await this.settings.updateWebAccess({ port });
  }

  async start(address: unknown): Promise<WebAccessStatus> {
    if (!this.checker) throw new Error('Bitte zuerst die Passwörter festlegen.');
    const host = typeof address === 'string' ? address : this.status().address;
    if (!host || !listAddresses().some((a) => a.address === host)) throw new Error('Diese Netzwerkadresse ist nicht (mehr) verfügbar.');
    await this.stop();
    this.listener = await startExtraListener(this.server.app, host, this.settings.webAccess.port);
    this.url = `http://${host}:${this.listener.port}/`;
    this.qr = await qrCodeSvg(this.url);
    await this.settings.updateWebAccess({ address: host });
    return this.status();
  }

  async stop(): Promise<void> {
    if (!this.listener) return;
    const listener = this.listener;
    this.listener = null;
    this.url = null;
    this.qr = null;
    this.server.endSessions((s) => s.via === 'browser', 'Die Weboberfläche wurde beendet.');
    await listener.close();
  }

  disconnect(sessionId: unknown): void {
    if (typeof sessionId !== 'string') return;
    this.server.endSessions((s) => s.id === sessionId && s.via === 'browser', 'Vom Desktop getrennt.');
  }
}
