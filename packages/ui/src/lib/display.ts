// Anzeige: Einfärben nach Kategorie/Besitzer/Anhänger und Filter (nur Darstellung, nichts wird gespeichert).
import { cableMatches, deviceMatches, DEFAULT_DEVICE_COLOR, type Cable, type DeviceInstance, type Filter, type Library, type Template } from '@steckplan/core';
import type { ColorMode } from './editor';

const UNASSIGNED = '#e2e8f0';

export function displayColor(mode: ColorMode, device: DeviceInstance, template: Template | undefined, library: Library | null, base: string): string {
  if (mode === 'device') return base;
  const id = mode === 'category' ? (device.categoryOverride ?? template?.categoryId) : mode === 'owner' ? device.ownerId : device.trailerId;
  if (!id) return UNASSIGNED;
  const list = mode === 'category' ? library?.masterData.categories : mode === 'owner' ? library?.masterData.owners : library?.masterData.trailers;
  return list?.find((e) => e.id === id)?.color ?? DEFAULT_DEVICE_COLOR;
}

export function deviceVisible(filter: Filter, device: DeviceInstance, template: Template | undefined): boolean {
  return deviceMatches(filter, device, template);
}

export function cableVisible(filter: Filter, cable: Cable, template: Template | undefined): boolean {
  return cableMatches(filter, cable, template);
}

export const DIMMED_OPACITY = 0.18;
