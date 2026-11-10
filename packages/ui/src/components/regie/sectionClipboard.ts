// Zwischenablage für Textabschnitte – über Einträge hinweg, solange die Seite offen ist. „Kopieren“ legt hier ab,
// „Hier einfügen“ unter einem Abschnitt fügt die Kopie dort ein.
import { useSyncExternalStore } from 'react';
import type { SectionClip } from '@steckplan/core';

let clip: SectionClip | null = null;
const listeners = new Set<() => void>();

export function setSectionClip(next: SectionClip): void {
  clip = next;
  for (const l of listeners) l();
}

export function useSectionClip(): SectionClip | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => clip,
  );
}
