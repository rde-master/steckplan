// Regie (M11a): Ablauf aus Liedern, Schauspiel, Pausen und Ansagen mit strukturierten Texten.
// Texte werden je Abschnitt als ein Textfeld bearbeitet; jede Zeile behält ihre Kennung
// (wichtig für Zeitpunkte und Lichtszenen), auch wenn Zeilen eingefügt, gelöscht oder korrigiert werden.
import * as Y from 'yjs';
import { newId } from '../model/project';
import { copyItemScenes, removeItemScenes } from './scenes';
import { copyItemSoundScenes, removeItemSoundScenes } from './sound';
import type { ItemMedia, MediaRef, SectionKind, ShowItem, ShowItemKind, ShowRole, ShowSettings, TextLine, TextSection } from '../model/schema';

// ---------- Lesen ----------

export interface ShowData {
  items: ShowItem[];
  sections: TextSection[];
}

const byOrder = <T extends { order: number; id: string }>(a: T, b: T) => a.order - b.order || a.id.localeCompare(b.id);

export function readShow(doc: Y.Doc): ShowData {
  // fehlende Felder (ältere/teilweise Einträge) mit Vorgaben ergänzen
  const items = Object.values(doc.getMap('showItems').toJSON() as Record<string, Partial<ShowItem> & Pick<ShowItem, 'id' | 'kind' | 'order'>>).map((i): ShowItem => ({ ...i, personIds: i.personIds ?? [], title: i.title ?? '' }));
  const sections = Object.values(doc.getMap('showSections').toJSON() as Record<string, Partial<TextSection> & Pick<TextSection, 'id' | 'itemId' | 'kind' | 'order'>>).map((s): TextSection => ({ ...s, label: s.label ?? '', lines: s.lines ?? [] }));
  return { items: items.sort(byOrder), sections: sections.sort(byOrder) };
}

export function itemSections(sections: TextSection[], itemId: string): TextSection[] {
  return sections.filter((s) => s.itemId === itemId).sort(byOrder);
}

// ---------- Zeiten ----------

/** „3:40“ bzw. „1:02:03“ */
export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** „3:40“, „1:02:03“, „15“ (Minuten) oder „4 min“ → Sekunden; leer/ungültig → undefined */
export function parseDuration(text: string): number | undefined {
  const t = text.trim().replace(/\s*(min|m)$/i, '');
  if (!t) return undefined;
  // eine reine Zahl sind Minuten (Pause „15“)
  if (/^\d+$/.test(t)) return Number(t) * 60;
  const parts = t.split(':');
  if (parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return undefined;
  return parts.map(Number).reduce((sum, n) => sum * 60 + n, 0);
}

/** „19:30“ → Minuten seit Mitternacht */
function parseClock(text: string | undefined): number | undefined {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text?.trim() ?? '');
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : undefined;
}

export interface ScheduleEntry {
  /** Sekunden ab Beginn */
  offsetSec: number;
  /** Uhrzeit „19:34“, wenn eine Anfangszeit gesetzt ist */
  clock?: string;
}

/** Laufende Startzeiten im Ablauf und Gesamtdauer (Einträge ohne Dauer zählen 0). */
export function showSchedule(items: ShowItem[], settings: ShowSettings): { entries: Map<string, ScheduleEntry>; totalSec: number; missingDurations: number } {
  const start = parseClock(settings.startTime);
  const entries = new Map<string, ScheduleEntry>();
  let offset = 0;
  let missing = 0;
  for (const item of [...items].sort(byOrder)) {
    const clock = start === undefined ? undefined : (() => {
      const minutes = Math.floor(start + offset / 60) % (24 * 60);
      return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    })();
    entries.set(item.id, { offsetSec: offset, ...(clock ? { clock } : {}) });
    if (item.durationSec === undefined) missing++;
    offset += item.durationSec ?? 0;
  }
  return { entries, totalSec: offset, missingDurations: missing };
}

// ---------- Texte: Zeilen ↔ Textfeld ----------

/** Regieanweisung: ganze Zeile in Klammern */
const DIRECTION_LINE = /^\((.*)\)$/;
/** Sprecher: „Name: Text“ (Name ohne Ziffer am Anfang, höchstens 40 Zeichen, Leerzeichen nach dem Doppelpunkt) */
const SPEAKER_LINE = /^([^\d:()\s][^:()]{0,39}):\s+(.*)$/;

/** Textfeld eines Abschnitts: Schauspiel mit „Rolle: “ bei Sprecherwechsel und Regieanweisungen in Klammern. */
export function sectionToText(lines: TextLine[], roles: ShowRole[], play: boolean): string {
  if (!play) return lines.map((l) => l.text).join('\n');
  const names = new Map(roles.map((r) => [r.id, r.name]));
  let speaker: string | undefined;
  return lines
    .map((line) => {
      if (line.direction) {
        speaker = undefined;
        return `(${line.text})`;
      }
      if (line.roleId && line.roleId !== speaker) {
        speaker = line.roleId;
        return `${names.get(line.roleId) ?? '?'}: ${line.text}`;
      }
      return line.text;
    })
    .join('\n');
}

interface ParsedLine {
  text: string;
  roleId?: string;
  direction?: boolean;
  /** Zeile so, wie sie im Textfeld steht (für den Abgleich mit den bisherigen Zeilen) */
  raw: string;
}

/**
 * Textfeld → Zeilen. Bisherige Zeilen behalten ihre Kennung (und Zeitpunkte):
 * unveränderte Zeilen über die längste gemeinsame Folge, geänderte Zeilen dazwischen der Reihe nach.
 * Schauspiel: unbekannte Sprecher werden als Rolle angelegt.
 */
export function parseSectionText(text: string, previous: TextLine[], roles: ShowRole[], play: boolean): { lines: TextLine[]; roles: ShowRole[] } {
  const allRoles = [...roles];
  const roleByName = (name: string): string => {
    const key = name.trim().toLocaleLowerCase('de');
    let role = allRoles.find((r) => r.name.trim().toLocaleLowerCase('de') === key);
    if (!role) {
      role = { id: newId(), name: name.trim() };
      allRoles.push(role);
    }
    return role.id;
  };
  const rawLines = text.replace(/\r\n?/g, '\n').split('\n');
  while (rawLines.length && !rawLines[rawLines.length - 1]!.trim()) rawLines.pop();
  let speaker: string | undefined;
  const parsed: ParsedLine[] = rawLines.map((raw) => {
    const line = raw.trimEnd();
    if (!play) return { text: line, raw: line };
    const dir = DIRECTION_LINE.exec(line.trim());
    if (dir) {
      speaker = undefined;
      return { text: dir[1]!.trim(), direction: true, raw: line };
    }
    const sp = SPEAKER_LINE.exec(line.trim());
    if (sp) {
      speaker = roleByName(sp[1]!);
      return { text: sp[2]!, roleId: speaker, raw: line };
    }
    return { text: line, ...(speaker ? { roleId: speaker } : {}), raw: line };
  });

  // bisherige Zeilen in derselben Darstellung
  const oldRaw = sectionToText(previous, allRoles, play).split('\n');
  const keep = matchLines(oldRaw, parsed.map((p) => p.raw.trimEnd()));
  const lines = parsed.map((p, i): TextLine => {
    const old = keep[i] !== undefined ? previous[keep[i]!] : undefined;
    return {
      id: old?.id ?? newId(),
      text: p.text,
      ...(p.roleId ? { roleId: p.roleId } : {}),
      ...(p.direction ? { direction: true } : {}),
      ...(old?.atSec !== undefined ? { atSec: old.atSec } : {}),
    };
  });
  // nur Rollen behalten, die schon da waren oder jetzt gebraucht werden
  const used = new Set(lines.map((l) => l.roleId).filter(Boolean));
  return { lines, roles: allRoles.filter((r) => roles.includes(r) || used.has(r.id)) };
}

/** Index der alten Zeile je neuer Zeile (oder undefined = neu). */
function matchLines(oldLines: string[], newLines: string[]): (number | undefined)[] {
  const n = oldLines.length;
  const m = newLines.length;
  // längste gemeinsame Folge
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i]![j] = oldLines[i] === newLines[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const anchors: [number, number][] = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (oldLines[i] === newLines[j]) {
      anchors.push([i, j]);
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) i++;
    else j++;
  }
  const result: (number | undefined)[] = new Array(m).fill(undefined);
  let prevOld = -1;
  let prevNew = -1;
  for (const [oi, nj] of [...anchors, [n, m] as [number, number]]) {
    // geänderte Zeilen zwischen zwei gleichen: der Reihe nach zuordnen (Tippfehler behalten ihre Kennung)
    const gapOld = oi - prevOld - 1;
    const gapNew = nj - prevNew - 1;
    for (let k = 0; k < Math.min(gapOld, gapNew); k++) result[prevNew + 1 + k] = prevOld + 1 + k;
    if (nj < m) result[nj] = oi;
    prevOld = oi;
    prevNew = nj;
  }
  return result;
}

// ---------- Text einfügen (ganzer Text → Abschnitte) ----------

const HEADER_KINDS: [RegExp, SectionKind, string][] = [
  [/^(refrain|chorus|ref\.?)/i, 'chorus', 'Refrain'],
  [/^(strophe|vers|verse)/i, 'verse', 'Strophe'],
  [/^(bridge)/i, 'bridge', 'Bridge'],
  [/^(intro)/i, 'intro', 'Intro'],
  [/^(outro|schluss)/i, 'outro', 'Outro'],
  [/^(solo)/i, 'solo', 'Solo'],
  [/^(szene|auftritt|akt)/i, 'scene', 'Szene'],
];

export interface PastedSection {
  kind: SectionKind;
  label: string;
  text: string;
}

/** Ganzen Text zerlegen: Leerzeilen trennen Abschnitte; Überschriften wie „[Refrain]“ oder „Strophe 2:“ werden erkannt. */
export function splitPastedText(text: string, itemKind: ShowItemKind): PastedSection[] {
  const blocks = text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((b) => b.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim()))
    .filter((b) => b.length);
  const counts = new Map<SectionKind, number>();
  return blocks.map((lines) => {
    const first = lines[0]!.trim().replace(/^\[(.*)\]$/, '$1').replace(/:$/, '').trim();
    const header = first.length <= 30 ? HEADER_KINDS.find(([re]) => re.test(first)) : undefined;
    const isHeaderLine = !!header && (lines[0]!.trim().startsWith('[') || lines[0]!.trim().endsWith(':') || first.split(/\s+/).length <= 3);
    const kind: SectionKind = header && isHeaderLine ? header[1] : itemKind === 'play' ? 'scene' : 'verse';
    const n = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, n);
    const label = header && isHeaderLine ? first : defaultSectionLabel(kind, n);
    return { kind, label, text: (header && isHeaderLine ? lines.slice(1) : lines).join('\n') };
  });
}

export const SECTION_KIND_LABELS: Record<SectionKind, string> = {
  intro: 'Intro',
  verse: 'Strophe',
  chorus: 'Refrain',
  bridge: 'Bridge',
  solo: 'Solo',
  outro: 'Outro',
  scene: 'Szene',
  other: 'Abschnitt',
};

export function defaultSectionLabel(kind: SectionKind, n: number): string {
  return kind === 'verse' || kind === 'scene' || kind === 'other' ? `${SECTION_KIND_LABELS[kind]} ${n}` : SECTION_KIND_LABELS[kind];
}

/** Bezeichnung für einen neuen Abschnitt dieser Art (z. B. „Strophe 3“, wenn es zwei gibt). */
export function nextSectionLabel(kind: SectionKind, existing: TextSection[]): string {
  return defaultSectionLabel(kind, existing.filter((s) => s.kind === kind).length + 1);
}

// ---------- Änderungen am Live-Dokument ----------

function setFields(map: Y.Map<unknown>, patch: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) map.delete(key);
    else map.set(key, value);
  }
}

function itemsMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>('showItems');
}
function sectionsMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>('showSections');
}

/** Neuer Eintrag am Ende bzw. nach afterId; gibt die Kennung zurück. */
// ---------- Nummern und Timecode ----------

/**
 * Feste Nummer je Eintrag (= Stunde im Timecode). Einträge ohne gespeicherte Nummer (ältere Projekte)
 * bekommen in Ablauf-Reihenfolge die nächsten freien Nummern – für alle Geräte gleich.
 */
export function itemNumbers(items: Pick<ShowItem, 'id' | 'number'>[]): Map<string, number> {
  const used = new Set(items.flatMap((i) => (i.number !== undefined ? [i.number] : [])));
  const result = new Map<string, number>();
  let next = 1;
  for (const item of items) {
    if (item.number !== undefined) {
      result.set(item.id, item.number);
      continue;
    }
    while (used.has(next)) next++;
    used.add(next);
    result.set(item.id, next);
  }
  return result;
}

/** Nächste freie Nummer (größte + 1) */
export function nextItemNumber(items: Pick<ShowItem, 'id' | 'number'>[]): number {
  return Math.min(999, Math.max(0, ...itemNumbers(items).values()) + 1);
}

/** Abgeleitete Nummern (ältere Projekte) speichern – vor Umsortieren und Löschen, damit sie dabei bleiben */
function pinItemNumbers(doc: Y.Doc): void {
  const items = readShow(doc).items;
  if (items.every((i) => i.number !== undefined)) return;
  for (const [id, number] of itemNumbers(items)) {
    const map = itemsMap(doc).get(id);
    if (map && map.get('number') === undefined) map.set('number', number);
  }
}

/** Alle Einträge in Ablauf-Reihenfolge neu durchnummerieren (1, 2, 3 …) */
export function renumberShowItems(doc: Y.Doc, origin: unknown): void {
  doc.transact(() => {
    readShow(doc).items.forEach((item, i) => itemsMap(doc).get(item.id)?.set('number', i + 1));
  }, origin);
}

/** Timecode-Bildrate (EBU) */
export const TIMECODE_FPS = 25;

/** „HH:MM:SS:FF“ – gelaufene Zeit des Eintrags; jeder Eintrag beginnt bei 00:00:00:00 */
export function formatTimecode(sec: number, fps = TIMECODE_FPS): string {
  const totalFrames = Math.max(0, Math.floor(sec * fps + 1e-6));
  const frames = totalFrames % fps;
  const totalSec = Math.floor(totalFrames / fps);
  const pad = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(totalSec / 3600) % 24;
  return `${pad(h)}:${pad(Math.floor(totalSec / 60) % 60)}:${pad(totalSec % 60)}:${pad(frames)}`;
}

/** Art-Net: UDP-Port */
export const ARTNET_PORT = 6454;

/**
 * ArtTimeCode-Paket (Art-Net 4, OpTimeCode 0x9700), 19 Bytes: „Art-Net\0“, OpCode (little endian), Protokoll 14,
 * zwei Füllbytes, Frames, Sekunden, Minuten, Stunden, Typ (1 = EBU 25 fps).
 */
export function artTimecodePacket(sec: number, fps = TIMECODE_FPS): Uint8Array {
  const totalFrames = Math.max(0, Math.floor(sec * fps + 1e-6));
  const totalSec = Math.floor(totalFrames / fps);
  const packet = new Uint8Array(19);
  packet.set([0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00], 0); // „Art-Net\0“
  packet[8] = 0x00; // OpCode low
  packet[9] = 0x97; // OpCode high
  packet[10] = 0; // ProtVerHi
  packet[11] = 14; // ProtVerLo
  packet[14] = totalFrames % fps;
  packet[15] = totalSec % 60;
  packet[16] = Math.floor(totalSec / 60) % 60;
  packet[17] = Math.floor(totalSec / 3600) % 24;
  packet[18] = fps === 24 ? 0 : fps === 30 ? 3 : 1;
  return packet;
}

/** Zieladresse für Art-Net prüfen (IPv4, auch Broadcast) */
export function isArtNetHost(host: string): boolean {
  const parts = host.trim().split('.');
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

export function addShowItem(doc: Y.Doc, kind: ShowItemKind, origin: unknown, init: Partial<Omit<ShowItem, 'id' | 'kind' | 'order'>> = {}, afterId?: string): string {
  const id = newId();
  doc.transact(() => {
    const items = readShow(doc).items;
    const map = new Y.Map<unknown>();
    itemsMap(doc).set(id, map);
    setFields(map, { personIds: [], title: '', ...init, id, kind, order: items.length, number: nextItemNumber(items) });
    if (afterId) moveShowItem(doc, id, items.findIndex((i) => i.id === afterId) + 1, origin);
  }, origin);
  return id;
}

export function updateShowItem(doc: Y.Doc, id: string, patch: Partial<Omit<ShowItem, 'id'>>, origin: unknown): void {
  const map = itemsMap(doc).get(id);
  if (!map) return;
  doc.transact(() => setFields(map, patch), origin);
}

/** Eintrag mit seinen Texten löschen. */
export function removeShowItem(doc: Y.Doc, id: string, origin: unknown): void {
  doc.transact(() => {
    pinItemNumbers(doc);
    itemsMap(doc).delete(id);
    const backgrounds = new Set<string>();
    for (const s of readShow(doc).sections) {
      if (s.itemId !== id) continue;
      if (s.backgroundMediaId) backgrounds.add(s.backgroundMediaId);
      sectionsMap(doc).delete(s.id);
    }
    for (const mediaId of backgrounds) if (!mediaInUse(doc, mediaId)) doc.getMap('media').delete(mediaId);
    removeItemScenes(doc, id);
    removeItemSoundScenes(doc, id);
    renumber(doc, readShow(doc).items.map((i) => i.id));
  }, origin);
}

function renumber(doc: Y.Doc, ids: string[], map = itemsMap(doc)): void {
  ids.forEach((id, index) => {
    const m = map.get(id);
    if (m && m.get('order') !== index) m.set('order', index);
  });
}

/** Eintrag an Position toIndex (0 = oben) verschieben. */
export function moveShowItem(doc: Y.Doc, id: string, toIndex: number, origin: unknown): void {
  doc.transact(() => {
    pinItemNumbers(doc);
    const ids = readShow(doc).items.map((i) => i.id).filter((x) => x !== id);
    ids.splice(Math.max(0, Math.min(toIndex, ids.length)), 0, id);
    renumber(doc, ids);
  }, origin);
}

/** Eintrag mit Texten kopieren (direkt dahinter). */
export function duplicateShowItem(doc: Y.Doc, id: string, origin: unknown): string | undefined {
  const { items, sections } = readShow(doc);
  const item = items.find((i) => i.id === id);
  if (!item) return undefined;
  let copyId = '';
  doc.transact(() => {
    const { id: _id, kind, order: _order, ...rest } = item;
    copyId = addShowItem(doc, kind, origin, { ...rest, title: `${item.title} (Kopie)` }, id);
    const lineIds = new Map<string, string>();
    for (const s of itemSections(sections, id)) {
      const lines = s.lines.map((l) => {
        const next = newId();
        lineIds.set(l.id, next);
        return { ...l, id: next };
      });
      const sectionCopy = addSection(doc, copyId, s.kind, s.label, origin, lines);
      copySectionBackground(doc, s, sectionCopy, origin);
    }
    copyItemScenes(doc, id, copyId, lineIds);
    copyItemSoundScenes(doc, id, copyId, lineIds);
  }, origin);
  return copyId;
}

export function updateShowSettings(doc: Y.Doc, patch: Partial<ShowSettings>, origin: unknown): void {
  doc.transact(() => setFields(doc.getMap('showSettings'), patch), origin);
}

/**
 * Hintergrundbild des Textfensters setzen (Verweis im Projekt, damit die Datei erhalten bleibt) bzw. entfernen (null).
 * Ein ersetztes oder entferntes Bild verliert seinen Verweis, wenn es sonst nirgends verwendet wird.
 */
export function setLyricsBackground(doc: Y.Doc, ref: MediaRef | null, origin: unknown, dim = 0.5): void {
  doc.transact(() => {
    const settings = doc.getMap('showSettings');
    const media = doc.getMap<Y.Map<unknown>>('media');
    const old = (settings.get('lyricsBackground') as { mediaId?: string } | undefined)?.mediaId;
    if (ref) {
      if (!media.has(ref.id)) {
        const map = new Y.Map<unknown>();
        media.set(ref.id, map);
        setFields(map, { ...ref });
      }
      settings.set('lyricsBackground', { mediaId: ref.id, dim });
    } else settings.delete('lyricsBackground');
    if (old && old !== ref?.id && !mediaInUse(doc, old)) media.delete(old);
  }, origin);
}

/** Abdunkeln des Hintergrundbilds ändern (0–1) */
export function setLyricsBackgroundDim(doc: Y.Doc, dim: number, origin: unknown): void {
  const settings = doc.getMap('showSettings');
  const current = settings.get('lyricsBackground') as { mediaId: string; dim: number } | undefined;
  if (!current) return;
  doc.transact(() => settings.set('lyricsBackground', { ...current, dim: Math.min(1, Math.max(0, dim)) }), origin);
}

/** Neuer Abschnitt am Ende des Eintrags bzw. nach afterId. */
export function addSection(doc: Y.Doc, itemId: string, kind: SectionKind, label: string, origin: unknown, lines: TextLine[] = [], afterId?: string): string {
  const id = newId();
  doc.transact(() => {
    const existing = itemSections(readShow(doc).sections, itemId);
    const map = new Y.Map<unknown>();
    sectionsMap(doc).set(id, map);
    setFields(map, { id, itemId, kind, label, lines, order: existing.length });
    if (afterId) {
      const ids = existing.map((s) => s.id);
      ids.splice(ids.indexOf(afterId) + 1, 0, id);
      renumber(doc, ids, sectionsMap(doc));
    }
  }, origin);
  return id;
}

export function updateSection(doc: Y.Doc, id: string, patch: Partial<Omit<TextSection, 'id' | 'itemId'>>, origin: unknown): void {
  const map = sectionsMap(doc).get(id);
  if (!map) return;
  doc.transact(() => setFields(map, patch), origin);
}

export function removeSection(doc: Y.Doc, id: string, origin: unknown): void {
  const section = readShow(doc).sections.find((s) => s.id === id);
  if (!section) return;
  doc.transact(() => {
    sectionsMap(doc).delete(id);
    if (section.backgroundMediaId && !mediaInUse(doc, section.backgroundMediaId)) doc.getMap('media').delete(section.backgroundMediaId);
    renumber(doc, itemSections(readShow(doc).sections, section.itemId).map((s) => s.id), sectionsMap(doc));
  }, origin);
}

/** Abschnitt um eine Stelle nach oben (-1) oder unten (+1) schieben. */
export function moveSection(doc: Y.Doc, id: string, delta: -1 | 1, origin: unknown): void {
  const section = readShow(doc).sections.find((s) => s.id === id);
  if (!section) return;
  const ids = itemSections(readShow(doc).sections, section.itemId).map((s) => s.id);
  const from = ids.indexOf(id);
  const to = from + delta;
  if (to < 0 || to >= ids.length) return;
  ids.splice(from, 1);
  ids.splice(to, 0, id);
  doc.transact(() => renumber(doc, ids, sectionsMap(doc)), origin);
}

/** Abschnitt kopieren (z. B. Refrain wiederholen), direkt dahinter. */
export function duplicateSection(doc: Y.Doc, id: string, origin: unknown): string | undefined {
  const section = readShow(doc).sections.find((s) => s.id === id);
  if (!section) return undefined;
  const copy = addSection(doc, section.itemId, section.kind, section.label, origin, section.lines.map((l) => ({ ...l, id: newId() })), id);
  copySectionBackground(doc, section, copy, origin);
  return copy;
}

function copySectionBackground(doc: Y.Doc, from: TextSection, toId: string, origin: unknown): void {
  if (from.backgroundMediaId === undefined && from.backgroundInherit === undefined) return;
  updateSection(doc, toId, { backgroundMediaId: from.backgroundMediaId, backgroundInherit: from.backgroundInherit }, origin);
}

// ---------- Hintergrundbilder der Abschnitte (Textfenster) ----------

/** Wird die Datei noch verwendet (Audio an einem Eintrag, Standard-Hintergrund, Hintergrund eines Abschnitts)? */
export function mediaInUse(doc: Y.Doc, mediaId: string): boolean {
  const { items, sections } = readShow(doc);
  if (items.some((i) => i.media?.some((m) => m.mediaId === mediaId))) return true;
  if ((doc.getMap('showSettings').get('lyricsBackground') as { mediaId?: string } | undefined)?.mediaId === mediaId) return true;
  return sections.some((s) => s.backgroundMediaId === mediaId);
}

/** Hintergrundbild eines Abschnitts setzen (Verweis im Projekt) bzw. entfernen (null) */
export function setSectionBackground(doc: Y.Doc, sectionId: string, ref: MediaRef | null, origin: unknown): void {
  const map = sectionsMap(doc).get(sectionId);
  if (!map) return;
  doc.transact(() => {
    const media = doc.getMap<Y.Map<unknown>>('media');
    const old = map.get('backgroundMediaId') as string | undefined;
    if (ref) {
      if (!media.has(ref.id)) {
        const m = new Y.Map<unknown>();
        media.set(ref.id, m);
        setFields(m, { ...ref });
      }
      map.set('backgroundMediaId', ref.id);
    } else map.delete('backgroundMediaId');
    if (old && old !== ref?.id && !mediaInUse(doc, old)) media.delete(old);
  }, origin);
}

/**
 * Hintergrundbild für einen Abschnitt im Textfenster: eigenes Bild; sonst (wenn nicht abgeschaltet) das des letzten
 * früheren Abschnitts desselben Eintrags mit Bild; sonst das Standardbild (fallback).
 */
export function sectionBackground(itemSectionsInOrder: Pick<TextSection, 'id' | 'backgroundMediaId' | 'backgroundInherit'>[], sectionId: string | undefined, fallback: string | undefined): string | undefined {
  const index = itemSectionsInOrder.findIndex((s) => s.id === sectionId);
  if (index < 0) return fallback;
  const own = itemSectionsInOrder[index]!;
  if (own.backgroundMediaId) return own.backgroundMediaId;
  if (own.backgroundInherit !== false) {
    for (let i = index - 1; i >= 0; i--) {
      const id = itemSectionsInOrder[i]!.backgroundMediaId;
      if (id) return id;
    }
  }
  return fallback;
}

/** Text eines Abschnitts setzen (Zeilen mit stabilen Kennungen; beim Schauspiel neue Rollen am Eintrag). */
export function setSectionText(doc: Y.Doc, sectionId: string, text: string, origin: unknown): void {
  const { items, sections } = readShow(doc);
  const section = sections.find((s) => s.id === sectionId);
  const item = items.find((i) => i.id === section?.itemId);
  if (!section || !item) return;
  const play = item.kind === 'play';
  const result = parseSectionText(text, section.lines, item.roles ?? [], play);
  doc.transact(() => {
    sectionsMap(doc).get(sectionId)?.set('lines', result.lines);
    if (play && result.roles.length !== (item.roles ?? []).length) itemsMap(doc).get(item.id)?.set('roles', result.roles);
  }, origin);
}

/** Ganzen Text einfügen: hängt die erkannten Abschnitte an den Eintrag an. */
export function appendPastedText(doc: Y.Doc, itemId: string, text: string, origin: unknown): string[] {
  const item = readShow(doc).items.find((i) => i.id === itemId);
  if (!item) return [];
  const ids: string[] = [];
  doc.transact(() => {
    for (const part of splitPastedText(text, item.kind)) {
      const id = addSection(doc, itemId, part.kind, part.label, origin);
      setSectionText(doc, id, part.text, origin);
      ids.push(id);
    }
  }, origin);
  return ids;
}

// ---------- Medien (Audio) am Lied ----------

export function readMedia(doc: Y.Doc): MediaRef[] {
  return Object.values(doc.getMap('media').toJSON() as Record<string, MediaRef>).sort((a, b) => a.addedAt.localeCompare(b.addedAt) || a.id.localeCompare(b.id));
}

/** Standard-Audio eines Eintrags (markiert, sonst das erste). */
export function defaultItemMedia(item: ShowItem): ItemMedia | undefined {
  return item.media?.find((m) => m.isDefault) ?? item.media?.[0];
}

/** Hochgeladene Datei am Eintrag anhängen (Verweis im Projekt + Eintrag); die erste wird Standard. */
export function addItemMedia(doc: Y.Doc, itemId: string, ref: MediaRef, label: string, origin: unknown): void {
  const item = readShow(doc).items.find((i) => i.id === itemId);
  if (!item) return;
  doc.transact(() => {
    const media = doc.getMap<Y.Map<unknown>>('media');
    if (!media.has(ref.id)) {
      const map = new Y.Map<unknown>();
      media.set(ref.id, map);
      setFields(map, { ...ref });
    }
    const list = (item.media ?? []).filter((m) => m.mediaId !== ref.id);
    list.push({ mediaId: ref.id, label, ...(list.length === 0 ? { isDefault: true } : {}) });
    itemsMap(doc).get(itemId)?.set('media', list);
  }, origin);
}

/** Datei vom Eintrag lösen; wird sie nirgends mehr verwendet, auch den Verweis (die Datei kommt in den Papierkorb). */
export function removeItemMedia(doc: Y.Doc, itemId: string, mediaId: string, origin: unknown): void {
  const { items } = readShow(doc);
  const item = items.find((i) => i.id === itemId);
  if (!item) return;
  doc.transact(() => {
    let list = (item.media ?? []).filter((m) => m.mediaId !== mediaId);
    if (list.length && !list.some((m) => m.isDefault)) list = list.map((m, i) => (i === 0 ? { ...m, isDefault: true } : m));
    itemsMap(doc).get(itemId)?.set('media', list);
    if (!mediaInUse(doc, mediaId)) doc.getMap('media').delete(mediaId);
  }, origin);
}

export function updateItemMedia(doc: Y.Doc, itemId: string, mediaId: string, patch: { label?: string; isDefault?: true }, origin: unknown): void {
  const item = readShow(doc).items.find((i) => i.id === itemId);
  if (!item?.media) return;
  const list = item.media.map((m) => {
    if (m.mediaId === mediaId) return { ...m, ...(patch.label !== undefined ? { label: patch.label } : {}), ...(patch.isDefault ? { isDefault: true } : {}) };
    if (patch.isDefault) {
      const { isDefault: _d, ...rest } = m;
      return rest;
    }
    return m;
  });
  doc.transact(() => itemsMap(doc).get(itemId)?.set('media', list), origin);
}

// ---------- Zeitpunkte der Textzeilen (mitlaufender Text) ----------

export interface TimedLine {
  sectionId: string;
  sectionLabel: string;
  line: TextLine;
}

/** Alle Zeilen eines Eintrags in Reihenfolge (über die Abschnitte). */
export function itemLines(sections: TextSection[], itemId: string): TimedLine[] {
  return itemSections(sections, itemId).flatMap((s) => s.lines.map((line) => ({ sectionId: s.id, sectionLabel: s.label, line })));
}

/** Versatz, um den die Textzeiten verschoben werden (nur wenn „Versatz gilt auch für den Text“) */
export function textOffset(item: Pick<ShowItem, 'audioOffsetSec' | 'audioOffsetText'>): number {
  return item.audioOffsetText ? (item.audioOffsetSec ?? 0) : 0;
}

/**
 * Zeilen eines Eintrags mit Zeitpunkten auf der Zeitachse des Punkts (Timecode): gilt der Audio-Versatz auch für den
 * Text, zählen die gespeicherten Zeiten ab Musikbeginn und werden um den Versatz verschoben.
 */
export function itemTimedLines(sections: TextSection[], item: Pick<ShowItem, 'id' | 'audioOffsetSec' | 'audioOffsetText'>): TimedLine[] {
  const lines = itemLines(sections, item.id);
  const offset = textOffset(item);
  if (!offset) return lines;
  return lines.map((l) => (l.line.atSec === undefined ? l : { ...l, line: { ...l.line, atSec: l.line.atSec + offset } }));
}

/** Aktuelle Zeile zur Abspielzeit: die letzte Zeile mit Zeitpunkt ≤ t (Reihenfolge des Textes). */
export function currentLineId(lines: TimedLine[], t: number): string | undefined {
  let current: string | undefined;
  for (const { line } of lines) if (line.atSec !== undefined && line.atSec <= t + 0.05) current = line.id;
  return current;
}

/** Erste Zeile ohne Zeitpunkt nach der letzten Zeile mit Zeitpunkt („Nächste Zeile“ beim Mitschreiben). */
export function nextUntimedLine(lines: TimedLine[]): TimedLine | undefined {
  let lastTimed = -1;
  lines.forEach((l, i) => {
    if (l.line.atSec !== undefined) lastTimed = i;
  });
  return lines.slice(lastTimed + 1).find((l) => l.line.atSec === undefined);
}

/** Zeitpunkt einer Zeile setzen (undefined = entfernen); auf eine Zehntelsekunde gerundet. */
export function setLineTime(doc: Y.Doc, sectionId: string, lineId: string, atSec: number | undefined, origin: unknown): void {
  const section = readShow(doc).sections.find((s) => s.id === sectionId);
  if (!section) return;
  const lines = section.lines.map((l) => {
    if (l.id !== lineId) return l;
    const { atSec: _old, ...rest } = l;
    return atSec === undefined ? rest : { ...rest, atSec: Math.max(0, Math.round(atSec * 10) / 10) };
  });
  doc.transact(() => sectionsMap(doc).get(sectionId)?.set('lines', lines), origin);
}

/** Alle Zeitpunkte eines Eintrags löschen (neu mitschreiben). */
export function clearLineTimes(doc: Y.Doc, itemId: string, origin: unknown): void {
  doc.transact(() => {
    for (const s of itemSections(readShow(doc).sections, itemId)) {
      if (!s.lines.some((l) => l.atSec !== undefined)) continue;
      sectionsMap(doc).get(s.id)?.set('lines', s.lines.map(({ atSec: _a, ...rest }) => rest));
    }
  }, origin);
}
