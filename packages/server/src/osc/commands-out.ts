// OSC-Befehle der Regie senden (UDP): automatisch, solange jemand führt und „OSC senden“ an hat – beim Wechsel zu
// einem Ablaufeintrag dessen Start-Befehle, beim Wechsel der Lichtszene deren Befehle, beim Erreichen eines
// Licht-Events (laufende Wiedergabe, Zeit aus der Stelle hochgerechnet) dessen Befehle. Von Hand: einzelne Befehle.
import { formatOscCommand, isOscAddress, OSC_LOG_LENGTH, parseOscArgs, triggerCommands, type LeadInfo, type LightEvent, type OscCommand, type OscLogEntry } from '@steckplan/core';
import { encodeOsc, type OscOut } from './bpm-out';

export interface OscCommandData {
  commands: OscCommand[];
  events: LightEvent[];
  /** Standard-Ziel */
  target: { host: string; port: number } | undefined;
  /** Beschriftungen für das Protokoll */
  itemTitle: (itemId: string) => string;
  sceneName: (sceneId: string) => string;
}

export class OscCommandRunner {
  private lastItemId: string | undefined;
  private lastSceneId: string | undefined;
  private timers: ReturnType<typeof setTimeout>[] = [];
  /** Events, die in diesem Durchlauf schon gesendet wurden */
  private sentEvents = new Set<string>();
  private log: OscLogEntry[] = [];

  constructor(
    private readonly out: OscOut | undefined,
    private readonly onLog: (entries: OscLogEntry[]) => void,
    private readonly now: () => number = Date.now,
  ) {}

  get entries(): OscLogEntry[] {
    return this.log;
  }

  /** Neue Stelle der führenden Person (null = niemand führt) */
  update(lead: LeadInfo | null, receivedAt: number, data: OscCommandData): void {
    this.clearTimers();
    if (!lead) {
      this.lastItemId = undefined;
      this.lastSceneId = undefined;
      this.sentEvents.clear();
      return;
    }
    const itemChanged = lead.itemId !== this.lastItemId;
    const sceneChanged = !!lead.sceneId && (itemChanged || lead.sceneId !== this.lastSceneId);
    this.lastItemId = lead.itemId;
    this.lastSceneId = lead.sceneId;
    if (itemChanged) this.sentEvents.clear();
    const active = lead.osc === true;
    if (active && itemChanged) this.sendAll(triggerCommands(data.commands, lead.itemId, 'item'), `Start: ${data.itemTitle(lead.itemId)}`, data);
    if (active && sceneChanged) this.sendAll(triggerCommands(data.commands, lead.itemId, 'scene', lead.sceneId), `Szene: ${data.sceneName(lead.sceneId!)}`, data);

    // Events: zurückgespult → wieder offen; laufende Wiedergabe → zum Zeitpunkt senden
    const at = lead.at;
    if (at === undefined) return;
    const events = data.events.filter((e) => e.itemId === lead.itemId);
    for (const e of events) if (e.atSec > at + 0.05) this.sentEvents.delete(e.id);
    if (!active || !lead.playing) return;
    const rate = lead.rate ?? 1;
    const passed = Math.max(0, this.now() - receivedAt) / 1000;
    for (const e of events) {
      if (this.sentEvents.has(e.id) || e.atSec < at - 0.05) continue;
      const commands = triggerCommands(data.commands, lead.itemId, 'event', e.id);
      if (commands.length === 0) continue;
      const delayMs = Math.max(0, ((e.atSec - at) / rate - passed) * 1000);
      this.timers.push(
        setTimeout(() => {
          if (this.sentEvents.has(e.id)) return;
          this.sentEvents.add(e.id);
          this.sendAll(commands, `Event: ${e.note || '!'}`, data);
        }, delayMs),
      );
    }
  }

  /** Einen Befehl jetzt senden (von Hand bzw. zum Testen) – gesendeter Text oder Fehlermeldung */
  sendNow(command: OscCommand, source: string, data: Pick<OscCommandData, 'target'>): OscLogEntry {
    return this.send(command, source, data);
  }

  stop(): void {
    this.clearTimers();
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  private sendAll(commands: OscCommand[], source: string, data: Pick<OscCommandData, 'target'>): void {
    for (const c of commands) this.send(c, source, data);
  }

  private send(command: OscCommand, source: string, data: Pick<OscCommandData, 'target'>): OscLogEntry {
    const host = (command.host || data.target?.host || '').trim();
    const port = command.port ?? data.target?.port ?? 8000;
    const text = formatOscCommand(command);
    const entry: OscLogEntry = { at: new Date(this.now()).toISOString(), source, text, target: host ? `${host}:${port}` : '–' };
    if (!isOscAddress(command.address)) entry.error = 'ungültige Adresse (muss mit / beginnen)';
    else if (!host) entry.error = 'kein Ziel eingestellt';
    else if (!this.out) entry.error = 'Senden nicht verfügbar';
    else {
      try {
        this.out.send(encodeOsc(command.address.trim(), parseOscArgs(command.args)), host, port);
      } catch (error) {
        entry.error = (error as Error).message;
      }
    }
    this.log = [entry, ...this.log].slice(0, OSC_LOG_LENGTH);
    this.onLog(this.log);
    return entry;
  }
}
