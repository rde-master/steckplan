// Führen: Helligkeit von Text und Hintergrund im Textfenster und die Ein-/Ausblendzeit der Knöpfe.
// Knöpfe blenden in der eingestellten Zeit ganz aus bzw. ein; Schieberegler und Fader wirken direkt (nur kurz
// geglättet). Fader und Drehregler melden viele Werte je Sekunde – übernommen wird höchstens alle STEP_MS, damit die
// Vorstellung nicht bei jedem Wert neu zeichnet und die Stelle nicht bei jedem Wert gesendet wird.
import { useEffect, useRef, useState } from 'react';
import { LYRICS_FADE_SEC_DEFAULT, LYRICS_FADE_SEC_MAX, LYRICS_SLIDER_FADE_SEC } from '@steckplan/core';

export type LyricsLayer = 'text' | 'background';

export interface LyricsLevels {
  /** Helligkeit 0–1 */
  text: number;
  background: number;
  /** Zeit, in der das Textfenster auf diese Helligkeiten überblendet (Sekunden) */
  fadeSec: number;
}

const KEY = 'steckplan.lyricsFadeSec';
const STEP_MS = 40;

/** Blendzeit auf Zehntel runden und begrenzen */
export function clampFadeSec(sec: number): number {
  return Number.isFinite(sec) ? Math.round(Math.min(LYRICS_FADE_SEC_MAX, Math.max(0, sec)) * 10) / 10 : LYRICS_FADE_SEC_DEFAULT;
}

function readFadeSec(): number {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === null ? LYRICS_FADE_SEC_DEFAULT : clampFadeSec(Number(raw));
  } catch {
    return LYRICS_FADE_SEC_DEFAULT;
  }
}

function writeFadeSec(sec: number): void {
  try {
    localStorage.setItem(KEY, String(sec));
  } catch {
    // ohne Speicher gilt die Zeit bis zum Neuladen
  }
}

interface Pending {
  text?: number;
  background?: number;
  fade?: number;
}

export function useLyricsLevels() {
  /** eingestellte Blendzeit der Knöpfe (je Gerät gemerkt) */
  const [fadeSec, setFadeSecState] = useState(readFadeSec);
  const [levels, setLevels] = useState<LyricsLevels>({ text: 1, background: 1, fadeSec: LYRICS_FADE_SEC_DEFAULT });
  const pending = useRef<Pending>({});
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const flush = () => {
    timer.current = undefined;
    const p = pending.current;
    pending.current = {};
    if (p.fade !== undefined) {
      setFadeSecState(p.fade);
      writeFadeSec(p.fade);
    }
    if (p.text !== undefined || p.background !== undefined) {
      setLevels((l) => ({ text: p.text ?? l.text, background: p.background ?? l.background, fadeSec: LYRICS_SLIDER_FADE_SEC }));
    }
  };
  const schedule = (next: Pending) => {
    pending.current = { ...pending.current, ...next };
    timer.current ??= window.setTimeout(flush, STEP_MS);
  };

  return {
    levels,
    fadeSec,
    /** Knopf: in der eingestellten Zeit ganz aus- bzw. einblenden */
    setHidden: (layer: LyricsLayer, hide: boolean) => {
      delete pending.current[layer];
      // eine eben verstellte, noch nicht übernommene Blendzeit gilt schon
      const sec = pending.current.fade ?? fadeSec;
      setLevels((l) => ({ ...l, [layer]: hide ? 0 : 1, fadeSec: sec }));
    },
    /** Schieberegler/Fader: direkt (0–1) */
    setLevel: (layer: LyricsLayer, value: number) => schedule({ [layer]: Math.min(1, Math.max(0, value)) }),
    /** Blendzeit der Knöpfe (Sekunden) */
    setFadeSec: (sec: number) => schedule({ fade: clampFadeSec(sec) }),
  };
}
