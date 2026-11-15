// OSC-Befehle der Regie senden (UDP): automatisch, solange jemand führt und „OSC senden“ an hat –
//  • beim Wechsel zu einem Ablaufeintrag: Ende-Befehle des bisherigen (falls noch nicht gesendet), Bereiche verlassen
//    bzw. betreten, Start-Befehle (eigene und die für jeden Eintrag);
//  • beim Wechsel der Lichtszene deren Befehle;
//  • im Stück (laufende Wiedergabe, Zeit aus der Stelle hochgerechnet): Zeitpunkte, Textzeilen, Abschnitte,
//    Licht-Events und das Ende (Dauer) samt Ende von Bereichen, die mit dem Eintrag enden. Zurückgespult → wieder offen.
// Ein Befehl mit Verlauf sendet seinen Wert von → bis über die eingestellte Zeit (25 Werte je Sekunde) und läuft zu
// Ende, auch wenn die Stelle wechselt. Von Hand: einzelne Befehle.
import {
  fadeIsFloat,
  fadeValue,
  formatOscCommand,
  inOscRange,
  isOscAddress,
  itemOscTimeline,
  itemStartEndCommands,
  OSC_LOG_LENGTH,
  oscArgs,
  oscRanges,
  triggerCommands,
  type LeadInfo,
  type LightEvent,
  type OscArgContext,
  type OscCommand,
  type OscLogEntry,
  type TimedLine,
} from '@steckplan/core';
import { encodeOsc, type OscOut } from './bpm-out';

/** Abstand der Werte eines Verlaufs */
export const FADE_STEP_MS = 40;

export interface OscItemInfo {
  id: string;
  title: string;
  /** Nummer im Ablauf (Platzhalter {nr}) */
  nr?: number;
  durationSec?: number;
}

export interface OscCommandData {
  commands: OscCommand[];
  events: LightEvent[];
  /** Standard-Ziel */
  target: { host: string; port: number } | undefined;
  /** Ablauf in Reihenfolge (für Bereiche, Ende, Platzhalter) */
  items: OscItemInfo[];
  /** Zeilen eines Eintrags mit Zeit (Textzeilen und Abschnitte) */
  lines: (itemId: string) => TimedLine[];
  /** Beschriftungen für das Protokoll */
  sceneName: (sceneId: string) => string;
}

export class OscCommandRunner {
  private lastItemId: string | undefined;
  private lastSceneId: string | undefined;
  private timers: ReturnType<typeof setTimeout>[] = [];
  /** im laufenden Eintrag schon gesendete Zeitpunkte (Schlüssel aus itemOscTimeline, z. B. „end“) */
  private sent = new Set<string>();
  /** betretene Bereiche und solche, deren Ende schon gesendet ist */
  private inside = new Set<string>();
  private ended = new Set<string>();
  /** laufende Verläufe je Befehl */
  private fades = new Map<string, ReturnType<typeof setInterval>>();
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
      this.sent.clear();
      this.inside.clear();
      this.ended.clear();
      return;
    }
    const active = lead.osc === true;
    const info = new Map(data.items.map((i) => [i.id, i]));
    const ctx = (itemId: string | undefined): OscArgContext => {
      const item = itemId ? info.get(itemId) : undefined;
      return { ...(item?.nr !== undefined ? { nr: item.nr } : {}), titel: item?.title ?? '' };
    };
    const itemChanged = lead.itemId !== this.lastItemId;
    const sceneChanged = !!lead.sceneId && (itemChanged || lead.sceneId !== this.lastSceneId);
    const previous = this.lastItemId;
    this.lastItemId = lead.itemId;
    this.lastSceneId = lead.sceneId;

    if (itemChanged) {
      // Ende des bisherigen Eintrags, falls nicht schon an seiner Dauer gesendet
      if (active && previous && !this.sent.has('end')) this.sendAll(itemStartEndCommands(data.commands, previous, 'end'), `Ende: ${info.get(previous)?.title ?? '–'}`, data, ctx(previous));
      // Bereiche verlassen bzw. betreten
      const position = new Map(data.items.map((i, n) => [i.id, n]));
      for (const range of oscRanges(data.commands)) {
        const was = this.inside.has(range.id);
        const now = inOscRange(position, range, lead.itemId);
        if (was && !now) {
          if (active && !this.ended.has(range.id)) this.sendAll(range.end, 'Bereich verlassen', data, ctx(previous));
          this.inside.delete(range.id);
          this.ended.delete(range.id);
        } else if (!was && now) {
          this.inside.add(range.id);
          this.ended.delete(range.id);
          if (active) this.sendAll(range.start, 'Bereich betreten', data, ctx(lead.itemId));
        }
      }
      this.sent.clear();
    }
    if (active && itemChanged) this.sendAll(itemStartEndCommands(data.commands, lead.itemId, 'item'), `Start: ${info.get(lead.itemId)?.title ?? '–'}`, data, ctx(lead.itemId));
    if (active && sceneChanged) this.sendAll(triggerCommands(data.commands, lead.itemId, 'scene', lead.sceneId), `Szene: ${data.sceneName(lead.sceneId!)}`, data, ctx(lead.itemId));

    // im Stück: zurückgespult → wieder offen; laufende Wiedergabe → zum Zeitpunkt senden
    const at = lead.at;
    if (at === undefined) return;
    const item = info.get(lead.itemId);
    const timeline = itemOscTimeline({
      itemId: lead.itemId,
      ...(item?.title ? { itemTitle: item.title } : {}),
      commands: data.commands,
      events: data.events,
      lines: data.lines(lead.itemId),
      ...(item?.durationSec !== undefined ? { durationSec: item.durationSec } : {}),
    });
    for (const t of timeline) {
      if (t.atSec <= at + 0.05) continue;
      this.sent.delete(t.key);
      if (t.key.startsWith('range-end:')) this.ended.delete(t.key.slice('range-end:'.length));
    }
    if (!active || !lead.playing) return;
    const rate = lead.rate ?? 1;
    const passed = Math.max(0, this.now() - receivedAt) / 1000;
    for (const t of timeline) {
      if (this.sent.has(t.key) || t.atSec < at - 0.05) continue;
      const delayMs = Math.max(0, ((t.atSec - at) / rate - passed) * 1000);
      this.timers.push(
        setTimeout(() => {
          if (this.sent.has(t.key)) return;
          this.sent.add(t.key);
          if (t.key.startsWith('range-end:')) this.ended.add(t.key.slice('range-end:'.length));
          this.sendAll(t.commands, t.source, data, ctx(lead.itemId));
        }, delayMs),
      );
    }
  }

  /** Einen Befehl jetzt senden (von Hand bzw. zum Testen) – gesendeter Text oder Fehlermeldung */
  sendNow(command: OscCommand, source: string, data: Pick<OscCommandData, 'target' | 'items'>): OscLogEntry {
    const item = data.items.find((i) => i.id === (command.itemId === '*' ? this.lastItemId : command.itemId));
    return this.send(command, source, data, { ...(item?.nr !== undefined ? { nr: item.nr } : {}), titel: item?.title ?? '' });
  }

  stop(): void {
    this.clearTimers();
    for (const timer of this.fades.values()) clearInterval(timer);
    this.fades.clear();
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  private sendAll(commands: OscCommand[], source: string, data: Pick<OscCommandData, 'target'>, ctx: OscArgContext): void {
    for (const c of commands) this.send(c, source, data, ctx);
  }

  private send(command: OscCommand, source: string, data: Pick<OscCommandData, 'target'>, ctx: OscArgContext): OscLogEntry {
    const host = (command.host || data.target?.host || '').trim();
    const port = command.port ?? data.target?.port ?? 8000;
    const fade = command.fade;
    const text = fade ? `${formatOscCommand(command)} · ${num(fade.from)} → ${num(fade.to)} in ${num(fade.sec)} s` : formatOscCommand(command);
    const entry: OscLogEntry = { at: new Date(this.now()).toISOString(), source, text, target: host ? `${host}:${port}` : '–' };
    if (!isOscAddress(command.address)) entry.error = 'ungültige Adresse (muss mit / beginnen)';
    else if (!host) entry.error = 'kein Ziel eingestellt';
    else if (!this.out) entry.error = 'Senden nicht verfügbar';
    else {
      try {
        const address = command.address.trim();
        if (fade) this.startFade(command.id, fade, (wert) => this.out!.send(encodeOsc(address, oscArgs(command.args, { ...ctx, wert, float: fadeIsFloat(fade) })), host, port));
        else this.out.send(encodeOsc(address, oscArgs(command.args, ctx)), host, port);
      } catch (error) {
        entry.error = (error as Error).message;
      }
    }
    this.log = [entry, ...this.log].slice(0, OSC_LOG_LENGTH);
    this.onLog(this.log);
    return entry;
  }

  /** Verlauf: sofort den Anfangswert, dann alle FADE_STEP_MS, zuletzt genau den Endwert; derselbe Befehl erneut → neu */
  private startFade(id: string, fade: NonNullable<OscCommand['fade']>, sendValue: (value: number) => void): void {
    const running = this.fades.get(id);
    if (running) clearInterval(running);
    const started = this.now();
    sendValue(fade.from);
    const timer = setInterval(() => {
      const t = (this.now() - started) / (fade.sec * 1000);
      try {
        sendValue(fadeValue(fade, t));
      } catch {
        // ein verlorenes Paket hält den Verlauf nicht an
      }
      if (t >= 1) {
        clearInterval(timer);
        this.fades.delete(id);
      }
    }, FADE_STEP_MS);
    timer.unref?.();
    this.fades.set(id, timer);
  }
}

const num = (n: number) => String(n).replace('.', ',');
