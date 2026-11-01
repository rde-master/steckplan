import type { Project } from '@steckplan/core';

export interface ProjectSummary {
  id: string;
  name: string;
  venue: string;
  date: string;
  updatedAt: string;
  /** Nur lokal: Pfad der .steckplan-Datei */
  path?: string;
  /** Gesetzt, wenn das Projekt nur gelesen werden kann (z. B. Sperre eines anderen Rechners) */
  readOnlyReason?: string;
}

export interface TrashEntry {
  trashId: string;
  projectId: string;
  name: string;
  deletedAt: string;
}

/** Gemeinsame Schnittstelle für die Speicherung (Docker-Datenordner oder lokale Dateien). */
export interface ProjectStore {
  readonly kind: 'dataDir' | 'localFiles';
  list(): Promise<ProjectSummary[]>;
  /** Wirft ProjectNotFoundError, wenn es das Projekt nicht gibt. */
  load(id: string): Promise<Project>;
  save(id: string, project: Project): Promise<void>;
  readOnlyReason(id: string): string | undefined;
}

/** Zusätzliche Funktionen des Docker-Datenordners. */
export interface ManagedProjectStore extends ProjectStore {
  readonly kind: 'dataDir';
  create(project: Project): Promise<string>;
  trash(id: string): Promise<void>;
  listTrash(): Promise<TrashEntry[]>;
  restoreFromTrash(trashId: string): Promise<string>;
}

export function isManagedStore(store: ProjectStore): store is ManagedProjectStore {
  return store.kind === 'dataDir';
}

export class ProjectNotFoundError extends Error {
  constructor(id: string) {
    super(`Projekt ${id} nicht gefunden`);
    this.name = 'ProjectNotFoundError';
  }
}

export function summarize(id: string, project: Project, updatedAt: Date, extra: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id,
    name: project.meta.name,
    venue: project.meta.venue,
    date: project.meta.date,
    updatedAt: updatedAt.toISOString(),
    ...extra,
  };
}
