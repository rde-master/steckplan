// Alle Prüfungen (Signalfluss + Bühnenplan), immer frisch berechnet.
import { useMemo } from 'react';
import { checkDmx, checkLogistics, checkNetwork, checkNetworkChannels, checkPeople, checkPower, checkSignalFlow, checkStagePlan, type Issue, type Library } from '@steckplan/core';
import type { ProjectData } from './useProjectData';

export function useIssues(data: ProjectData, library: Library | null): Issue[] {
  return useMemo(() => {
    if (!library) return [];
    const templates = new Map(library.templates.map((t) => [t.id, t]));
    const settings = { gridMm: 500, snap: true, defaultReservePercent: 10, defaultReservePerEndMm: 500, ...data.settings };
    return [
      ...checkSignalFlow(data, library),
      ...checkStagePlan(data, library),
      ...checkLogistics({ ...data, settings }, library),
      ...checkDmx(data, templates),
      ...checkNetwork(data, templates),
      ...checkPower(data, library),
      ...checkPeople(data, library),
      ...checkNetworkChannels(data, library),
    ];
  }, [data, library]);
}
