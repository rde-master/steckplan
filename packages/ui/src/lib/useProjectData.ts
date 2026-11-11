// Projektdaten aus dem Live-Dokument lesen (rendert bei Änderungen neu; gelesen wird nur, was sich geändert hat).
import { useMemo, useSyncExternalStore } from 'react';
import type * as Y from 'yjs';
import {
  readBackground,
  readCables,
  readCaseTrailers,
  readDevices,
  readFlowPages,
  readGigs,
  readHandovers,
  readHelperMessages,
  readHelperSignups,
  readGroups,
  readLayers,
  readPatch,
  readPeople,
  readSettings,
  readShapes,
  readLightGrid,
  readLightPlacements,
  readLightTargets,
  readMedia,
  readScenes,
  readSoundScenes,
  readSceneStates,
  readShow,
  readSubnets,
  readWifi,
  type Background,
  type Cable,
  type CaseTrailer,
  type DeviceInstance,
  type FlowPage,
  type Gig,
  type Handover,
  type HelperMessage,
  type HelperSignup,
  type Group,
  type PatchEntry,
  type Person,
  type Project,
  type ProjectSettings,
  type Shape,
  type FixtureState,
  type LightGrid,
  type LightScene,
  type LightPlacement,
  type LightTarget,
  type MediaRef,
  type ShowData,
  type ShowSettings,
  type SoundScene,
  readTrailerTrips,
  type TrailerTrip,
  readLightEvents,
  type LightEvent,
  readOscCommands,
  type OscCommand,
} from '@steckplan/core';

export interface ProjectData {
  devices: DeviceInstance[];
  cables: Cable[];
  layers: Project['layers'];
  shapes: Shape[];
  background: Background | undefined;
  settings: Partial<ProjectSettings>;
  network: Project['network'];
  people: Person[];
  groups: Group[];
  caseTrailers: CaseTrailer[];
  patch: PatchEntry[];
  flowPages: FlowPage[];
  /** Regie: Ablauf und Texte */
  show: ShowData;
  showSettings: ShowSettings;
  /** Verweise auf Audiodateien im Medienspeicher */
  media: MediaRef[];
  /** Lichtaufbau */
  lightGrid: LightGrid;
  lightPlacements: LightPlacement[];
  lightTargets: LightTarget[];
  /** Lichtszenen und Werte je Gerät */
  lightScenes: LightScene[];
  sceneStates: FixtureState[];
  /** Tonszenen */
  soundScenes: SoundScene[];
  gigs: Gig[];
  helperSignups: HelperSignup[];
  trailerTrips: TrailerTrip[];
  lightEvents: LightEvent[];
  oscCommands: OscCommand[];
  helperMessages: HelperMessage[];
  handovers: Handover[];
}

const EMPTY: ProjectData = {
  devices: [],
  cables: [],
  layers: [],
  shapes: [],
  background: undefined,
  settings: {},
  network: { subnets: [], wifi: [] },
  people: [],
  groups: [],
  caseTrailers: [],
  patch: [],
  flowPages: [],
  show: { items: [], sections: [] },
  showSettings: {},
  media: [],
  lightGrid: { cols: 12, rows: 6, rowLabels: [] },
  lightPlacements: [],
  lightTargets: [],
  lightScenes: [],
  sceneStates: [],
  soundScenes: [],
  gigs: [],
  helperSignups: [],
  trailerTrips: [],
  lightEvents: [],
  oscCommands: [],
  helperMessages: [],
  handovers: [],
};

/** Je Teil der Projektdaten die Funktion, die ihn aus dem Dokument liest */
const READERS: { [K in keyof ProjectData]: (doc: Y.Doc) => ProjectData[K] } = {
  devices: readDevices,
  cables: readCables,
  layers: readLayers,
  shapes: readShapes,
  background: readBackground,
  settings: readSettings,
  network: (doc) => ({ subnets: readSubnets(doc), wifi: readWifi(doc) }),
  people: readPeople,
  groups: readGroups,
  caseTrailers: readCaseTrailers,
  patch: readPatch,
  flowPages: readFlowPages,
  show: readShow,
  showSettings: (doc) => doc.getMap('showSettings').toJSON() as ShowSettings,
  media: readMedia,
  lightGrid: readLightGrid,
  lightPlacements: readLightPlacements,
  lightTargets: readLightTargets,
  lightScenes: readScenes,
  sceneStates: readSceneStates,
  soundScenes: readSoundScenes,
  gigs: readGigs,
  helperSignups: readHelperSignups,
  trailerTrips: readTrailerTrips,
  lightEvents: readLightEvents,
  oscCommands: readOscCommands,
  helperMessages: readHelperMessages,
  handovers: readHandovers,
};

/**
 * Einen Teil lesen und dabei mitschreiben, aus welchen Bereichen des Dokuments (doc.getMap) er stammt.
 * Greift eine Lesefunktion anders auf das Dokument zu, gilt „unbekannt“ (null) – der Teil wird dann immer neu gelesen.
 */
function readTracked<T>(doc: Y.Doc, reader: (doc: Y.Doc) => T): { value: T; roots: Set<string> | null } {
  const roots = new Set<string>();
  let unknown = false;
  const tracking = new Proxy(doc, {
    get(target, prop) {
      if (prop === 'getMap') {
        return (name: string) => {
          roots.add(name);
          return target.getMap(name);
        };
      }
      unknown = true;
      const value: unknown = Reflect.get(target, prop, target);
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
  const value = reader(tracking);
  return { value, roots: unknown ? null : roots };
}

/** Namen der Bereiche (oberste Ebene des Dokuments), in denen eine Transaktion etwas geändert hat */
function changedRoots(doc: Y.Doc, transaction: Y.Transaction): Set<string> {
  const names = new Map<unknown, string>();
  for (const [name, type] of doc.share) names.set(type, name);
  const changed = new Set<string>();
  // changedParentTypes enthält jeden geänderten Typ samt allen Eltern – also auch den Bereich selbst
  for (const type of transaction.changedParentTypes.keys()) {
    const name = names.get(type);
    if (name !== undefined) changed.add(name);
  }
  return changed;
}

export interface ProjectDataStore {
  get(): ProjectData;
  subscribe(onChange: () => void): () => void;
}

/**
 * Projektdaten zum Dokument. Nach einer Änderung werden nur die betroffenen Teile neu gelesen; alle anderen
 * behalten ihr Objekt (gleiche Identität) – abgeleitete Werte (useMemo über data.devices usw.) rechnen dann nicht
 * neu, z. B. beim Mitschreiben von Textzeiten nicht die Geräte, Kabel und Lichtwerte. Ändert eine Transaktion
 * nichts, wird auch nicht neu gerendert.
 */
export function createProjectDataStore(doc: Y.Doc): ProjectDataStore {
  const keys = Object.keys(READERS) as (keyof ProjectData)[];
  const roots = new Map<keyof ProjectData, Set<string> | null>();
  const readPart = <K extends keyof ProjectData>(key: K): ProjectData[K] => {
    const part = readTracked(doc, READERS[key]);
    roots.set(key, part.roots);
    return part.value;
  };
  const readAll = (): ProjectData => {
    const data: Partial<Record<keyof ProjectData, unknown>> = {};
    for (const key of keys) data[key] = readPart(key);
    return data as ProjectData;
  };
  let snapshot = readAll();
  const listeners = new Set<() => void>();
  const handler = (transaction: Y.Transaction) => {
    const changed = changedRoots(doc, transaction);
    let next: Partial<Record<keyof ProjectData, unknown>> | null = null;
    for (const key of keys) {
      const from = roots.get(key);
      if (from && ![...from].some((name) => changed.has(name))) continue;
      next ??= { ...snapshot };
      next[key] = readPart(key);
    }
    if (!next) return;
    snapshot = next as ProjectData;
    for (const listener of listeners) listener();
  };
  return {
    get: () => snapshot,
    subscribe(onChange) {
      if (listeners.size === 0) {
        // Zwischen Anlegen und Abonnieren kann sich das Dokument geändert haben: alles neu lesen, aber nur
        // Geändertes übernehmen (sonst würde jedes Abonnieren neu rendern).
        const fresh = readAll();
        let next: Partial<Record<keyof ProjectData, unknown>> | null = null;
        for (const key of keys) {
          if (JSON.stringify(fresh[key]) === JSON.stringify(snapshot[key])) continue;
          next ??= { ...snapshot };
          next[key] = fresh[key];
        }
        if (next) snapshot = next as ProjectData;
        doc.on('afterTransaction', handler);
      }
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
        if (listeners.size === 0) doc.off('afterTransaction', handler);
      };
    },
  };
}

export function useProjectData(doc: Y.Doc | undefined): ProjectData {
  const store = useMemo(() => (doc ? createProjectDataStore(doc) : null), [doc]);
  return useSyncExternalStore(store?.subscribe ?? noopSubscribe, store?.get ?? getEmpty);
}

const noopSubscribe = () => () => undefined;
const getEmpty = () => EMPTY;
