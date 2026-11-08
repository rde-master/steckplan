// Ein geöffnetes Projekt auf dem Server: Yjs-Dokument + verbundene Clients + Speichern/Versionen.
import { randomBytes } from 'node:crypto';
import type { WebSocket } from 'ws';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
import {
  CloseCode,
  analyzeProject,
  applyAnalysis,
  resetChecks as resetCheckMarks,
  setCheck,
  type CheckDirection,
  type CheckMark,
  buildSnapshots,
  can,
  finishProject,
  missingResolutions,
  projectUsage,
  createYDocFromProject,
  decodeCue,
  MESSAGE_CUE,
  type LeadInfo,
  DIRECTION_ROOTS,
  updateTouchesOnly,
  encodeInfo,
  MESSAGE_SYNC,
  readProjectFromYDoc,
  setHelperSignup,
  setHandover,
  type HandoverAction,
  addHelperMessage,
  readHelperMessage,
  removeHelperMessage,
  updateHelperMessage,
  type HelperMessage,
  type SignupPatch,
  writeProjectToYDoc,
  type Conflict,
  type PresenceUser,
  type Project,
  type Resolution,
  type Secrets,
  type RemoteCommand,
  type DeskCue,
  type ServerInfo,
  itemTempo,
} from '@steckplan/core';
import type { Session } from '../auth/sessions';
import type { LibraryChange, LibraryStore } from '../library/library-store';
import type { UsageTracker } from '../library/usage-tracker';
import type { ProjectStore } from '../storage/types';
import { ActivityTracker, STAMP_ORIGIN, type Actor } from './activity';
import { VERSION_INTERVAL_MS, type VersionInfo, type VersionStore } from '../storage/version-store';
import { ArtNetTimecode, type ArtNetConfig, type TimecodeSender } from './artnet';
import { BpmSender, oscBpmConfig, type OscOut } from '../osc/bpm-out';

export interface Connection {
  id: string;
  socket: WebSocket;
  session: Session;
}

export interface RoomLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export interface RoomDeps {
  store: ProjectStore;
  versions: VersionStore;
  library: LibraryStore;
  usage: UsageTracker;
  log: RoomLogger;
  saveDelayMs?: number;
  maxSaveDelayMs?: number;
  versionIntervalMs?: number;
  /** „Zuletzt geändert“: Bündelung der Stempel */
  stampDelayMs?: number;
  /** Änderungsprotokoll: Zeitfenster je Person */
  changeLogWindowMs?: number;
  /** Timecode per Art-Net (ohne: kein Senden) */
  artnet?: TimecodeSender;
  /** Tempo per OSC (ohne: kein Senden) */
  oscOut?: OscOut;
  /** Lichtpult: zuletzt gelaufene Cues (beim Verbinden mitgeschickt) */
  deskCues?: () => DeskCue[];
}

/** Herkunft für Änderungen, die der Server selbst schreibt (z. B. Wiederherstellen). */
class ServerOrigin {
  constructor(readonly by: string) {}
}

export const MAX_CHANGELOG_IN_FILE = 500;
export const MAX_CHANGELOG = 5000;

const OPEN = 1;

export const RECONCILE_PENDING_REASON =
  'Vorlagen-Abgleich ausstehend: Das Projekt stammt aus einer anderen Bibliothek und enthält abweichende Vorlagen oder Stammdaten. Jemand mit Bearbeiten-Zugang muss entscheiden, welche gelten.';

/** Projekt, dessen Vorlagen-Abgleich noch eine Entscheidung braucht. */
interface PendingReconcile {
  project: Project;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

export class Room {
  readonly doc: Y.Doc;
  readonly connections = new Set<Connection>();
  private secrets: Secrets;
  private changeLog: Project['changeLog'];
  /** Letzte Snapshots – Rückfall, falls eine Vorlage in der Bibliothek fehlt */
  private snapshots: Pick<Project, 'templateSnapshot' | 'masterDataSnapshot'>;
  private pending: PendingReconcile | undefined;
  private libraryIdInFile: string;
  private readonly projectId: string;
  private dirty = false;
  private firstDirtyAt = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> = Promise.resolve();
  private editorsSinceVersion = new Set<string>();
  private lastVersionAt = 0;
  private closed = false;
  private readonly saveDelayMs: number;
  private readonly maxSaveDelayMs: number;
  private readonly versionIntervalMs: number;

  private constructor(
    readonly id: string,
    project: Project,
    private readonly deps: RoomDeps,
  ) {
    this.doc = createYDocFromProject(project);
    this.secrets = project.secrets;
    this.changeLog = project.changeLog;
    this.snapshots = { templateSnapshot: project.templateSnapshot, masterDataSnapshot: project.masterDataSnapshot };
    this.libraryIdInFile = project.libraryId;
    this.projectId = project.id;
    this.saveDelayMs = deps.saveDelayMs ?? 1500;
    this.maxSaveDelayMs = deps.maxSaveDelayMs ?? 10_000;
    this.versionIntervalMs = deps.versionIntervalMs ?? VERSION_INTERVAL_MS;
    this.doc.on('update', this.handleUpdate);
    this.activity = new ActivityTracker({
      doc: this.doc,
      stampDelayMs: deps.stampDelayMs,
      windowMs: deps.changeLogWindowMs,
      onEntry: (entry) => this.appendLog(entry),
    });
    this.doc.on('afterTransaction', this.handleTransaction);
    this.timecode = new ArtNetTimecode(deps.artnet);
    this.bpmSender = new BpmSender(deps.oscOut);
    this.doc.getMap('showSettings').observe(this.handleShowSettings);
  }

  private readonly timecode: ArtNetTimecode;
  private readonly bpmSender: BpmSender;

  /** Tempo des geführten Punkts per OSC (nur bei Änderung, force: jetzt erneut); gesendeter Text oder null */
  sendBpm(force = false): string | null {
    const itemId = this.lead?.itemId;
    const raw = itemId ? this.doc.getMap<Y.Map<unknown>>('showItems').get(itemId) : undefined;
    const item = raw instanceof Y.Map ? (raw.toJSON() as Parameters<typeof itemTempo>[0]) : undefined;
    return this.bpmSender.update(item ? itemTempo(item).bpm : undefined, oscBpmConfig(this.doc.getMap('showSettings').get('oscBpm')), force);
  }

  private artnetConfig(): ArtNetConfig | undefined {
    return this.doc.getMap('showSettings').get('artnet') as ArtNetConfig | undefined;
  }

  private handleShowSettings = (event: Y.YMapEvent<unknown>): void => {
    if (event.keysChanged.has('artnet')) this.timecode.update(this.lead, this.leadAt, this.artnetConfig());
    if (event.keysChanged.has('oscBpm')) this.sendBpm();
  };

  private readonly activity: ActivityTracker;

  private handleTransaction = (transaction: Y.Transaction): void => {
    const origin = transaction.origin as unknown;
    if (origin && typeof origin === 'object' && 'session' in origin) {
      const session = (origin as Connection).session;
      this.activity.record(transaction, { by: session.name, access: session.access, via: session.via });
    }
  };

  private appendLog(entry: Project['changeLog'][number]): void {
    this.changeLog = [...this.changeLog, entry].slice(-MAX_CHANGELOG);
    this.markDirty();
  }

  /** Eigener Protokolleintrag für wichtige Aktionen. */
  logAction(actor: Actor, action: string, objectIds: string[] = []): void {
    this.appendLog({ at: new Date().toISOString(), by: actor.by, access: actor.access, via: actor.via, action, objectIds });
  }

  /** Änderungsprotokoll, neueste zuerst (inkl. noch offener Einträge). */
  changeLogEntries(): Project['changeLog'] {
    return [...this.changeLog, ...this.activity.pendingEntries()].sort((a, b) => b.at.localeCompare(a.at));
  }

  static async load(id: string, deps: RoomDeps): Promise<Room> {
    const loaded = await deps.store.load(id);
    const { project, pending } = await Room.reconcileOnLoad(loaded, deps);
    const room = new Room(id, project, deps);
    room.pending = pending;
    if (deps.store.loadChangeLog) {
      const separate = await deps.store.loadChangeLog(id).catch(() => []);
      room.changeLog = [...separate, ...project.changeLog].slice(-MAX_CHANGELOG);
    }
    deps.usage.record(deps.store.persistentKey(id), project.meta.name, projectUsage(project));
    const latest = await deps.versions.latest(project.id).catch(() => undefined);
    room.lastVersionAt = latest ? Date.parse(latest.at) : 0;
    return room;
  }

  /**
   * Abgleich beim Öffnen: fehlende Vorlagen/Stammdaten werden ohne Nachfrage in die Bibliothek übernommen,
   * bei eigener Bibliothek gilt automatisch die Bibliothek. Konflikte mit einer fremden Bibliothek
   * warten auf eine Entscheidung (Projekt bis dahin nur lesbar).
   */
  private static async reconcileOnLoad(project: Project, deps: RoomDeps): Promise<{ project: Project; pending?: PendingReconcile }> {
    const name = project.meta.name || 'Projekt';
    const { analysis, idMap, library } = await deps.library.mutate((lib) => {
      const found = analyzeProject(project, lib);
      const applied = applyAnalysis(lib, { ...found, conflicts: [] }, {}, { by: `Abgleich „${name}“` });
      return {
        library: applied.library,
        result: { analysis: found, idMap: applied.idMap, library: applied.library },
        templateIds: found.additions.templates.map((t) => t.id),
      };
    });
    if (analysis.conflicts.length > 0) return { project, pending: { project } };
    return { project: finishProject(project, library, idMap) };
  }

  get readOnlyReason(): string | undefined {
    return this.deps.store.readOnlyReason(this.id) ?? (this.pending ? RECONCILE_PENDING_REASON : undefined);
  }

  get reconcilePending(): boolean {
    return this.pending !== undefined;
  }

  /** Offene Konflikte (gegen den aktuellen Stand der Bibliothek). */
  conflicts(): Conflict[] {
    return this.pending ? analyzeProject(this.pending.project, this.deps.library.get()).conflicts : [];
  }

  /** Entscheidungen für den Vorlagen-Abgleich anwenden; danach ist das Projekt normal bearbeitbar. */
  async resolveConflicts(resolutions: Record<string, Resolution>, by: string, actor?: Omit<Actor, 'by'>): Promise<void> {
    const pending = this.pending;
    if (!pending) return;
    const result = await this.deps.library.mutate((lib) => {
      const analysis = analyzeProject(pending.project, lib);
      const missing = missingResolutions(analysis, resolutions);
      if (missing.length) throw new Error(`Für ${missing.length} Einträge fehlt eine Entscheidung.`);
      const applied = applyAnalysis(lib, analysis, resolutions, { by });
      return {
        library: applied.library,
        result: applied,
        templateIds: analysis.conflicts.filter((c) => c.kind === 'template').map((c) => c.id),
        masterKeys: analysis.conflicts.filter((c) => c.kind !== 'template').map((c) => c.key),
      };
    });
    const current = readProjectFromYDoc(this.doc, { secrets: this.secrets, changeLog: this.changeLog, ...this.snapshots });
    if (!current.ok) throw new Error(`Projekt ungültig: ${current.error}`);
    const finished = finishProject(current.project, result.library, result.idMap);
    this.pending = undefined;
    this.snapshots = { templateSnapshot: finished.templateSnapshot, masterDataSnapshot: finished.masterDataSnapshot };
    this.libraryIdInFile = finished.libraryId;
    writeProjectToYDoc(finished, this.doc, new ServerOrigin(by));
    this.markDirty();
    for (const connection of this.connections) this.sendWelcome(connection);
    this.notify(`${by} hat den Vorlagen-Abgleich durchgeführt.`);
    const s = result.summary;
    this.logAction({ by, access: actor?.access ?? 'edit', via: actor?.via ?? 'browser' }, `Vorlagen-Abgleich: ${s.kept} behalten, ${s.replaced} übernommen, ${s.copied} als Kopie`);
  }

  /**
   * Häkchen der Packliste setzen oder entfernen (auch mit Lese-Zugang erlaubt).
   * Der Server schreibt selbst ins Dokument – Name und Zeit stammen vom Server.
   */
  applyCheck(kind: 'device' | 'cable', id: string, direction: CheckDirection, status: CheckMark['status'] | null, by: string, note?: string): boolean {
    const reason = this.deps.store.readOnlyReason(this.id) ?? (this.pending ? RECONCILE_PENDING_REASON : undefined);
    if (reason) throw new Error(reason);
    const mark: CheckMark | null = status ? { at: new Date().toISOString(), by, status, ...(note?.trim() ? { note: note.trim() } : {}) } : null;
    return setCheck(this.doc, kind, id, direction, mark, new ServerOrigin(by));
  }

  /** Person, der ein Gerät zugeordnet ist (nur wenn es die Person gibt), mit Namen */
  devicePerson(deviceId: string): { id: string; name: string } | undefined {
    const personId = this.doc.getMap<Y.Map<unknown>>('devices').get(deviceId)?.get('personId');
    return typeof personId === 'string' ? this.person(personId) : undefined;
  }

  /** Person mit Namen (undefined, wenn es sie nicht gibt) */
  person(personId: string): { id: string; name: string } | undefined {
    const person = this.doc.getMap<Y.Map<unknown>>('people').get(personId);
    if (!person) return undefined;
    const name = [person.get('firstName'), person.get('lastName')].filter((x) => typeof x === 'string' && x.trim()).join(' ');
    return { id: personId, name };
  }

  /** Helfer-Anmeldung ändern (auch mit Lesezugang – wird in der Route geprüft). false = Auftritt/Person fehlt. */
  applyHelperSignup(gigId: string, personId: string, patch: SignupPatch, by: string): boolean {
    const reason = this.deps.store.readOnlyReason(this.id) ?? (this.pending ? RECONCILE_PENDING_REASON : undefined);
    if (reason) throw new Error(reason);
    return setHelperSignup(this.doc, gigId, personId, patch, by, new ServerOrigin(by));
  }

  /** Nachrichten an die Technik (Rechte prüft die Route) */
  helperMessage(id: string): HelperMessage | undefined {
    return readHelperMessage(this.doc, id);
  }

  private assertWritable(): void {
    const reason = this.deps.store.readOnlyReason(this.id) ?? (this.pending ? RECONCILE_PENDING_REASON : undefined);
    if (reason) throw new Error(reason);
  }

  /** Technik-Übergabe (Rechte prüft die Route) */
  applyHandover(personId: string, action: HandoverAction, by: string): boolean {
    this.assertWritable();
    return setHandover(this.doc, personId, action, by, new ServerOrigin(by));
  }

  addHelperMessage(personId: string, text: string, by: string): string | undefined {
    this.assertWritable();
    return addHelperMessage(this.doc, personId, text, by, new ServerOrigin(by));
  }

  updateHelperMessage(id: string, text: string, by: string): boolean {
    this.assertWritable();
    return updateHelperMessage(this.doc, id, text, by, new ServerOrigin(by));
  }

  removeHelperMessage(id: string, by: string): boolean {
    this.assertWritable();
    return removeHelperMessage(this.doc, id, new ServerOrigin(by));
  }

  /** Geschützter Bereich: WLAN-Passwörter (nur für Bearbeiten-Zugang, nie im Yjs-Dokument). */
  getSecrets(): Secrets {
    return this.secrets;
  }

  wifiPassword(wifiId: string): string | undefined {
    return this.secrets.wifiPasswords.find((w) => w.wifiId === wifiId)?.password;
  }

  setWifiPassword(wifiId: string, password: string | null): void {
    if (this.readOnlyReason) throw new Error(this.readOnlyReason);
    const others = this.secrets.wifiPasswords.filter((w) => w.wifiId !== wifiId);
    this.secrets = { ...this.secrets, wifiPasswords: password ? [...others, { wifiId, password }] : others };
    this.markDirty();
  }

  /** Häkchen zurücksetzen (nur Bearbeiten-Zugang – wird in der Route geprüft). */
  resetChecks(direction: CheckDirection | 'both', by: string, actor?: Omit<Actor, 'by'>): number {
    if (this.readOnlyReason) throw new Error(this.readOnlyReason);
    const removed = resetCheckMarks(this.doc, direction, new ServerOrigin(by));
    const what = direction === 'both' ? 'alle Häkchen' : direction === 'out' ? 'die Häkchen „Hin“' : 'die Häkchen „Zurück“';
    if (removed) {
      this.notify(`${by} hat ${what} zurückgesetzt.`);
      const which = direction === 'both' ? 'Hin und Zurück' : direction === 'out' ? 'Hin' : 'Zurück';
      this.logAction({ by, access: actor?.access ?? 'edit', via: actor?.via ?? 'browser' }, `Häkchen zurückgesetzt (${which}, ${removed} Stück)`);
    }
    return removed;
  }

  /** Die Bibliothek hat sich geändert: betrifft es dieses Projekt, Snapshot in der Datei erneuern. */
  libraryChanged(change: LibraryChange): void {
    if (this.readOnlyReason || this.closed) return;
    const usage = projectUsage(readRawUsage(this.doc));
    const affected =
      change.templateIds.some((id) => usage.templates.has(id)) ||
      change.masterKeys.length > 0 ||
      change.templateIds.some((id) => this.snapshots.templateSnapshot.some((t) => t.id === id));
    if (affected) this.markDirty();
  }

  get versionKey(): string {
    return this.projectId;
  }

  canWrite(session: Session): boolean {
    return !this.readOnlyReason && can(session.access, 'editProject');
  }

  /** Darf nur die Regie ändern (Zugang „Regie“). */
  canWriteShow(session: Session): boolean {
    return !this.readOnlyReason && can(session.access, 'editShow');
  }

  /** Aktueller Stand inkl. geschütztem Bereich und Snapshots. */
  currentProject(): Project {
    const result = this.readCurrent();
    if (!result.ok) throw new Error(`Projekt ungültig: ${result.error}`);
    return result.project;
  }

  private readCurrent(): ReturnType<typeof readProjectFromYDoc> {
    const wifiIds = new Set([...this.doc.getMap('wifi').keys()]);
    const secrets = { ...this.secrets, wifiPasswords: this.secrets.wifiPasswords.filter((w) => wifiIds.has(w.wifiId)) };
    const changeLog = this.deps.store.saveChangeLog ? [] : this.changeLog.slice(-MAX_CHANGELOG_IN_FILE);
    const result = readProjectFromYDoc(this.doc, { secrets, changeLog, ...this.snapshots });
    if (!result.ok || this.pending) return result;
    const project = { ...result.project, libraryId: this.libraryIdInFile || this.deps.library.libraryId };
    return { ok: true, project: { ...project, ...buildSnapshots(project, this.deps.library.get()) } };
  }

  // ---------- Verbindungen ----------

  addConnection(socket: WebSocket, session: Session): Connection {
    const connection: Connection = { id: randomBytes(6).toString('hex'), socket, session };
    this.connections.add(connection);

    this.sendWelcome(connection);

    // Server-Stand anbieten; der Client antwortet mit seinen fehlenden Änderungen (Sync-Step 2)
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, this.doc);
    this.send(connection, encoding.toUint8Array(encoder));

    this.broadcastPresence();
    return connection;
  }

  private sendWelcome(connection: Connection): void {
    this.send(
      connection,
      encodeInfo({
        type: 'welcome',
        connectionId: connection.id,
        access: connection.session.access,
        // Regie-Clients senden Änderungen (nur Regie-Bereiche werden übernommen); die Oberfläche sperrt den Rest
        readOnly: !this.canWrite(connection.session) && !this.canWriteShow(connection.session),
        ...(this.readOnlyReason ? { readOnlyReason: this.readOnlyReason } : {}),
        reconcilePending: this.reconcilePending,
      }),
    );
    if (this.lead) this.send(connection, encodeInfo({ type: 'lead', lead: this.currentLead(this.lead) }));
    const cues = this.deps.deskCues?.() ?? [];
    if (cues.length) this.send(connection, encodeInfo({ type: 'deskCues', cues }));
  }

  /** Lichtpult-Cues an alle Verbindungen */
  deskCues(cues: DeskCue[]): void {
    this.broadcast(encodeInfo({ type: 'deskCues', cues }));
  }

  removeConnection(connection: Connection): void {
    if (this.connections.delete(connection)) this.broadcastPresence();
    // geht die führende Person, endet das Führen
    if (this.lead?.connectionId === connection.id) this.setLead(null);
  }

  // ---------- Vorstellung: führen / folgen (nur im Speicher) ----------

  private lead: LeadInfo | null = null;
  private leadAt = 0;

  /** Eine Verbindung trennen (durch einen Bearbeiter); sie verbindet sich nicht von selbst neu. false = nicht gefunden */
  disconnectConnection(connectionId: string, by: string): boolean {
    for (const connection of this.connections) {
      if (connection.id !== connectionId) continue;
      connection.socket.close(CloseCode.Disconnected, `Die Verbindung wurde von ${by} getrennt.`.slice(0, 120));
      return true;
    }
    return false;
  }

  get hasLead(): boolean {
    return this.lead !== null;
  }

  /** Fernsteuerung (OSC/HTTP) an alle Verbindungen; ausführen soll die führende bzw. jede nicht folgende Vorstellung */
  remote(command: RemoteCommand): void {
    this.broadcast(encodeInfo({ type: 'remote', command }));
  }

  private setLead(lead: LeadInfo | null): void {
    this.lead = lead;
    this.leadAt = Date.now();
    this.broadcast(encodeInfo({ type: 'lead', lead }));
    this.timecode.update(lead, this.leadAt, this.artnetConfig());
    this.sendBpm();
  }

  /** Für Nachzügler: läuft die Wiedergabe, die Abspielposition bis jetzt weiterrechnen */
  private currentLead(lead: LeadInfo): LeadInfo {
    const passed = (Date.now() - this.leadAt) / 1000;
    return {
      ...lead,
      ...(lead.playing && lead.at !== undefined ? { at: lead.at + passed } : {}),
      ...(lead.tc?.playing ? { tc: { at: lead.tc.at + passed, playing: true } } : {}),
    };
  }

  private handleCue(connection: Connection, decoder: decoding.Decoder): void {
    // führen darf, wer die Regie bearbeiten darf; folgen dürfen alle
    if (!can(connection.session.access, 'editShow')) return;
    let cue: ReturnType<typeof decodeCue>;
    try {
      cue = decodeCue(decoder);
    } catch {
      return; // ungültige Stelle ignorieren, Verbindung bleibt
    }
    if (cue === null) {
      if (this.lead?.connectionId === connection.id) this.setLead(null);
      return;
    }
    this.setLead({ ...cue, connectionId: connection.id, name: connection.session.name });
  }

  updateSession(session: Session): void {
    let changed = false;
    for (const connection of this.connections) {
      if (connection.session.id === session.id) {
        connection.session = session;
        changed = true;
      }
    }
    if (changed) this.broadcastPresence();
  }

  presence(): PresenceUser[] {
    return [...this.connections].map((c) => ({ id: c.id, name: c.session.name, access: c.session.access }));
  }

  handleMessage(connection: Connection, data: Uint8Array): void {
    try {
      const decoder = decoding.createDecoder(data);
      const type = decoding.readVarUint(decoder);
      if (type === MESSAGE_CUE) {
        this.handleCue(connection, decoder);
        return;
      }
      if (type !== MESSAGE_SYNC) return; // Awareness o. Ä. wird (noch) nicht verarbeitet

      const syncType = decoding.readVarUint(decoder);
      switch (syncType) {
        case syncProtocol.messageYjsSyncStep1: {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, MESSAGE_SYNC);
          syncProtocol.readSyncStep1(decoder, encoder, this.doc);
          this.send(connection, encoding.toUint8Array(encoder));
          break;
        }
        case syncProtocol.messageYjsSyncStep2:
        case syncProtocol.messageYjsUpdate: {
          // Rechte serverseitig durchsetzen: Änderungen von Lese-Clients werden verworfen,
          // Regie-Clients dürfen nur die Regie-Bereiche ändern (sonst wird die ganze Änderung verworfen).
          if (this.canWrite(connection.session)) {
            if (syncType === syncProtocol.messageYjsSyncStep2) syncProtocol.readSyncStep2(decoder, this.doc, connection);
            else syncProtocol.readUpdate(decoder, this.doc, connection);
          } else if (this.canWriteShow(connection.session)) {
            const update = decoding.readVarUint8Array(decoder);
            if (updateTouchesOnly(this.doc, update, DIRECTION_ROOTS)) Y.applyUpdate(this.doc, update, connection);
            else {
              this.deps.log.warn(`Regie-Änderung außerhalb der Regie verworfen (Verbindung ${connection.id}).`);
              this.send(connection, encodeInfo({ type: 'notice', message: 'Eine Änderung außerhalb der Regie wurde nicht übernommen. Bitte die Seite neu laden.' }));
            }
          }
          break;
        }
      }
    } catch (error) {
      this.deps.log.warn(`Ungültige Sync-Nachricht von Verbindung ${connection.id}: ${(error as Error).message}`);
      connection.socket.close(1003, 'Ungültige Nachricht');
    }
  }

  notify(message: string): void {
    this.broadcast(encodeInfo({ type: 'notice', message }));
  }

  private send(connection: Connection, data: Uint8Array): void {
    if (connection.socket.readyState === OPEN) connection.socket.send(data);
  }

  private broadcast(data: Uint8Array, except?: unknown): void {
    for (const connection of this.connections) if (connection !== except) this.send(connection, data);
  }

  private broadcastPresence(): void {
    const info: ServerInfo = { type: 'presence', users: this.presence() };
    this.broadcast(encodeInfo(info));
  }

  private handleUpdate = (update: Uint8Array, origin: unknown): void => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    this.broadcast(encoding.toUint8Array(encoder), origin);
    // neues Tempo (z. B. getappt) beim geführten Punkt
    if (this.lead) this.sendBpm();

    if (origin === STAMP_ORIGIN) {
      // nur „zuletzt geändert“ – zählt nicht als Bearbeitung
    } else if (origin && typeof origin === 'object' && 'session' in origin) {
      this.editorsSinceVersion.add((origin as Connection).session.name);
    } else if (origin instanceof ServerOrigin) {
      this.editorsSinceVersion.add(origin.by);
    }
    this.markDirty();
  };

  // ---------- Speichern & Versionen ----------

  private markDirty(): void {
    if (this.closed) return;
    const now = Date.now();
    if (!this.dirty) this.firstDirtyAt = now;
    this.dirty = true;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    const delay = Math.max(0, Math.min(this.saveDelayMs, this.firstDirtyAt + this.maxSaveDelayMs - now));
    this.saveTimer = setTimeout(() => void this.flush(), delay);
    this.saveTimer.unref?.();
  }

  /** Speichert sofort, falls es ungespeicherte Änderungen gibt. */
  flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.saving = this.saving.then(() => this.doSave());
    return this.saving;
  }

  private async doSave(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;
    if (this.pending) return; // erst nach dem Abgleich speichern
    const result = this.readCurrent();
    if (!result.ok) {
      // Ungültiger Stand (z. B. fehlerhafter Client): letzten gültigen Stand auf der Platte behalten.
      this.deps.log.error(`Projekt ${this.id} nicht gespeichert – ungültiger Inhalt (${result.error})`);
      return;
    }
    this.snapshots = { templateSnapshot: result.project.templateSnapshot, masterDataSnapshot: result.project.masterDataSnapshot };
    this.libraryIdInFile = result.project.libraryId;
    this.deps.usage.record(this.deps.store.persistentKey(this.id), result.project.meta.name, projectUsage(result.project));
    try {
      await this.deps.store.save(this.id, result.project);
      await this.deps.store.saveChangeLog?.(this.id, this.changeLog);
    } catch (error) {
      this.deps.log.error(`Projekt ${this.id} konnte nicht gespeichert werden: ${(error as Error).message}`);
      this.markDirty();
      return;
    }
    if (Date.now() - this.lastVersionAt >= this.versionIntervalMs) {
      await this.addVersion(result.project);
    }
  }

  private async addVersion(project: Project, note?: string, extraNames: string[] = []): Promise<VersionInfo | undefined> {
    try {
      const by = [...new Set([...this.editorsSinceVersion, ...extraNames])];
      const info = await this.deps.versions.add(this.projectId, project, by, note);
      this.editorsSinceVersion.clear();
      this.lastVersionAt = Date.parse(info.at);
      return info;
    } catch (error) {
      this.deps.log.error(`Version für ${this.id} konnte nicht angelegt werden: ${(error as Error).message}`);
      return undefined;
    }
  }

  /** Stellt einen früheren Stand wieder her (vorher wird der aktuelle Stand als Version gesichert). */
  async restoreVersion(versionId: string, by: string, actor?: Omit<Actor, 'by'>): Promise<void> {
    if (this.readOnlyReason) throw new Error(this.readOnlyReason);
    await this.flush();
    const old = await this.deps.versions.load(this.projectId, versionId);
    const current = this.currentProject();
    await this.addVersion(current, 'Stand vor dem Wiederherstellen', [by]);

    this.secrets = old.secrets;
    // Vorlagen aus der alten Version, die inzwischen in der Bibliothek fehlen, wieder übernehmen
    await this.deps.library.mutate((lib) => {
      const found = analyzeProject({ ...old, libraryId: lib.libraryId }, lib);
      const applied = applyAnalysis(lib, { ...found, conflicts: [] }, {}, { by });
      return { library: applied.library, result: undefined, templateIds: found.additions.templates.map((t) => t.id) };
    });
    this.snapshots = { templateSnapshot: old.templateSnapshot, masterDataSnapshot: old.masterDataSnapshot };
    writeProjectToYDoc({ ...old, id: current.id, libraryId: current.libraryId }, this.doc, new ServerOrigin(by));
    await this.flush();
    const info = (await this.deps.versions.list(this.projectId)).find((v) => v.id === versionId);
    const at = info ? formatDateTime(info.at) : 'früher';
    this.notify(`${by} hat den Stand vom ${at} wiederhergestellt.`);
    this.logAction({ by, access: actor?.access ?? 'edit', via: actor?.via ?? 'browser' }, `Version vom ${at} wiederhergestellt`);
  }

  async close(code: number, reason: string): Promise<void> {
    this.activity.stop();
    this.timecode.stop();
    this.doc.getMap('showSettings').unobserve(this.handleShowSettings);
    await this.flush();
    this.closed = true;
    for (const connection of this.connections) connection.socket.close(code, reason);
    this.connections.clear();
    this.doc.off('update', this.handleUpdate);
    this.doc.destroy();
  }
}

/** Nur Geräte und Kabel aus dem Dokument lesen (für die Nutzungsprüfung). */
function readRawUsage(doc: Y.Doc): Pick<Project, 'devices' | 'cables'> {
  const values = (name: string) => Object.values(doc.getMap(name).toJSON() as Record<string, unknown>);
  return { devices: values('devices'), cables: values('cables') } as Pick<Project, 'devices' | 'cables'>;
}
