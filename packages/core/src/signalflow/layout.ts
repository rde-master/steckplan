// Größe und Anschluss-Positionen eines Kastens in der Signalfluss-Ansicht (nicht maßstäblich).
import type { EffectivePort } from './ports';

export const BOX = {
  minWidth: 160,
  maxWidth: 320,
  headerHeight: 30,
  portRowHeight: 20,
  padding: 8,
  portRadius: 5,
  charWidth: 6.6,
  gap: 24,
} as const;

export interface PortAnchor {
  port: EffectivePort;
  /** relativ zur linken oberen Ecke des Kastens */
  x: number;
  y: number;
}

export interface BoxLayout {
  width: number;
  height: number;
  anchors: PortAnchor[];
}

export function boxLayout(title: string, ports: EffectivePort[]): BoxLayout {
  const left = ports.filter((p) => p.side === 'left');
  const right = ports.filter((p) => p.side === 'right');
  const longest = (list: EffectivePort[]) => list.reduce((max, p) => Math.max(max, p.label.length), 0);
  const labelWidth = (longest(left) + longest(right)) * BOX.charWidth + BOX.gap + 2 * (BOX.portRadius + BOX.padding);
  const titleWidth = title.length * (BOX.charWidth + 0.8) + 2 * BOX.padding;
  const width = Math.round(Math.min(BOX.maxWidth, Math.max(BOX.minWidth, labelWidth, titleWidth)));
  const rows = Math.max(left.length, right.length, 1);
  const height = BOX.headerHeight + rows * BOX.portRowHeight + BOX.padding;
  const anchors: PortAnchor[] = [];
  left.forEach((port, i) => anchors.push({ port, x: 0, y: BOX.headerHeight + i * BOX.portRowHeight + BOX.portRowHeight / 2 }));
  right.forEach((port, i) => anchors.push({ port, x: width, y: BOX.headerHeight + i * BOX.portRowHeight + BOX.portRowHeight / 2 }));
  return { width, height, anchors };
}

export interface Point2 {
  x: number;
  y: number;
}

/**
 * Automatische Kabelführung (rechtwinklig): vom Anschluss ein Stück nach außen,
 * dann waagerecht/senkrecht zum Ziel. Gibt eine Punktliste [x1, y1, x2, y2, …] zurück.
 */
export function routeCable(from: Point2, fromSide: 'left' | 'right', to: Point2, toSide: 'left' | 'right', stub = 16): number[] {
  const dirFrom = fromSide === 'right' ? 1 : -1;
  const dirTo = toSide === 'right' ? 1 : -1;
  const a = { x: from.x + dirFrom * stub, y: from.y };
  const b = { x: to.x + dirTo * stub, y: to.y };
  let points: Point2[];
  if (dirFrom === 1 && dirTo === -1 && b.x >= a.x) {
    // klassisch: rechts raus, links rein, Ziel liegt rechts
    const midX = Math.round((a.x + b.x) / 2);
    points = [from, { x: midX, y: from.y }, { x: midX, y: to.y }, to];
  } else if (dirFrom === dirTo) {
    // beide Anschlüsse auf derselben Seite: außen herum
    const x = dirFrom === 1 ? Math.max(a.x, b.x) : Math.min(a.x, b.x);
    points = [from, { x, y: from.y }, { x, y: to.y }, to];
  } else {
    // Ziel liegt „hinter“ dem Start: in der Mitte zwischen den Zeilen herumführen
    const midY = Math.round((from.y + to.y) / 2);
    points = [from, a, { x: a.x, y: midY }, { x: b.x, y: midY }, b, to];
  }
  return simplify(points).flatMap((p) => [p.x, p.y]);
}

function simplify(points: Point2[]): Point2[] {
  const result: Point2[] = [];
  for (const p of points) {
    const prev = result[result.length - 1];
    if (prev && prev.x === p.x && prev.y === p.y) continue;
    const before = result[result.length - 2];
    if (prev && before && ((before.x === prev.x && prev.x === p.x) || (before.y === prev.y && prev.y === p.y))) {
      result[result.length - 1] = p;
      continue;
    }
    result.push(p);
  }
  return result;
}

/** Textfarbe mit gutem Kontrast zur Hintergrundfarbe (#rrggbb). */
export function contrastText(background: string): '#0f172a' | '#ffffff' {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(background);
  if (!match) return '#0f172a';
  const [r, g, b] = match.slice(1).map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? '#0f172a' : '#ffffff';
}

export const DEFAULT_DEVICE_COLOR = '#cbd5e1';
