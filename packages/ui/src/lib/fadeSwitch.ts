// Weicher Wechsel zwischen Ansichten (Liedtext, Pause, ohne Text …): erst die alte ausblenden, dann die neue zeigen
// und einblenden. Gezeigt wird solange die alte Ansicht (shown), visible steuert die Deckkraft.
import { useEffect, useState } from 'react';

/** Dauer des Aus- bzw. Einblendens (ms) */
export const FADE_SWITCH_MS = 450;

export function useFadeSwitch(key: string, ms = FADE_SWITCH_MS): { shown: string; visible: boolean } {
  const [shown, setShown] = useState(key);
  useEffect(() => {
    if (key === shown) return;
    const timer = window.setTimeout(() => setShown(key), ms);
    return () => window.clearTimeout(timer);
  }, [key, shown, ms]);
  return { shown, visible: key === shown };
}
