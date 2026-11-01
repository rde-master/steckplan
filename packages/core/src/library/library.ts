// Bibliothek: Vorlagen + Stammdaten, projektübergreifend (lokal im App-Datenordner bzw. auf dem Server).
import { z } from 'zod';
import { newId } from '../model/project';
import {
  CategorySchema,
  MasterDataSchema,
  OwnerSchema,
  TemplateKindSchema,
  TemplateSchema,
  TrailerSchema,
  type Category,
  type MasterData,
  type Owner,
  type Template,
  type TemplateKind,
  type Trailer,
} from '../model/schema';

export const LibrarySchema = z.object({
  /** Kennung dieser Bibliothek (Rechner bzw. Server) – steht in jedem damit gespeicherten Projekt */
  libraryId: z.string().min(1),
  /** Zähler, steigt bei jeder Änderung */
  revision: z.number().int().nonnegative().default(0),
  templates: z.array(TemplateSchema).default([]),
  masterData: MasterDataSchema.default({ categories: [], owners: [], trailers: [] }),
});
export type Library = z.infer<typeof LibrarySchema>;

export function createEmptyLibrary(libraryId: string = newId()): Library {
  return { libraryId, revision: 0, templates: [], masterData: { categories: [], owners: [], trailers: [] } };
}

export const MASTER_KINDS = ['categories', 'owners', 'trailers'] as const;
export type MasterKind = (typeof MASTER_KINDS)[number];
export type MasterEntry = Category | Owner | Trailer;

export const MASTER_ENTRY_SCHEMAS = {
  categories: CategorySchema,
  owners: OwnerSchema,
  trailers: TrailerSchema,
} as const;

export function isMasterKind(value: unknown): value is MasterKind {
  return typeof value === 'string' && (MASTER_KINDS as readonly string[]).includes(value);
}

export const TEMPLATE_KINDS = TemplateKindSchema.options;
export function isTemplateKind(value: unknown): value is TemplateKind {
  return typeof value === 'string' && (TEMPLATE_KINDS as readonly string[]).includes(value);
}

export const TEMPLATE_KIND_LABELS: Record<TemplateKind, { singular: string; plural: string }> = {
  device: { singular: 'Gerät', plural: 'Geräte' },
  cableType: { singular: 'Kabeltyp', plural: 'Kabeltypen' },
  stageElement: { singular: 'Bühnenelement', plural: 'Bühnenelemente' },
  truss: { singular: 'Traverse', plural: 'Traversen' },
  stand: { singular: 'Stativ', plural: 'Stative' },
};

export const MASTER_KIND_LABELS: Record<MasterKind, { singular: string; plural: string }> = {
  categories: { singular: 'Kategorie', plural: 'Kategorien' },
  owners: { singular: 'Besitzer', plural: 'Besitzer' },
  trailers: { singular: 'Anhänger', plural: 'Anhänger' },
};

// ---------- Export-/Importdatei ----------

export const LIBRARY_EXPORT_FORMAT = 'steckplan-library';

export const LibraryExportSchema = z.object({
  format: z.literal(LIBRARY_EXPORT_FORMAT),
  formatVersion: z.literal(1),
  libraryId: z.string().default(''),
  exportedAt: z.string().default(''),
  templates: z.array(TemplateSchema).default([]),
  masterData: MasterDataSchema.default({ categories: [], owners: [], trailers: [] }),
});
export type LibraryExport = z.infer<typeof LibraryExportSchema>;

export function createLibraryExport(library: Library, now = new Date()): LibraryExport {
  return {
    format: LIBRARY_EXPORT_FORMAT,
    formatVersion: 1,
    libraryId: library.libraryId,
    exportedAt: now.toISOString(),
    templates: library.templates,
    masterData: library.masterData,
  };
}

export function emptyMasterData(): MasterData {
  return { categories: [], owners: [], trailers: [] };
}

export type { Template };
