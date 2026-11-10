// Steckplan Player: Kopplung und Zugang. Ein Player fragt an (Name, Gerätekennung) und zeigt einen vierstelligen
// Code; wer im Führen-Bildschirm „Zulassen“ drückt, gibt ihm einen dauerhaften Zugangsschlüssel (nur lesen, nur als
// Hash gespeichert). Den Schlüssel holt der Player einmal ab. Laufzeit-Stand (Lebenszeichen) nur im Speicher.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pairingCode, PLAYER_OFFLINE_MS, type PlayerPairingRequest, type PlayerReport, type PlayerStatus } from '@steckplan/core';
import { writeFileAtomic } from '../storage/fs-utils';

interface StoredPlayer {
  id: string;
  name: string;
  deviceId: string;
  tokenHash: string;
  pairedAt: string;
}

interface PendingPairing extends PlayerPairingRequest {
  deviceId: string;
  expiresAt: number;
  state: 'pending' | 'approved' | 'rejected';
  /** Klartext-Schlüssel bis zum Abholen */
  token?: string;
}

interface Runtime {
  lastSeen: number;
  address?: string;
  report?: PlayerReport;
  resync: boolean;
}

/** Offene Kopplungen gelten so lange */
export const PAIRING_TTL_MS = 10 * 60 * 1000;
export const PAIRING_MAX_PENDING = 20;
export const PLAYER_NAME_MAX = 60;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class PlayerStore {
  private players: StoredPlayer[] = [];
  private pairing = new Map<string, PendingPairing>();
  private runtime = new Map<string, Runtime>();
  private installId: string = randomUUID();
  private readonly file?: string;
  private readonly now: () => number;
  private pendingSave: Promise<void> = Promise.resolve();

  constructor(options: { file?: string; now?: () => number } = {}) {
    this.file = options.file;
    this.now = options.now ?? Date.now;
  }

  async load(): Promise<void> {
    if (!this.file) return;
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8')) as { serverId?: string; players?: StoredPlayer[] };
      if (typeof data.serverId === 'string' && data.serverId) this.installId = data.serverId;
      this.players = Array.isArray(data.players) ? data.players.filter((p) => typeof p.id === 'string' && typeof p.tokenHash === 'string') : [];
    } catch {
      this.players = [];
      await this.save();
    }
  }

  /** Dauerhafte Kennung dieser Installation (für die Suche) */
  get serverId(): string {
    return this.installId;
  }

  // ---------- Kopplung ----------

  /** Anfrage eines Players; dieselbe Gerätekennung bekommt dieselbe offene Anfrage zurück */
  request(nameInput: unknown, deviceIdInput: unknown, address?: string): { requestId: string; code: string } {
    this.expire();
    const name = typeof nameInput === 'string' ? nameInput.replace(/\s+/g, ' ').trim().slice(0, PLAYER_NAME_MAX) : '';
    const deviceId = typeof deviceIdInput === 'string' ? deviceIdInput.trim().slice(0, 64) : '';
    if (!name || !deviceId) throw new PlayerError('Name und Gerätekennung fehlen.', 400);
    const existing = [...this.pairing.values()].find((p) => p.deviceId === deviceId && p.state === 'pending');
    if (existing) {
      existing.expiresAt = this.now() + PAIRING_TTL_MS;
      return { requestId: existing.requestId, code: existing.code };
    }
    if ([...this.pairing.values()].filter((p) => p.state === 'pending').length >= PAIRING_MAX_PENDING) throw new PlayerError('Zu viele offene Kopplungen – bitte später erneut versuchen.', 429);
    const code = pairingCode(new Set([...this.pairing.values()].map((p) => p.code)));
    const entry: PendingPairing = {
      requestId: randomBytes(16).toString('base64url'),
      name,
      code,
      createdAt: new Date(this.now()).toISOString(),
      ...(address ? { address } : {}),
      deviceId,
      expiresAt: this.now() + PAIRING_TTL_MS,
      state: 'pending',
    };
    this.pairing.set(entry.requestId, entry);
    return { requestId: entry.requestId, code };
  }

  /** Stand der Anfrage (Player fragt nach); der Schlüssel wird genau einmal ausgegeben */
  poll(requestId: string): { state: 'pending' } | { state: 'approved'; token: string; playerId: string } | { state: 'rejected' } | null {
    this.expire();
    const entry = this.pairing.get(requestId);
    if (!entry) return null;
    if (entry.state === 'pending') return { state: 'pending' };
    this.pairing.delete(requestId);
    if (entry.state === 'rejected' || !entry.token) return { state: 'rejected' };
    const player = this.players.find((p) => p.deviceId === entry.deviceId);
    return player ? { state: 'approved', token: entry.token, playerId: player.id } : { state: 'rejected' };
  }

  pending(): PlayerPairingRequest[] {
    this.expire();
    return [...this.pairing.values()].filter((p) => p.state === 'pending').map(({ requestId, name, code, createdAt, address }) => ({ requestId, name, code, createdAt, ...(address ? { address } : {}) }));
  }

  /** Zulassen: Gerät bekommt einen (neuen) Schlüssel; ein schon gekoppeltes Gerät behält seine Kennung */
  async approve(requestId: string): Promise<StoredPlayer | null> {
    this.expire();
    const entry = this.pairing.get(requestId);
    if (!entry || entry.state !== 'pending') return null;
    const token = randomBytes(32).toString('base64url');
    const now = new Date(this.now()).toISOString();
    let player = this.players.find((p) => p.deviceId === entry.deviceId);
    if (player) Object.assign(player, { name: entry.name, tokenHash: hashToken(token), pairedAt: now });
    else {
      player = { id: randomUUID(), name: entry.name, deviceId: entry.deviceId, tokenHash: hashToken(token), pairedAt: now };
      this.players.push(player);
    }
    entry.state = 'approved';
    entry.token = token;
    // abholen innerhalb der Frist
    entry.expiresAt = this.now() + PAIRING_TTL_MS;
    await this.save();
    return player;
  }

  reject(requestId: string): boolean {
    const entry = this.pairing.get(requestId);
    if (!entry || entry.state !== 'pending') return false;
    entry.state = 'rejected';
    return true;
  }

  private expire(): void {
    const now = this.now();
    for (const [id, entry] of this.pairing) if (entry.expiresAt <= now) this.pairing.delete(id);
  }

  // ---------- Zugang ----------

  verify(token: string | undefined): { id: string; name: string; pairedAt: string } | null {
    if (!token) return null;
    const hash = hashToken(token);
    const player = this.players.find((p) => p.tokenHash === hash);
    return player ? { id: player.id, name: player.name, pairedAt: player.pairedAt } : null;
  }

  async remove(id: string): Promise<boolean> {
    const before = this.players.length;
    this.players = this.players.filter((p) => p.id !== id);
    this.runtime.delete(id);
    if (this.players.length === before) return false;
    await this.save();
    return true;
  }

  // ---------- Laufzeit ----------

  /** Lebenszeichen mit Stand; Antwort: soll neu synchronisiert werden? (wird damit abgeholt) */
  heartbeat(id: string, report: PlayerReport | null, address?: string): boolean {
    const current = this.runtime.get(id);
    const resync = current?.resync ?? false;
    this.runtime.set(id, { lastSeen: this.now(), ...(address ? { address } : {}), ...(report ? { report } : current?.report ? { report: current.report } : {}), resync: false });
    return resync;
  }

  /** Neue Synchronisierung anfordern (ein Player bzw. alle); false = unbekannt */
  requestResync(id?: string): boolean {
    const ids = id ? this.players.filter((p) => p.id === id).map((p) => p.id) : this.players.map((p) => p.id);
    for (const playerId of ids) {
      const current = this.runtime.get(playerId);
      this.runtime.set(playerId, { lastSeen: current?.lastSeen ?? 0, ...(current?.address ? { address: current.address } : {}), ...(current?.report ? { report: current.report } : {}), resync: true });
    }
    return ids.length > 0;
  }

  status(): PlayerStatus[] {
    const now = this.now();
    return this.players
      .map((p) => {
        const r = this.runtime.get(p.id);
        const online = !!r && r.lastSeen > 0 && now - r.lastSeen < PLAYER_OFFLINE_MS;
        return {
          id: p.id,
          name: p.name,
          pairedAt: p.pairedAt,
          online,
          ...(r && r.lastSeen > 0 ? { lastSeen: new Date(r.lastSeen).toISOString() } : {}),
          ...(r?.address ? { address: r.address } : {}),
          ...(r?.report ? { report: r.report } : {}),
          resyncPending: r?.resync ?? false,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  async flush(): Promise<void> {
    await this.pendingSave;
  }

  private save(): Promise<void> {
    if (!this.file) return Promise.resolve();
    const file = this.file;
    const data = JSON.stringify({ serverId: this.installId, players: this.players }, null, 2);
    this.pendingSave = this.pendingSave.then(() => writeFileAtomic(file, data)).catch(() => undefined);
    return this.pendingSave;
  }
}

export class PlayerError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'PlayerError';
  }
}
