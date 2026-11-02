// Gemeinsame Filter für Zeichenflächen, Listen und PDF.
import type { Cable, CaseTrailer, DeviceInstance, MasterData, Template } from '../model/schema';

/** Optional: Cases, damit der Anhänger-Filter auch den Inhalt von Cases im Anhänger findet */
export interface FilterContext {
  caseTrailers?: CaseTrailer[];
  cases?: MasterData['cases'];
}

function trailerOf(item: { caseId?: string; trailerId?: string }, ctx?: FilterContext): string | undefined {
  if (!item.caseId || !ctx) return item.trailerId;
  const override = ctx.caseTrailers?.find((c) => c.id === item.caseId);
  return override ? override.trailerId : ctx.cases?.find((c) => c.id === item.caseId)?.defaultTrailerId;
}

export interface Filter {
  categories: string[];
  owners: string[];
  trailers: string[];
  /** Stative/Traversen: Geräte daran (und der Träger selbst) */
  carriers: string[];
}

export const EMPTY_FILTER: Filter = { categories: [], owners: [], trailers: [], carriers: [] };

export function isFilterActive(filter: Filter): boolean {
  return filter.categories.length + filter.owners.length + filter.trailers.length + filter.carriers.length > 0;
}

function matchesLogistics(filter: Filter, categoryId: string | undefined, ownerId: string | undefined, trailerId: string | undefined): boolean {
  if (filter.categories.length && !filter.categories.includes(categoryId ?? '')) return false;
  if (filter.owners.length && !filter.owners.includes(ownerId ?? '')) return false;
  if (filter.trailers.length && !filter.trailers.includes(trailerId ?? '')) return false;
  return true;
}

export function deviceMatches(filter: Filter, device: DeviceInstance, template: Template | undefined, ctx?: FilterContext): boolean {
  if (!matchesLogistics(filter, device.categoryOverride ?? template?.categoryId, device.ownerId, trailerOf(device, ctx))) return false;
  if (filter.carriers.length && !filter.carriers.includes(device.id) && !filter.carriers.includes(device.mountedOnId ?? '')) return false;
  return true;
}

export function cableMatches(filter: Filter, cable: Cable, template: Template | undefined, ctx?: FilterContext): boolean {
  if (filter.carriers.length) return false; // Kabel hängen nicht an Stativen
  if (cable.direct) return !isFilterActive(filter);
  return matchesLogistics(filter, cable.categoryOverride ?? template?.categoryId, cable.ownerId, trailerOf(cable, ctx));
}
