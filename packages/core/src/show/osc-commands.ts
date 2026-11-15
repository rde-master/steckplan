// OSC-Befehle der Regie (Reiter OSC): je Ablaufeintrag beim Start und Ende, zu Zeitpunkten, Textzeilen und Abschnitten
// im Stück, je Lichtszene, je Licht-Event und eine Liste von Hand auszulösender Befehle; dazu Befehle für jeden Eintrag
// und Bereiche über mehrere Einträge (Start beim Betreten, Ende beim Verlassen). Ein Befehl kann einen Wert verlaufen
// lassen (von → bis in Sekunden). Gesendet wird vom Server (UDP) – automatisch, solange jemand führt und „OSC senden“
// eingeschaltet hat; die manuellen Befehle per Knopf.
import * as Y from 'yjs';
import { newId } from '../model/project';
import { OSC_ALL_ITEMS, type LightEvent, type OscCommand, type OscTrigger } from '../model/schema';
import type { TimedLine } from './show';

function commandsMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>('oscCommands');
}

const byOrder = (a: OscCommand, b: OscCommand) => a.order - b.order || a.id.localeCompare(b.id);

export function readOscCommands(doc: Y.Doc): OscCommand[] {
  return Object.values(commandsMap(doc).toJSON() as Record<string, OscCommand>)
    .map((c) => ({ ...c, order: c.order ?? 0, address: c.address ?? '' }))
    .sort(byOrder);
}

/** Befehle eines Auslösers (Eintrag + Art + ggf. Szene/Event/Zeile/Abschnitt), in Reihenfolge */
export function triggerCommands(commands: OscCommand[], itemId: string, trigger: OscTrigger, refId?: string): OscCommand[] {
  const byRef = trigger === 'scene' || trigger === 'event' || trigger === 'line' || trigger === 'section';
  return commands.filter((c) => c.itemId === itemId && c.trigger === trigger && (!byRef || c.refId === refId)).sort(byOrder);
}

/** Befehle beim Start bzw. Ende eines Eintrags: die eigenen und die für jeden Eintrag */
export function itemStartEndCommands(commands: OscCommand[], itemId: string, trigger: 'item' | 'end'): OscCommand[] {
  return [...triggerCommands(commands, OSC_ALL_ITEMS, trigger), ...triggerCommands(commands, itemId, trigger)];
}

/** Bereich über mehrere Einträge: Grenzen und Befehle beim Betreten bzw. Verlassen */
export interface OscRange {
  id: string;
  fromItemId: string;
  untilItemId: string;
  start: OscCommand[];
  end: OscCommand[];
}

/** Alle Bereiche (je Kennung; Grenzen vom ersten Befehl) */
export function oscRanges(commands: OscCommand[]): OscRange[] {
  const ranges = new Map<string, OscRange>();
  for (const c of [...commands].sort(byOrder)) {
    if (c.trigger !== 'range' || !c.refId) continue;
    const range = ranges.get(c.refId) ?? { id: c.refId, fromItemId: c.itemId, untilItemId: c.untilItemId ?? c.itemId, start: [], end: [] };
    (c.phase === 'end' ? range.end : range.start).push(c);
    ranges.set(c.refId, range);
  }
  return [...ranges.values()];
}

/** Liegt ein Eintrag im Bereich? (Reihenfolge des Ablaufs, Grenzen eingeschlossen, vertauschte Grenzen auch) */
export function inOscRange(position: ReadonlyMap<string, number>, range: Pick<OscRange, 'fromItemId' | 'untilItemId'>, itemId: string | undefined): boolean {
  if (itemId === undefined) return false;
  const at = position.get(itemId);
  const a = position.get(range.fromItemId);
  const b = position.get(range.untilItemId);
  if (at === undefined || a === undefined || b === undefined) return false;
  return at >= Math.min(a, b) && at <= Math.max(a, b);
}

/** Bereich anlegen: je ein (leerer) Befehl für Start und Ende; Ergebnis: Kennung des Bereichs */
export function addOscRange(doc: Y.Doc, fromItemId: string, untilItemId: string, origin: unknown): string {
  const rangeId = newId();
  doc.transact(() => {
    addOscCommand(doc, { itemId: fromItemId, trigger: 'range', refId: rangeId, untilItemId, phase: 'start' }, origin);
    addOscCommand(doc, { itemId: fromItemId, trigger: 'range', refId: rangeId, untilItemId, phase: 'end' }, origin);
  }, origin);
  return rangeId;
}

/** Grenzen eines Bereichs ändern (alle seine Befehle) */
export function setOscRangeBounds(doc: Y.Doc, rangeId: string, bounds: { fromItemId?: string; untilItemId?: string }, origin: unknown): void {
  doc.transact(() => {
    for (const map of commandsMap(doc).values()) {
      if (map.get('trigger') !== 'range' || map.get('refId') !== rangeId) continue;
      if (bounds.fromItemId) map.set('itemId', bounds.fromItemId);
      if (bounds.untilItemId) map.set('untilItemId', bounds.untilItemId);
    }
  }, origin);
}

/** Bereich mit allen Befehlen löschen */
export function removeOscRange(doc: Y.Doc, rangeId: string, origin: unknown): void {
  doc.transact(() => {
    for (const [key, map] of [...commandsMap(doc).entries()]) if (map.get('trigger') === 'range' && map.get('refId') === rangeId) commandsMap(doc).delete(key);
  }, origin);
}

/** Etwas, das im Stück zu einer Zeit ausgelöst wird */
export interface OscTimedTrigger {
  /** eindeutig im Stück (zum Merken, was schon gesendet ist) */
  key: string;
  atSec: number;
  commands: OscCommand[];
  /** fürs Protokoll */
  source: string;
}

/**
 * Was im Stück wann gesendet wird: Zeitpunkte, Textzeilen und Abschnitte (Beginn der ersten Zeile mit Zeit),
 * Licht-Events, das Ende (Dauer) mit den Ende-Befehlen des Eintrags und für jeden Eintrag sowie das Ende von
 * Bereichen, die mit diesem Eintrag enden. Ohne Zeit (Zeile ohne Zeitpunkt, keine Dauer) entfällt der Auslöser.
 */
export function itemOscTimeline(o: {
  itemId: string;
  itemTitle?: string;
  commands: OscCommand[];
  events: LightEvent[];
  lines: TimedLine[];
  durationSec?: number;
}): OscTimedTrigger[] {
  const out: OscTimedTrigger[] = [];
  const push = (key: string, atSec: number | undefined, commands: OscCommand[], source: string) => {
    if (atSec !== undefined && commands.length) out.push({ key, atSec, commands, source });
  };
  for (const c of o.commands) {
    if (c.itemId === o.itemId && c.trigger === 'time') push(`time:${c.id}`, c.atSec, [c], `Zeit ${clock(c.atSec ?? 0)}`);
  }
  for (const { line } of o.lines) push(`line:${line.id}`, line.atSec, triggerCommands(o.commands, o.itemId, 'line', line.id), `Zeile: ${line.text.slice(0, 40)}`);
  const seen = new Set<string>();
  for (const l of o.lines) {
    if (seen.has(l.sectionId) || l.line.atSec === undefined) continue;
    seen.add(l.sectionId);
    push(`section:${l.sectionId}`, l.line.atSec, triggerCommands(o.commands, o.itemId, 'section', l.sectionId), `Abschnitt: ${l.sectionLabel}`);
  }
  for (const e of o.events) {
    if (e.itemId === o.itemId) push(`event:${e.id}`, e.atSec, triggerCommands(o.commands, o.itemId, 'event', e.id), `Event: ${e.note || '!'}`);
  }
  if (o.durationSec !== undefined) {
    push('end', o.durationSec, itemStartEndCommands(o.commands, o.itemId, 'end'), `Ende: ${o.itemTitle ?? ''}`.trim());
    for (const r of oscRanges(o.commands)) if (r.untilItemId === o.itemId) push(`range-end:${r.id}`, o.durationSec, r.end, 'Bereich: Ende');
  }
  return out.sort((a, b) => a.atSec - b.atSec);
}

function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0').replace('.', ',')}`;
}

function setFields(map: Y.Map<unknown>, patch: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === '') map.delete(key);
    else map.set(key, value);
  }
}

export function addOscCommand(doc: Y.Doc, init: Pick<OscCommand, 'itemId' | 'trigger'> & Partial<Omit<OscCommand, 'id' | 'itemId' | 'trigger' | 'order'>>, origin: unknown): string {
  const id = newId();
  const order = triggerCommands(readOscCommands(doc), init.itemId, init.trigger, init.refId).reduce((m, c) => Math.max(m, c.order + 1), 0);
  doc.transact(() => {
    const map = new Y.Map<unknown>();
    commandsMap(doc).set(id, map);
    setFields(map, { address: '', ...init, id, order });
  }, origin);
  return id;
}

export function updateOscCommand(doc: Y.Doc, id: string, patch: Partial<Omit<OscCommand, 'id' | 'itemId' | 'trigger'>>, origin: unknown): void {
  const map = commandsMap(doc).get(id);
  if (map) doc.transact(() => setFields(map, patch), origin);
}

export function removeOscCommand(doc: Y.Doc, id: string, origin: unknown): void {
  doc.transact(() => commandsMap(doc).delete(id), origin);
}

/** Befehle eines Eintrags löschen – beim Löschen des Eintrags */
export function removeItemOscCommands(doc: Y.Doc, itemId: string): void {
  // auch Bereiche, die hier anfangen oder enden
  for (const [key, map] of [...commandsMap(doc).entries()]) if (map.get('itemId') === itemId || map.get('untilItemId') === itemId) commandsMap(doc).delete(key);
}

/** Befehle beim Kopieren eines Eintrags mitkopieren (Szenen/Events umgeschlüsselt; ohne Gegenstück entfallen sie) */
export function copyItemOscCommands(doc: Y.Doc, fromItem: string, toItem: string, refIds: Map<string, string>): void {
  // Bereiche gehören zu ihren Grenzen, nicht zum Eintrag – sie werden nicht mitkopiert
  for (const c of readOscCommands(doc).filter((x) => x.itemId === fromItem && x.trigger !== 'range')) {
    const refId = c.refId ? refIds.get(c.refId) : undefined;
    if (c.refId && !refId) continue;
    const id = newId();
    const map = new Y.Map<unknown>();
    commandsMap(doc).set(id, map);
    setFields(map, { ...c, id, itemId: toItem, refId });
  }
}

// ---------- Argumente ----------

/**
 * Argument-Text → OSC-Argumente: durch Leerzeichen getrennt; Zahlen werden Zahlen (ganz → int, sonst float),
 * alles andere Text. Text in "…" darf Leerzeichen enthalten; "12" in Anführungszeichen bleibt Text.
 */
export function parseOscArgs(text: string | undefined): (string | number)[] {
  const out: (string | number)[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|(\S+)/g;
  for (const m of (text ?? '').matchAll(re)) {
    if (m[1] !== undefined) out.push(m[1].replace(/\\(.)/g, '$1'));
    else {
      const raw = m[2]!;
      out.push(/^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw);
    }
  }
  return out;
}

/** Ein OSC-Argument: Text, Zahl (ganz → int, sonst float) oder ausdrücklich float */
export type OscArg = string | number | { float: number };

/** Platzhalter in den Argumenten: {nr} Nummer des Eintrags, {titel} Titel, {wert} Wert eines Verlaufs */
export interface OscArgContext {
  nr?: number;
  titel?: string;
  /** Wert eines Verlaufs; float: als Kommazahl senden (sonst ganzzahlig gerundet) */
  wert?: number;
  float?: boolean;
}

/** Argumente mit eingesetzten Platzhaltern ({titel} am besten in "…", er kann Leerzeichen enthalten) */
export function oscArgs(text: string | undefined, ctx: OscArgContext = {}): OscArg[] {
  const filled = (text ?? '').replace(/\{nr\}/g, ctx.nr !== undefined ? String(ctx.nr) : '').replace(/\{titel\}/g, (ctx.titel ?? '').replace(/(["\\])/g, '\\$1'));
  const args: OscArg[] = parseOscArgs(filled);
  if (ctx.wert === undefined) return args;
  const value: OscArg = ctx.float ? { float: ctx.wert } : Math.round(ctx.wert);
  let replaced = false;
  const out = args.map((a) => {
    if (a !== '{wert}') return a;
    replaced = true;
    return value;
  });
  return replaced ? out : [...out, value];
}

/**
 * Verlauf mit Kommazahlen? Eingestellt oder von selbst: ganzzahlig nur, wenn von und bis ganze Zahlen sind und
 * mindestens 10 auseinanderliegen (0 → 255 ganz, 0 → 1 oder 0,2 → 0,8 als Kommazahl)
 */
export function fadeIsFloat(fade: { from: number; to: number; float?: boolean }): boolean {
  if (fade.float !== undefined) return fade.float;
  return !(Number.isInteger(fade.from) && Number.isInteger(fade.to) && Math.abs(fade.to - fade.from) >= 10);
}

/** Wert eines Verlaufs bei Anteil t (0–1) */
export function fadeValue(fade: { from: number; to: number }, t: number): number {
  const share = Math.min(1, Math.max(0, t));
  return fade.from + (fade.to - fade.from) * share;
}

/** gültige OSC-Adresse? */
export function isOscAddress(address: string): boolean {
  return /^\/[^\s#*,?[\]{}]+$/.test(address.trim());
}

/** Befehl als Text zur Anzeige: /cmd "Go Cue 3" 1 */
export function formatOscCommand(c: Pick<OscCommand, 'address' | 'args'>): string {
  const args = parseOscArgs(c.args).map((a) => (typeof a === 'number' ? String(a) : /\s/.test(a) || a === '' ? `"${a}"` : a));
  return [c.address.trim(), ...args].join(' ');
}
