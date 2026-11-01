// Alle Prüfungen (Signalfluss + Bühnenplan), immer frisch berechnet.
import { useMemo } from 'react';
import { checkSignalFlow, checkStagePlan, type Issue, type Library } from '@steckplan/core';
import type { ProjectData } from './useProjectData';

export function useIssues(data: ProjectData, library: Library | null): Issue[] {
  return useMemo(() => (library ? [...checkSignalFlow(data, library), ...checkStagePlan(data, library)] : []), [data, library]);
}
