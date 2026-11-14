// Passt eine Textzeile ins Textfenster (bzw. auf den Player)? Zu lange Zeilen schneidet das Textfenster mit „…“ ab.
// Gerechnet wird mit denselben Größen wie in LyricsWindow.tsx (Schrift in vw/vh) für einen 16:9-Bildschirm,
// gemessen mit der Schrift dieser Oberfläche (fett wie die aktuelle Zeile) – auf dem Player-Rechner kann die
// Systemschrift etwas anders laufen, das Ergebnis ist also ein guter Anhaltspunkt, keine Garantie.

/** Bezugsbildschirm (nur das Seitenverhältnis zählt – alle Größen sind relativ) */
export const FIT_SCREEN = { width: 1920, height: 1080 };

export interface LyricsFitOptions {
  mode: 'lines' | 'block';
  /** Zeilen vor/nach der aktuellen (Zeilen-Ansicht) */
  before: number;
  after: number;
  /** Übersetzung wird unter den Zeilen gezeigt (Schrift kleiner) */
  translation: boolean;
  /** Zeilen des Abschnitts (Block-Ansicht: die Schrift richtet sich danach) */
  blockLines: number;
}

/** Schriftgröße und verfügbare Breite einer Zeile in Pixeln (wie LinesView bzw. BlockView) */
export function lyricsLineBox(o: LyricsFitOptions, screen = FIT_SCREEN): { fontPx: number; maxPx: number } {
  const vw = screen.width / 100;
  const vh = screen.height / 100;
  if (o.mode === 'block') {
    const units = Math.max(1, o.blockLines) * (o.translation ? 1.6 : 1);
    const unitVh = Math.min(11, 80 / units);
    // außen px-[3vw], um die Zeile px-[1.5vw]
    return { fontPx: Math.min(4.2 * vw, unitVh * 0.62 * vh), maxPx: screen.width - 2 * 3 * vw - 2 * 1.5 * vw };
  }
  const slots = o.before + 1 + o.after;
  const rowVh = Math.min(15, 80 / slots);
  // außen px-[3vw], um die Zeile px-[2vw]
  return { fontPx: Math.min(4.5 * vw, rowVh * (o.translation ? 0.32 : 0.42) * vh), maxPx: screen.width - 2 * 3 * vw - 2 * 2 * vw };
}

export type MeasureText = (text: string, fontPx: number) => number;

let canvas: HTMLCanvasElement | null = null;
/** Breite eines Textes in der Schrift der Oberfläche (halbfett wie die aktuelle Zeile); ohne Canvas: null */
export function canvasMeasure(): MeasureText | null {
  if (typeof document === 'undefined') return null;
  canvas ??= document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
  return (text, fontPx) => {
    ctx.font = `600 ${fontPx}px ${family}`;
    return ctx.measureText(text).width;
  };
}

/** Typische Zeile, um zu schätzen, wie viele Zeichen etwa passen */
const SAMPLE = 'Und dann sangen wir die ganze Nacht von alten Zeiten';

export interface LineFit {
  /** Zeichen der Zeile */
  chars: number;
  /** wird abgeschnitten */
  tooLong: boolean;
}

/** Je Zeile: Zeichen und ob sie abgeschnitten wird; dazu etwa, wie viele Zeichen passen */
export function fitLines(lines: string[], options: LyricsFitOptions, measure: MeasureText): { lines: LineFit[]; maxChars: number } {
  const { fontPx, maxPx } = lyricsLineBox(options);
  const perChar = measure(SAMPLE, fontPx) / SAMPLE.length;
  return {
    lines: lines.map((text) => {
      const trimmed = text.trim();
      return { chars: [...trimmed].length, tooLong: trimmed.length > 0 && measure(trimmed, fontPx) > maxPx + 0.5 };
    }),
    maxChars: Math.floor(maxPx / perChar),
  };
}
