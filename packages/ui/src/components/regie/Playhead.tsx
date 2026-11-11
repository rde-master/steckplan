// Abspielstrich der Zeitleisten (Führen, Versatz, Szenen, Mitschreiben).

/** einfache rote Linie */
export const PLAYHEAD_RED = 'linear-gradient(rgb(239 68 68), rgb(239 68 68))';

/**
 * Abspielstrich über eine ganze Leiste, als Hintergrundbild gezeichnet: Je Bild ändert sich nur die Lage des Bilds –
 * der Browser malt dann nur neu (kein Layout, keine neue Aufteilung der Seite in Ebenen).
 * at: Anteil der Breite (0 … 1) oder Pixel vom linken Rand. layer: eigene Ebene (nur diese wird neu gemalt) – nicht
 * für sehr breite, rollende Leisten (dort wäre die Ebene riesig). data-position für Tests.
 */
export function Playhead({ at, width, image, testId, className = 'z-10', layer = true }: { at: { fraction: number } | { px: number }; width: number; image: string; testId: string; className?: string; layer?: boolean }) {
  const position = 'px' in at ? `${at.px - width / 2}px 0` : `calc(${at.fraction * 100}% + ${(at.fraction - 0.5) * width}px) 0`;
  return (
    <div
      className={`pointer-events-none absolute inset-0 bg-no-repeat ${layer ? 'will-change-transform' : ''} ${className}`}
      style={{ backgroundImage: image, backgroundSize: `${width}px 100%`, backgroundPosition: position }}
      data-testid={testId}
      data-position={'px' in at ? at.px.toFixed(1) : at.fraction.toFixed(4)}
    />
  );
}
