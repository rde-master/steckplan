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
  shapes: string[];
}

export type StageTool = 'select' | 'wall' | 'text' | 'dimension' | 'calibrate';

interface EditorState {
  selection: Selection;
  view: ViewState;
  showStageObjects: boolean;
  /** Bühnenplan: Ansicht (Pixel pro Millimeter), Werkzeug, aktive Ebene, Hintergrund verschieben */
  stageView: ViewState;
  tool: StageTool;
  activeLayerId: string | null;
  moveBackground: boolean;
  setStageView(view: ViewState): void;
  setTool(tool: StageTool): void;
  setActiveLayer(id: string | null): void;
  setMoveBackground(move: boolean): void;
  toggleShape(id: string): void;
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
  selection: { devices: [], cables: [], shapes: [] } as Selection,
  view: { x: 40, y: 40, zoom: 1 } as ViewState,
  stageView: { x: 60, y: 60, zoom: 0.08 } as ViewState,
  tool: 'select' as StageTool,
  activeLayerId: null as string | null,
  moveBackground: false,
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
            shapes: [...new Set([...s.selection.shapes, ...(selection.shapes ?? [])])],
          }
        : { devices: selection.devices ?? [], cables: selection.cables ?? [], shapes: selection.shapes ?? [] },
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
    set({ selection: { devices: [], cables: [], shapes: [] } });
  },
  toggleShape(id) {
    set((s) => ({
      selection: { ...s.selection, shapes: s.selection.shapes.includes(id) ? s.selection.shapes.filter((x) => x !== id) : [...s.selection.shapes, id] },
    }));
  },
  setStageView(stageView) {
    set({ stageView });
  },
  setTool(tool) {
    set({ tool });
  },
  setActiveLayer(activeLayerId) {
    set({ activeLayerId });
  },
  setMoveBackground(moveBackground) {
    set({ moveBackground });
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
