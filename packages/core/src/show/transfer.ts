// Regie exportieren und importieren: nur die Inhalte der Regie (Ablauf, Texte, Einstellungen, Licht- und Tonszenen,
// Lichtaufbau) als eigene Datei – ohne Medien. Zum Sichern und um die Regie in ein anderes Projekt zu übertragen.
// Geräte und Personen werden beim Import zugeordnet (gleiche Kennung, sonst gleicher Name); was nicht passt, fällt weg.
// Der Import schreibt nur in die Bereiche der Regie (DIRECTION_ROOTS) – geht also auch mit dem Regie-Zugang.
import * as Y from 'yjs';
import { z } from 'zod';
import { newId } from '../model/project';
import { parseProject, ProjectFormatError } from '../model/migrations';
import { readRawProjectFromYDoc } from '../model/ydoc';
import {
  CURRENT_SCHEMA_VERSION,
  MediaRefSchema,
  type FixtureState,
  type LightGrid,
  type LightPlacement,
  type LightScene,
  type LightTarget,
  type MediaRef,
  type ShowItem,
  type ShowSettings,
  type SoundScene,
  type TextSection,
} from '../model/schema';
import { readDevices } from '../signalflow/doc-ops';
import { readPeople } from '../people/people';
import { VERSION } from '../version';
import { itemNumbers, lyricsImages, readMedia, readShow } from './show';
import { readLightTargets } from './light';
import { readScenes, readSceneStates, stateId } from './scenes';
import { readSoundScenes } from './sound';

/** Kennzeichen der Datei (Feld „format“) */
export const REGIE_FILE_FORMAT = 'steckplan-regie';

/** Inhalt einer Regie-Datei (validiert, auf die aktuelle Formatversion gebracht) */
export interface RegieContent {
  projectName: string;
  exportedAt: string;
  appVersion: string;
  items: ShowItem[];
  sections: TextSection[];
  showSettings: ShowSettings;
  lightGrid: LightGrid;
  lightPlacements: LightPlacement[];
  lightTargets: LightTarget[];
  lightScenes: LightScene[];
  sceneStates: FixtureState[];
  soundScenes: SoundScene[];
  /** Geräte und Personen der Quelle, auf die die Regie verweist (für die Zuordnung beim Import) */
  devices: { id: string; label: string }[];
  people: { id: string; firstName: string; lastName: string }[];
  /** verwendete Medien (nur die Verweise, nicht die Dateien) */
  media: MediaRef[];
}

// ---------- Export ----------

/** Regie des Dokuments als Datei-Inhalt (JSON-Objekt). */
export function exportRegie(doc: Y.Doc, projectName: string, now = new Date()): Record<string, unknown> {
  const raw = readRawProjectFromYDoc(doc) as Record<string, unknown>;
  const { items, sections } = readShow(doc);
  const states = readSceneStates(doc);
  const placements = Object.values(doc.getMap('lightPlacements').toJSON() as Record<string, LightPlacement>).sort((a, b) => a.id.localeCompare(b.id));
  const deviceIds = new Set([...states.map((s) => s.deviceId), ...placements.map((p) => p.id)]);
  const personIds = new Set(items.flatMap((i) => [...i.personIds, ...(i.roles ?? []).flatMap((r) => (r.personId ? [r.personId] : []))]));
  const mediaIds = usedMediaIds(items, sections, raw.showSettings as ShowSettings);
  return {
    format: REGIE_FILE_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appVersion: VERSION,
    exportedAt: now.toISOString(),
    projectName,
    show: { items, sections },
    showSettings: raw.showSettings,
    lightGrid: raw.lightGrid,
    lightPlacements: placements,
    lightTargets: readLightTargets(doc),
    lightScenes: readScenes(doc),
    sceneStates: states.sort((a, b) => a.id.localeCompare(b.id)),
    soundScenes: readSoundScenes(doc),
    devices: readDevices(doc)
      .filter((d) => deviceIds.has(d.id))
      .map((d) => ({ id: d.id, label: d.label })),
    people: readPeople(doc)
      .filter((p) => personIds.has(p.id))
      .map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName })),
    media: readMedia(doc).filter((m) => mediaIds.has(m.id)),
  };
}

/** Datei-Text (menschenlesbares JSON) */
export function serializeRegie(doc: Y.Doc, projectName: string, now = new Date()): string {
  return JSON.stringify(exportRegie(doc, projectName, now), null, 2) + '\n';
}

function usedMediaIds(items: ShowItem[], sections: TextSection[], settings: ShowSettings | undefined): Set<string> {
  const ids = new Set<string>();
  for (const i of items) for (const m of i.media ?? []) ids.add(m.mediaId);
  for (const s of sections) if (s.backgroundMediaId) ids.add(s.backgroundMediaId);
  for (const mediaId of lyricsImages(settings?.lyricsBackground)) ids.add(mediaId);
  return ids;
}

// ---------- Datei lesen ----------

const RefsSchema = z.object({
  projectName: z.string().default(''),
  exportedAt: z.string().default(''),
  appVersion: z.string().default(''),
  devices: z.array(z.object({ id: z.string().min(1), label: z.string().default('') })).default([]),
  people: z.array(z.object({ id: z.string().min(1), firstName: z.string().default(''), lastName: z.string().default('') })).default([]),
  media: z.array(MediaRefSchema).default([]),
});

/** Text einer Regie-Datei prüfen und lesen; ältere Formatversionen werden wie Projekte angehoben. */
export function parseRegieFile(text: string): RegieContent {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ProjectFormatError('Die Datei ist kein gültiges JSON.');
  }
  if (typeof json !== 'object' || json === null || (json as { format?: unknown }).format !== REGIE_FILE_FORMAT) {
    throw new ProjectFormatError('Die Datei ist kein Regie-Export von Steckplan.');
  }
  const file = json as Record<string, unknown>;
  // als (fast leeres) Projekt durch Migration und Prüfung schicken – so gelten dieselben Regeln wie für Projektdateien
  const project = parseProject({
    schemaVersion: file.schemaVersion,
    id: 'regie-import',
    show: file.show,
    showSettings: file.showSettings,
    lightGrid: file.lightGrid,
    lightPlacements: file.lightPlacements,
    lightTargets: file.lightTargets,
    lightScenes: file.lightScenes,
    sceneStates: file.sceneStates,
    soundScenes: file.soundScenes,
  });
  const refs = RefsSchema.safeParse(file);
  if (!refs.success) throw new ProjectFormatError('Die Datei ist beschädigt oder ungültig (Geräte, Personen oder Medien).');
  return {
    ...refs.data,
    items: project.show.items,
    sections: project.show.sections,
    showSettings: project.showSettings,
    lightGrid: project.lightGrid,
    lightPlacements: project.lightPlacements,
    lightTargets: project.lightTargets,
    lightScenes: project.lightScenes,
    sceneStates: project.sceneStates,
    soundScenes: project.soundScenes,
  };
}

// ---------- Import planen ----------

export type RegieImportMode = 'replace' | 'append';

export interface RegieImportPlan {
  /** Gerät der Datei → Gerät im Projekt */
  deviceMap: Map<string, string>;
  /** Geräte der Datei ohne Gegenstück (Bezeichnung) – ihre Werte und Plätze fallen weg */
  missingDevices: string[];
  personMap: Map<string, string>;
  /** Personen ohne Gegenstück (Name) – die Zuordnung fällt weg, Rollen bleiben */
  missingPeople: string[];
  /** Medien, die es im Projekt nicht gibt (Name) – Audio und Bilder fallen weg */
  missingMedia: string[];
  counts: { items: number; sections: number; lightScenes: number; soundScenes: number };
  /** Einträge, die im Projekt schon in der Regie sind (bei „Ersetzen“ fallen sie weg) */
  existingItems: number;
}

const key = (text: string) => text.trim().toLocaleLowerCase('de');

/** Zuordnung: gleiche Kennung, sonst eindeutig gleicher Name */
function matchByIdOrName<T extends { id: string }>(source: T[], target: T[], name: (x: T) => string): { map: Map<string, string>; missing: string[] } {
  const targetIds = new Set(target.map((t) => t.id));
  const byName = new Map<string, string | null>();
  for (const t of target) {
    const k = key(name(t));
    if (!k) continue;
    byName.set(k, byName.has(k) ? null : t.id);
  }
  const map = new Map<string, string>();
  const missing: string[] = [];
  for (const s of source) {
    const found = targetIds.has(s.id) ? s.id : (byName.get(key(name(s))) ?? undefined);
    if (found) map.set(s.id, found);
    else missing.push(name(s).trim() || s.id);
  }
  return { map, missing };
}

export function planRegieImport(doc: Y.Doc, content: RegieContent): RegieImportPlan {
  const devices = matchByIdOrName(content.devices, readDevices(doc), (d) => d.label);
  // Verweise auf Geräte, die schon in der Quelle fehlten (gelöscht): nur über die Kennung, sonst still weglassen
  const known = new Set(readDevices(doc).map((d) => d.id));
  for (const id of new Set([...content.sceneStates.map((s) => s.deviceId), ...content.lightPlacements.map((p) => p.id)])) {
    if (!devices.map.has(id) && known.has(id)) devices.map.set(id, id);
  }
  const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;
  const people = matchByIdOrName(content.people, readPeople(doc), fullName);
  const media = new Set(readMedia(doc).map((m) => m.id));
  const usedMedia = usedMediaIds(content.items, content.sections, content.showSettings);
  const names = new Map(content.media.map((m) => [m.id, m.name]));
  return {
    deviceMap: devices.map,
    missingDevices: devices.missing,
    personMap: people.map,
    missingPeople: people.missing,
    missingMedia: [...usedMedia].filter((id) => !media.has(id)).map((id) => names.get(id) || id),
    counts: { items: content.items.length, sections: content.sections.length, lightScenes: content.lightScenes.length, soundScenes: content.soundScenes.length },
    existingItems: readShow(doc).items.length,
  };
}

// ---------- Import ausführen ----------

function setFields(map: Y.Map<unknown>, values: Record<string, unknown>): void {
  for (const [k, value] of Object.entries(values)) if (value !== undefined) map.set(k, value);
}

function put(doc: Y.Doc, name: string, id: string, values: Record<string, unknown>): void {
  const map = new Y.Map<unknown>();
  doc.getMap<Y.Map<unknown>>(name).set(id, map);
  setFields(map, { ...values, id });
}

function clear(doc: Y.Doc, name: string): void {
  const map = doc.getMap(name);
  for (const k of [...map.keys()]) map.delete(k);
}

/**
 * Regie übernehmen. „replace“: bisherige Regie (Ablauf, Texte, Szenen, Lichtaufbau, Einstellungen) wird ersetzt,
 * Kennungen aus der Datei bleiben (Sicherung zurückspielen). „append“: Einträge kommen ans Ende des Ablaufs, alles
 * bekommt neue Kennungen; Einstellungen und Raster des Projekts bleiben, Lichtziele mit gleichem Namen werden geteilt,
 * Plätze im Lichtaufbau nur für Geräte ohne Platz. Medien-Verweise des Projekts werden nie gelöscht.
 */
export function applyRegieImport(doc: Y.Doc, content: RegieContent, plan: RegieImportPlan, mode: RegieImportMode, origin: unknown): void {
  const append = mode === 'append';
  const fresh = new Map<string, string>();
  const remap = (id: string): string => {
    if (!append) return id;
    let next = fresh.get(id);
    if (!next) {
      next = newId();
      fresh.set(id, next);
    }
    return next;
  };
  const media = new Set(readMedia(doc).map((m) => m.id));
  const person = (id: string | undefined) => (id ? plan.personMap.get(id) : undefined);

  doc.transact(() => {
    const existing = readShow(doc).items;
    if (!append) {
      for (const name of ['showItems', 'showSections', 'lightScenes', 'sceneStates', 'soundScenes', 'lightTargets', 'lightPlacements', 'showSettings', 'lightGrid']) clear(doc, name);
      const { lyricsBackground, ...settings } = content.showSettings;
      // nur Bilder, die mitgekommen sind
      const images = lyricsImages(lyricsBackground).filter((mediaId) => media.has(mediaId));
      const [first, ...rest] = images;
      const { slides: _slides, ...base } = lyricsBackground ?? { dim: 0.5 };
      setFields(doc.getMap('showSettings'), { ...settings, lyricsBackground: lyricsBackground && first ? { ...base, mediaId: first, ...(rest.length ? { slides: rest } : {}) } : undefined });
      setFields(doc.getMap('lightGrid'), { ...content.lightGrid });
    }

    // Lichtziele: beim Anhängen gleichnamige vorhandene verwenden
    const targetMap = new Map<string, string>();
    const currentTargets = append ? readLightTargets(doc) : [];
    for (const target of content.lightTargets) {
      const same = currentTargets.find((t) => key(t.name) !== '' && key(t.name) === key(target.name));
      if (same) {
        targetMap.set(target.id, same.id);
        continue;
      }
      const id = remap(target.id);
      targetMap.set(target.id, id);
      put(doc, 'lightTargets', id, { ...target, order: currentTargets.length + target.order });
    }

    // Einträge (beim Anhängen: hinten, mit den nächsten freien Nummern)
    const numbers = itemNumbers(existing);
    let nextNumber = Math.max(0, ...numbers.values());
    for (const item of content.items) {
      const roles = item.roles?.map((r) => ({ ...r, id: remap(r.id), personId: person(r.personId) }));
      put(doc, 'showItems', remap(item.id), {
        ...item,
        order: (append ? existing.length : 0) + item.order,
        number: append ? Math.min(999, ++nextNumber) : item.number,
        personIds: item.personIds.flatMap((p) => (plan.personMap.has(p) ? [plan.personMap.get(p)!] : [])),
        roles: roles?.map((r) => (r.personId ? r : { id: r.id, name: r.name })),
        media: item.media ? item.media.filter((m) => media.has(m.mediaId)) : undefined,
      });
    }

    // Abschnitte mit Zeilen
    for (const section of content.sections) {
      put(doc, 'showSections', remap(section.id), {
        ...section,
        itemId: remap(section.itemId),
        lines: section.lines.map((l) => ({ ...l, id: remap(l.id), ...(l.roleId ? { roleId: remap(l.roleId) } : {}) })),
        backgroundMediaId: section.backgroundMediaId && media.has(section.backgroundMediaId) ? section.backgroundMediaId : undefined,
      });
    }

    // Lichtszenen und Werte je Gerät
    for (const scene of content.lightScenes) {
      put(doc, 'lightScenes', remap(scene.id), { ...scene, itemId: remap(scene.itemId), lineId: scene.lineId ? remap(scene.lineId) : undefined });
    }
    for (const state of content.sceneStates) {
      const deviceId = plan.deviceMap.get(state.deviceId);
      if (!deviceId) continue;
      const sceneId = remap(state.sceneId);
      const { targetId, ...values } = state;
      put(doc, 'sceneStates', stateId(sceneId, deviceId), { ...values, sceneId, deviceId, targetId: targetId ? targetMap.get(targetId) : undefined });
    }

    // Tonszenen
    for (const scene of content.soundScenes) {
      put(doc, 'soundScenes', remap(scene.id), {
        ...scene,
        itemId: remap(scene.itemId),
        lineId: scene.lineId ? remap(scene.lineId) : undefined,
        lightSceneId: scene.lightSceneId ? remap(scene.lightSceneId) : undefined,
      });
    }

    // Lichtaufbau: Plätze der Geräte
    const placements = doc.getMap<Y.Map<unknown>>('lightPlacements');
    for (const placement of content.lightPlacements) {
      const deviceId = plan.deviceMap.get(placement.id);
      if (!deviceId || placements.has(deviceId)) continue;
      put(doc, 'lightPlacements', deviceId, { ...placement });
    }
  }, origin);
}
