// Zustand des Editors (pro geöffnetem Projekt): Auswahl, Ansicht, Optionen.
import { create } from 'zustand';
import { EMPTY_FILTER, type Filter } from '@steckplan/core';

export type ColorMode = 'device' | 'category' | 'owner' | 'trailer';

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

export type StageTool = 'select' | 'marquee' | 'wall' | 'text' | 'dimension' | 'calibrate';
/** Signalfluss: Auswählen (leere Fläche ziehen = Ansicht verschieben) oder Markieren (Rahmen ziehen) */
export type FlowMode = 'select' | 'marquee';

interface EditorState {
  selection: Selection;
  view: ViewState;
  showStageObjects: boolean;
  /** Filter (nicht passende Objekte werden ausgegraut) und Einfärben nach … (nur Anzeige) */
  filter: Filter;
  colorMode: ColorMode;
  showCables: boolean;
  showDmx: boolean;
  setShowDmx(show: boolean): void;
  /** Gruppenrahmen im Bühnenplan */
  showStageGroups: boolean;
  setShowStageGroups(show: boolean): void;
  /** Anzeige im Signalfluss (je Browser gemerkt): Besitzer in der Geräteauswahl, Besitzer und Personen in den Kästen */
  display: SignalFlowDisplay;
  setDisplay(patch: Partial<SignalFlowDisplay>): void;
  /** Anzeige im Bühnenplan (je Browser gemerkt): Texte am Plan, gewählter Reiter links */
  stageDisplay: StagePlanDisplay;
  setStageDisplay(patch: Partial<StagePlanDisplay>): void;
  flowMode: FlowMode;
  setFlowMode(mode: FlowMode): void;
  /** aktuelle Seite im Signalfluss ('' = erste) */
  flowPage: string;
  setFlowPage(id: string): void;
  setFilter(filter: Filter): void;
  setColorMode(mode: ColorMode): void;
  setShowCables(show: boolean): void;
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
  /** Langes Drücken (Touch): Eigenschaften der Auswahl zeigen – zählt bei jeder Anfrage hoch */
  propertiesRequest: number;
  requestProperties(): void;
  select(selection: Partial<Selection>, additive?: boolean): void;
  toggleDevice(id: string): void;
  toggleCable(id: string): void;
  clearSelection(): void;
  setView(view: ViewState): void;
  setShowStageObjects(show: boolean): void;
  focus(point: { x: number; y: number }): void;
  reset(): void;
}

export interface SignalFlowDisplay {
  ownerInLibrary: boolean;
  ownerOnBoxes: boolean;
  peopleOnBoxes: boolean;
  /** Pult-Kanal an den Eingängen digitaler Stageboxen („→ FOH 12“) */
  channelsOnBoxes: boolean;
}

export type StagePanel = 'library' | 'unplaced' | 'layers' | 'background';

export interface StagePlanDisplay {
  /** Kennung am Objekt */
  labels: boolean;
  /** Person am Objekt */
  people: boolean;
  /** Höhe am Objekt und Länge an jedem Kabel */
  meters: boolean;
  /** Kabeltyp bzw. Bezeichnung an jedem Kabel */
  cableNames: boolean;
  /** Reiter links */
  panel: StagePanel;
}

const STAGE_DISPLAY_KEY = 'steckplan.stageDisplay';
const DEFAULT_STAGE_DISPLAY: StagePlanDisplay = { labels: true, people: true, meters: true, cableNames: false, panel: 'library' };

function loadStageDisplay(): StagePlanDisplay {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STAGE_DISPLAY_KEY) : null;
    return raw ? { ...DEFAULT_STAGE_DISPLAY, ...(JSON.parse(raw) as Partial<StagePlanDisplay>) } : DEFAULT_STAGE_DISPLAY;
  } catch {
    return DEFAULT_STAGE_DISPLAY;
  }
}

function saveStageDisplay(display: StagePlanDisplay): void {
  try {
    localStorage.setItem(STAGE_DISPLAY_KEY, JSON.stringify(display));
  } catch {
    // z. B. privater Modus – dann nur für diese Sitzung
  }
}

const DISPLAY_KEY = 'steckplan.signalflowDisplay';
const DEFAULT_DISPLAY: SignalFlowDisplay = { ownerInLibrary: false, ownerOnBoxes: false, peopleOnBoxes: true, channelsOnBoxes: true };

function loadDisplay(): SignalFlowDisplay {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(DISPLAY_KEY) : null;
    return raw ? { ...DEFAULT_DISPLAY, ...(JSON.parse(raw) as Partial<SignalFlowDisplay>) } : DEFAULT_DISPLAY;
  } catch {
    return DEFAULT_DISPLAY;
  }
}

function saveDisplay(display: SignalFlowDisplay): void {
  try {
    localStorage.setItem(DISPLAY_KEY, JSON.stringify(display));
  } catch {
    // z. B. privater Modus – dann nur für diese Sitzung
  }
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
  propertiesRequest: 0,
  filter: EMPTY_FILTER,
  colorMode: 'device' as ColorMode,
  showCables: true,
  showDmx: false,
  showStageGroups: true,
  flowMode: 'select' as FlowMode,
  flowPage: '',
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
  setFilter(filter) {
    set({ filter });
  },
  setColorMode(colorMode) {
    set({ colorMode });
  },
  setShowCables(showCables) {
    set({ showCables });
  },
  setShowDmx(showDmx) {
    set({ showDmx });
  },
  setShowStageGroups(showStageGroups) {
    set({ showStageGroups });
  },
  setFlowMode(flowMode) {
    set({ flowMode });
  },
  setFlowPage(flowPage) {
    set({ flowPage, selection: { devices: [], cables: [], shapes: [] } });
  },
  display: loadDisplay(),
  setDisplay(patch) {
    set((st) => {
      const display = { ...st.display, ...patch };
      saveDisplay(display);
      return { display };
    });
  },
  stageDisplay: loadStageDisplay(),
  setStageDisplay(patch) {
    set((st) => {
      const stageDisplay = { ...st.stageDisplay, ...patch };
      saveStageDisplay(stageDisplay);
      return { stageDisplay };
    });
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
  requestProperties() {
    set((s) => ({ propertiesRequest: s.propertiesRequest + 1 }));
  },
  reset() {
    set(initial);
  },
}));
