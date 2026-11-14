// Fortschritt und Countdown für Textzeilen und Szenen beim Führen: aktualisieren sich selbst, die große Ansicht
// rechnet dafür nicht je Bild neu (siehe lib/playerTime.ts).
import { usePlayerTime, usePlayerValue, type TimeSource } from '../../lib/playerTime';
import { texts } from '../../texts';
import { formatSceneClock } from './ScenesSection';

const FILL = 'linear-gradient(currentColor, currentColor)';

/** Balken über dem aktuellen (grün, füllt sich) bzw. nächsten Eintrag (rot, leert sich) bis zum Start des nächsten */
export function CueBar({ source, kind, startAt, nextAt, testPrefix }: { source: TimeSource; kind: 'current' | 'next'; startAt: number; nextAt: number; testPrefix: string }) {
  const time = usePlayerTime(source);
  const progress = Math.min(1, Math.max(0, (time - startAt) / (nextAt - startAt)));
  const width = kind === 'current' ? progress : 1 - progress;
  // als Hintergrund auf eigener Ebene gezeichnet: je Bild ändert sich nur die Füllung – kein neues Layout, und der
  // Browser malt nur diese kleine Ebene neu. Nicht ganz deckend (/99): bei deckenden Flächen, deren Größe sich
  // ändert, teilt Chromium die ganze Seite je Bild neu in Ebenen auf (gemessen: teurer als alles andere).
  return <div className={`h-full w-full bg-no-repeat will-change-transform ${kind === 'current' ? 'text-emerald-500/99' : 'text-red-500/99'}`} style={{ backgroundImage: FILL, backgroundSize: `${width * 100}% 100%` }} data-testid={`${testPrefix}-${kind}`} data-progress={width.toFixed(2)} />;
}

/**
 * Sekunden bis zu einem Zeitpunkt als „3,0 s“ (immer mit Zehntel – die Zahl springt nicht); vorbei, ohne Ziel oder
 * ohne Quelle (source null = kein Countdown): null
 */
export function useCountdown(source: TimeSource | null, at: number | undefined): string | null {
  const active = source !== null && at !== undefined;
  return usePlayerValue(active ? source : null, (time) => (active && at > time ? texts.regie.performance.countdown(at - time) : null));
}

/** Startpunkt als „1:12,0“ – immer mit Zehntel, damit Zeiten untereinander und beim Wechsel zum Countdown gleich breit bleiben */
export function cueClock(sec: number): string {
  return formatSceneClock(sec).replace('.', ',');
}
