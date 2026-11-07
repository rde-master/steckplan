// Lichtpult: zuletzt gelaufene Cues (per OSC als Text, z. B. /steckplan/cue "Cue 12 Intro") – die letzten zehn, im
// Speicher (nach einem Neustart leer). Neue Cues gehen an alle geöffneten Projekte.
import { DESK_CUE_HISTORY, DESK_CUE_MAX_LENGTH, type DeskCue } from '@steckplan/core';

export class DeskCueStore {
  private cues: DeskCue[] = [];
  private readonly listeners = new Set<(cues: DeskCue[]) => void>();

  get list(): DeskCue[] {
    return [...this.cues];
  }

  /** Cue merken (neueste zuerst); leerer Text wird ignoriert */
  push(text: string, at = new Date()): DeskCue[] | null {
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, DESK_CUE_MAX_LENGTH);
    if (!clean) return null;
    this.cues = [{ text: clean, at: at.toISOString() }, ...this.cues].slice(0, DESK_CUE_HISTORY);
    for (const l of this.listeners) l(this.list);
    return this.list;
  }

  onChange(listener: (cues: DeskCue[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
