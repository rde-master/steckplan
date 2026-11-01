// Zustand des Editors (pro geöffnetem Projekt): Auswahl, Ansicht, Optionen.
import { create } from 'zustand';

export interface ViewState {
  x: number;
  y: number;
  zoom: number;
}

export interface Selection {
  devices: string[];
  cables: string[];
}

interface EditorState {
  selection: Selection;
  view: ViewState;
  showStageObjects: boolean;
  /** Anfrage an die Zeichenfläche, eine Stelle (Weltkoordinaten) in die Mitte zu holen */
  focusRequest: { x: number; y: number; at: number } | null;
  select(selection: Partial<Selection>, additive?: boolean): void;
  toggleDevice(id: string): void;
  toggleCable(id: string): void;
  clearSelection(): void;
  setView(view: ViewState): void;
  setShowStageObjects(show: boolean): void;
  focus(point: { x: number; y: number }): void;
  reset(): void;
}

const initial = {
  selection: { devices: [], cables: [] } as Selection,
  view: { x: 40, y: 40, zoom: 1 } as ViewState,
  showStageObjects: false,
  focusRequest: null,
};

export const useEditor = create<EditorState>((set) => ({
  ...initial,
  select(selection, additive = false) {
    set((s) => ({
      selection: additive
        ? {
            devices: [...new Set([...s.selection.devices, ...(selection.devices ?? [])])],
            cables: [...new Set([...s.selection.cables, ...(selection.cables ?? [])])],
          }
        : { devices: selection.devices ?? [], cables: selection.cables ?? [] },
    }));
  },
  toggleDevice(id) {
    set((s) => ({
      selection: {
        ...s.selection,
        devices: s.selection.devices.includes(id) ? s.selection.devices.filter((d) => d !== id) : [...s.selection.devices, id],
      },
    }));
  },
  toggleCable(id) {
    set((s) => ({
      selection: {
        ...s.selection,
        cables: s.selection.cables.includes(id) ? s.selection.cables.filter((c) => c !== id) : [...s.selection.cables, id],
      },
    }));
  },
  clearSelection() {
    set({ selection: { devices: [], cables: [] } });
  },
  setView(view) {
    set({ view });
  },
  setShowStageObjects(showStageObjects) {
    set({ showStageObjects });
  },
  focus(point) {
    set({ focusRequest: { ...point, at: Date.now() } });
  },
  reset() {
    set(initial);
  },
}));
