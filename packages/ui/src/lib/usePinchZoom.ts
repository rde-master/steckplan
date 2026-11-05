// Zwei-Finger-Zoom auf Handy und Tablet – direkt an den Berührungs-Ereignissen des Elements, nicht über Konva:
// Hat ein Finger die Zeichenfläche schon zum Verschieben „gegriffen“, meldet Konva die Bewegungen nicht mehr weiter,
// und der zweite Finger würde nie bemerkt. Hier wird das Verschieben beim zweiten Finger beendet und gezoomt.
import { useEffect, useRef, type RefObject } from 'react';
import type Konva from 'konva';

export function usePinchZoom(
  container: RefObject<HTMLElement | null>,
  stage: RefObject<Konva.Stage | null>,
  getZoom: () => number,
  zoomAt: (center: { x: number; y: number }, zoom: number) => void,
): void {
  const latest = useRef({ getZoom, zoomAt });
  useEffect(() => {
    latest.current = { getZoom, zoomAt };
  });
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    let start: { distance: number; zoom: number } | null = null;
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2) {
        start = null;
        return;
      }
      e.preventDefault();
      const s = stage.current;
      if (s?.isDragging()) s.stopDrag();
      const [a, b] = [e.touches[0]!, e.touches[1]!];
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (distance < 1) return;
      const rect = el.getBoundingClientRect();
      const center = { x: (a.clientX + b.clientX) / 2 - rect.left, y: (a.clientY + b.clientY) / 2 - rect.top };
      if (!start) start = { distance, zoom: latest.current.getZoom() };
      latest.current.zoomAt(center, start.zoom * (distance / start.distance));
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) start = null;
    };
    // capture: vor Konva, damit das Verschieben rechtzeitig endet
    el.addEventListener('touchmove', onMove, { passive: false, capture: true });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchmove', onMove, { capture: true });
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [container, stage]);
}
