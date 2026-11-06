// Geräte, Kabel und Ebenen aus dem Live-Dokument lesen (rendert bei jeder Änderung neu).
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
  helperMessages: [],
  handovers: [],
};

function read(doc: Y.Doc): ProjectData {
  return {
    devices: readDevices(doc),
    cables: readCables(doc),
    layers: readLayers(doc),
    shapes: readShapes(doc),
    background: readBackground(doc),
    settings: readSettings(doc),
    network: { subnets: readSubnets(doc), wifi: readWifi(doc) },
    people: readPeople(doc),
    groups: readGroups(doc),
    caseTrailers: readCaseTrailers(doc),
    patch: readPatch(doc),
    flowPages: readFlowPages(doc),
    show: readShow(doc),
    showSettings: doc.getMap('showSettings').toJSON() as ShowSettings,
    media: readMedia(doc),
    lightGrid: readLightGrid(doc),
    lightPlacements: readLightPlacements(doc),
    lightTargets: readLightTargets(doc),
    lightScenes: readScenes(doc),
    soundScenes: readSoundScenes(doc),
    gigs: readGigs(doc),
    helperSignups: readHelperSignups(doc),
    helperMessages: readHelperMessages(doc),
    handovers: readHandovers(doc),
    sceneStates: readSceneStates(doc),
  };
}

export function useProjectData(doc: Y.Doc | undefined): ProjectData {
  const store = useMemo(() => {
    if (!doc) return null;
    let snapshot: ProjectData = read(doc);
    return {
      subscribe(onChange: () => void) {
        const handler = () => {
          snapshot = read(doc);
          onChange();
        };
        doc.on('afterTransaction', handler);
        return () => doc.off('afterTransaction', handler);
      },
      get: () => snapshot,
    };
  }, [doc]);
  return useSyncExternalStore(store?.subscribe ?? noopSubscribe, store?.get ?? getEmpty);
}

const noopSubscribe = () => () => undefined;
const getEmpty = () => EMPTY;
