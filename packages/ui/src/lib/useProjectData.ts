// Geräte, Kabel und Ebenen aus dem Live-Dokument lesen (rendert bei jeder Änderung neu).
import { useMemo, useSyncExternalStore } from 'react';
import type * as Y from 'yjs';
import { readCables, readDevices, readLayers, type Cable, type DeviceInstance, type Project } from '@steckplan/core';

export interface ProjectData {
  devices: DeviceInstance[];
  cables: Cable[];
  layers: Project['layers'];
}

const EMPTY: ProjectData = { devices: [], cables: [], layers: [] };

export function useProjectData(doc: Y.Doc | undefined): ProjectData {
  const store = useMemo(() => {
    if (!doc) return null;
    let snapshot: ProjectData = { devices: readDevices(doc), cables: readCables(doc), layers: readLayers(doc) };
    return {
      subscribe(onChange: () => void) {
        const handler = () => {
          snapshot = { devices: readDevices(doc), cables: readCables(doc), layers: readLayers(doc) };
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
