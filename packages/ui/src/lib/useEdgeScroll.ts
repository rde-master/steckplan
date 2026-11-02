// Beim Markieren (Rahmen aufziehen) am Rand der Zeichenfläche automatisch in diese Richtung scrollen.
// Je näher am Rand (oder darüber hinaus), desto schneller; der Rahmen wächst mit.
import { useEffect, useRef, type RefObject } from 'react';

export interface PanView {
  x: number;
  y: number;
  zoom: number;
}

/** Breite des Randbereichs in Bildschirmpixeln */
export const EDGE_PX = 40;
/** höchste Geschwindigkeit in Pixeln je Schritt (ca. 60 Schritte pro Sekunde) */
export const MAX_SPEED_PX = 18;

/** Verschiebung je Achse: positiv = Inhalt nach rechts/unten (zeigt mehr links/oben). */
export function edgeDelta(pos: number, size: number, edge = EDGE_PX, max = MAX_SPEED_PX): number {
  if (pos < edge) return Math.round(max * Math.min(1, (edge - pos) / edge));
  if (pos > size - edge) return -Math.round(max * Math.min(1, (pos - (size - edge)) / edge));
  return 0;
}

export function useEdgeScroll(options: {
  active: boolean;
  container: RefObject<HTMLElement | null>;
  getView: () => PanView;
  setView: (view: PanView) => void;
  /** Mauszeiger in Weltkoordinaten nach dem Scrollen (Rahmen nachziehen) */
  onPointerWorld: (p: { x: number; y: number }) => void;
  /** Loslassen außerhalb der Zeichenfläche: Rahmen trotzdem abschließen */
  onRelease: () => void;
}): void {
  const { active, container } = options;
  // immer die neuesten Rückrufe verwenden, ohne den Zeitgeber neu zu starten
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  useEffect(() => {
    if (!active) return;
    let pointer: { x: number; y: number } | null = null;
    const onMouse = (e: MouseEvent) => (pointer = { x: e.clientX, y: e.clientY });
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) pointer = { x: t.clientX, y: t.clientY };
    };
    // Loslassen über der Zeichenfläche erledigt Konva; außerhalb fangen wir es hier ab
    const onUp = (e: MouseEvent | TouchEvent) => {
      const el = container.current;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      latest.current.onRelease();
    };
    window.addEventListener('mousemove', onMouse);
    window.addEventListener('touchmove', onTouch, { passive: true });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    const timer = window.setInterval(() => {
      const el = container.current;
      if (!el || !pointer) return;
      const rect = el.getBoundingClientRect();
      const px = pointer.x - rect.left;
      const py = pointer.y - rect.top;
      const dx = edgeDelta(px, rect.width);
      const dy = edgeDelta(py, rect.height);
      if (dx === 0 && dy === 0) return;
      const view = latest.current.getView();
      const next = { ...view, x: view.x + dx, y: view.y + dy };
      latest.current.setView(next);
      latest.current.onPointerWorld({ x: (px - next.x) / next.zoom, y: (py - next.y) / next.zoom });
    }, 16);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('mousemove', onMouse);
      window.removeEventListener('touchmove', onTouch);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
    };
  }, [active, container]);
}
