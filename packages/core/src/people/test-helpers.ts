// Nur für Tests: Bibliothek aus Vorlagen und Stammdaten.
import { createEmptyLibrary, type Library } from '../library/library';
import type { MasterData, Template } from '../model/schema';

export function buildProjectUsageLibrary(templates: Template[], masterData: Partial<MasterData> = {}): Library {
  const library = createEmptyLibrary('test');
  return { ...library, templates, masterData: { ...library.masterData, ...masterData } };
}
