// Abspielzeit in der Oberfläche: Große Ansichten (Führen, Regie, Textfenster) sollen nicht bei jedem Bild neu
// rechnen. Sie fragen deshalb nur nach dem, was sich selten ändert (aktuelle Zeile, Szene, läuft/steht) –
// usePlayerValue prüft je Bild und rendert erst beim Wechsel. Was wirklich läuft (Uhr, Abspielstrich, Balken),
// sind kleine Bausteine, die sich mit usePlayerTime selbst aktualisieren.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Playback } from './transport';

/** Zeitquelle (nur lesen): Transport, Audio-Element oder die Uhr einer empfangenen Stelle (Folgen, Textfenster) */
export type TimeSource = Pick<Playback, 'currentTime' | 'paused' | 'addEventListener' | 'removeEventListener'>;

/** Ereignisse, nach denen sich Zeit oder Zustand geändert haben können */
const CHANGE_EVENTS = ['seeked', 'timeupdate', 'pause', 'ended', 'loadedmetadata', 'durationchange', 'ratechange'];

/**
 * Wert, der von der Abspielzeit abhängt (z. B. die aktuelle Zeile): solange abgespielt wird, je Bild geprüft –
 * neu gerendert wird nur, wenn er sich ändert. Der Wert muss vergleichbar sein (Text, Zahl, Wahrheitswert).
 */
export function usePlayerValue<T>(el: TimeSource | null, select: (time: number) => T): T {
  const [, redraw] = useState(0);
  const value = select(el ? el.currentTime : 0);
  const latest = useRef({ select, value });
  useLayoutEffect(() => {
    latest.current = { select, value };
    // Wurde die Uhr in diesem Durchlauf erst nach dem Rechnen gestellt (neue Stelle beim Folgen), stimmt der Wert
    // noch nicht: steht sie, gleich vor dem Zeichnen nachziehen – läuft sie, prüft ohnehin das nächste Bild.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Abgleich mit der Uhr (äußerer Zustand) nach dem Durchlauf
    if (el && el.paused && !Object.is(select(el.currentTime), value)) redraw((n) => (n + 1) % 1_000_000);
  }, [select, value, el]);
  useEffect(() => {
    if (!el) return;
    let frame = 0;
    const check = () => {
      const now = latest.current;
      if (!Object.is(now.select(el.currentTime), now.value)) redraw((n) => (n + 1) % 1_000_000);
    };
    const tick = () => {
      check();
      frame = el.paused ? 0 : requestAnimationFrame(tick);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    };
    check();
    if (!el.paused) start();
    el.addEventListener('play', start);
    for (const e of CHANGE_EVENTS) el.addEventListener(e, check);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('play', start);
      for (const e of CHANGE_EVENTS) el.removeEventListener(e, check);
    };
  }, [el]);
  return value;
}

/**
 * Aktuelle Abspielzeit (flüssig, solange abgespielt wird). Mit step (Sekunden) nur in diesen Schritten – für
 * Anzeigen, die sich ohnehin nicht öfter ändern (Text mit Zehntelsekunden braucht kein Rendern je Bild).
 */
export function usePlayerTime(el: TimeSource | null, step?: number): number {
  return usePlayerValue(el, (time) => (step ? Math.floor(time / step + 1e-9) * step : time));
}

/** Läuft die Wiedergabe? */
export function usePlaying(el: TimeSource | null): boolean {
  return usePlayerValue(el, () => !!el && !el.paused);
}
