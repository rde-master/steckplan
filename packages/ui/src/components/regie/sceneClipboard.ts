// Zwischenablage für Szenenwerte – über Stücke hinweg, solange die Seite offen ist.
import { useSyncExternalStore } from 'react';
import type { SceneValues } from '@steckplan/core';

export interface SceneClip {
  name: string;
  values: SceneValues;
}

let clip: SceneClip | null = null;
const listeners = new Set<() => void>();

export function setSceneClip(next: SceneClip): void {
  clip = next;
  for (const l of listeners) l();
}

export function useSceneClip(): SceneClip | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => clip,
  );
}

/** „⌘“ auf dem Mac, sonst „Strg“ */
export const MOD_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Strg';
