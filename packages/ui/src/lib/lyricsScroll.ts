// Zu lange aktuelle Zeile im Textfenster: statt „…“ läuft der Text während der Zeit der Zeile (bis zur nächsten)
// von links nach rechts durch – am Anfang und am Ende steht er kurz, damit Anfang und Ende lesbar sind.
import type { TimedLine } from '@steckplan/core';

/** so lange (höchstens) steht der Text am Anfang bzw. Ende (Sekunden; bei kurzen Zeilen je ein Fünftel) */
export const SCROLL_HOLD_SEC = 1;
/** letzte Zeile ohne bekanntes Ende: so lange scrollt sie */
export const SCROLL_LAST_SEC = 8;

/** Anteil 0–1, wie weit der Text zur Zeit t gelaufen ist (Fenster start–end) */
export function scrollProgress(t: number, start: number, end: number): number {
  const span = end - start;
  if (!(span > 0)) return 0;
  const hold = Math.min(SCROLL_HOLD_SEC, span * 0.2);
  const run = span - 2 * hold;
  return Math.min(1, Math.max(0, (t - start - hold) / run));
}

/** Zeitfenster der Zeile: ab ihrer Zeit bis zur nächsten Zeile mit späterer Zeit (bzw. bis zum Ende des Stücks) */
export function lineWindow(lines: TimedLine[], index: number, endSec?: number): { start: number; end: number } | undefined {
  const start = lines[index]?.line.atSec;
  if (start === undefined) return undefined;
  const next = lines.slice(index + 1).find((l) => l.line.atSec !== undefined && l.line.atSec > start)?.line.atSec;
  const end = next ?? (endSec !== undefined && endSec > start ? endSec : start + SCROLL_LAST_SEC);
  return { start, end };
}
