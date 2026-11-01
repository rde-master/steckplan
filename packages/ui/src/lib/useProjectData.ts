// Geräte, Kabel und Ebenen aus dem Live-Dokument lesen (rendert bei jeder Änderung neu).
import { useMemo, useSyncExternalStore } from 'react';
import type * as Y from 'yjs';
import {
  readBackground,
  readCables,
  readDevices,
  readLayers,
  readSettings,
  readShapes,
  type Background,
  type Cable,
  type DeviceInstance,
  type Project,
  type ProjectSettings,
  type Shape,
} from '@steckplan/core';

export interface ProjectData {
  devices: DeviceInstance[];
  cables: Cable[];
  layers: Project['layers'];
  shapes: Shape[];
  background: Background | undefined;
  settings: Partial<ProjectSettings>;
}

const EMPTY: ProjectData = { devices: [], cables: [], layers: [], shapes: [], background: undefined, settings: {} };

function read(doc: Y.Doc): ProjectData {
  return {
    devices: readDevices(doc),
    cables: readCables(doc),
    layers: readLayers(doc),
    shapes: readShapes(doc),
    background: readBackground(doc),
    settings: readSettings(doc),
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
