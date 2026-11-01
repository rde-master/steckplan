// Langes Drücken auf Touch-Geräten (ersetzt das Kontextmenü der rechten Maustaste).
// Ausgelöst wird beim Loslassen, damit das Antippen (Konva „tap“) die Auswahl schon gesetzt hat.
import { useEffect, type RefObject } from 'react';

export const LONG_PRESS_MS = 500;
const MAX_MOVE_PX = 10;

export function useLongPress(ref: RefObject<HTMLElement | null>, onLongPress: () => void, ms = LONG_PRESS_MS): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let start: { x: number; y: number } | null = null;
    let timer: number | undefined;
    let fired = false;
    const cancel = () => {
      window.clearTimeout(timer);
      start = null;
      fired = false;
    };
    const onStart = (e: TouchEvent) => {
      cancel();
      if (e.touches.length !== 1) return;
      const t = e.touches[0]!;
      start = { x: t.clientX, y: t.clientY };
      timer = window.setTimeout(() => {
        fired = true;
        navigator.vibrate?.(15);
      }, ms);
    };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!start || !t || e.touches.length !== 1 || Math.hypot(t.clientX - start.x, t.clientY - start.y) > MAX_MOVE_PX) cancel();
    };
    const onEnd = () => {
      const wasLong = fired && start !== null;
      cancel();
      if (wasLong) onLongPress();
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', cancel);
    return () => {
      cancel();
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', cancel);
    };
  }, [ref, onLongPress, ms]);
}
