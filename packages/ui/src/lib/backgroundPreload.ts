// Welche Hintergrundbilder das Textfenster bereithalten soll: das aktuelle und die nächsten Abschnittsbilder, die Bilder
// des Hintergrunds (eigener bzw. Standard) und der Anfang des nächsten Eintrags. Videos nicht (die laden selbst vor).
import { effectiveBackground, isVideoMedia, itemSections, lyricsImages, sectionBackground, type MediaRef, type ShowItem, type ShowSettings, type TextSection } from '@steckplan/core';

/** höchstens so viele Bilder (große Fotos belegen decodiert viel Speicher) */
export const PRELOAD_MAX = 10;

export function backgroundPreloadIds(o: {
  items: ShowItem[];
  sections: TextSection[];
  settings: ShowSettings | undefined;
  media: MediaRef[];
  itemId: string | undefined;
  sectionId: string | undefined;
}): string[] {
  const byId = new Map(o.media.map((m) => [m.id, m]));
  const result: string[] = [];
  const add = (id: string | undefined) => {
    if (!id || result.includes(id) || result.length >= PRELOAD_MAX) return;
    const ref = byId.get(id);
    if (ref && !isVideoMedia(ref)) result.push(id);
  };
  const index = o.items.findIndex((i) => i.id === o.itemId);
  const item = index >= 0 ? o.items[index] : undefined;
  if (item) {
    const sections = itemSections(o.sections, item.id);
    const from = Math.max(0, sections.findIndex((s) => s.id === o.sectionId));
    // aktuelles und die nächsten zwei verschiedenen Abschnittsbilder
    const before = result.length;
    for (const s of sections.slice(from)) {
      if (result.length - before >= 3) break;
      add(sectionBackground(sections, s.id, undefined));
    }
  }
  for (const id of lyricsImages(effectiveBackground(o.settings, item).background).slice(0, 6)) add(id);
  const next = item ? o.items[index + 1] : o.items[0];
  if (next) {
    const sections = itemSections(o.sections, next.id);
    add(sections[0] ? sectionBackground(sections, sections[0].id, undefined) : undefined);
    add(lyricsImages(effectiveBackground(o.settings, next).background)[0]);
  }
  return result;
}
