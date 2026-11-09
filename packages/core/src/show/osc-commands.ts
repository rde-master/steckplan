// OSC-Befehle der Regie (Reiter OSC): je Ablaufeintrag beim Start, je Lichtszene, je Licht-Event und eine Liste von
// Hand auszulösender Befehle. Gesendet wird vom Server (UDP) – automatisch, solange jemand führt und „OSC senden“
// eingeschaltet hat; die manuellen Befehle per Knopf.
import * as Y from 'yjs';
import { newId } from '../model/project';
import type { OscCommand, OscTrigger } from '../model/schema';

function commandsMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>('oscCommands');
}

const byOrder = (a: OscCommand, b: OscCommand) => a.order - b.order || a.id.localeCompare(b.id);

export function readOscCommands(doc: Y.Doc): OscCommand[] {
  return Object.values(commandsMap(doc).toJSON() as Record<string, OscCommand>)
    .map((c) => ({ ...c, order: c.order ?? 0, address: c.address ?? '' }))
    .sort(byOrder);
}

/** Befehle eines Auslösers (Eintrag + Art + ggf. Szene/Event), in Reihenfolge */
export function triggerCommands(commands: OscCommand[], itemId: string, trigger: OscTrigger, refId?: string): OscCommand[] {
  return commands.filter((c) => c.itemId === itemId && c.trigger === trigger && (trigger === 'item' || trigger === 'manual' || c.refId === refId)).sort(byOrder);
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
  for (const [key, map] of [...commandsMap(doc).entries()]) if (map.get('itemId') === itemId) commandsMap(doc).delete(key);
}

/** Befehle beim Kopieren eines Eintrags mitkopieren (Szenen/Events umgeschlüsselt; ohne Gegenstück entfallen sie) */
export function copyItemOscCommands(doc: Y.Doc, fromItem: string, toItem: string, refIds: Map<string, string>): void {
  for (const c of readOscCommands(doc).filter((x) => x.itemId === fromItem)) {
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

/** gültige OSC-Adresse? */
export function isOscAddress(address: string): boolean {
  return /^\/[^\s#*,?[\]{}]+$/.test(address.trim());
}

/** Befehl als Text zur Anzeige: /cmd "Go Cue 3" 1 */
export function formatOscCommand(c: Pick<OscCommand, 'address' | 'args'>): string {
  const args = parseOscArgs(c.args).map((a) => (typeof a === 'number' ? String(a) : /\s/.test(a) || a === '' ? `"${a}"` : a));
  return [c.address.trim(), ...args].join(' ');
}
