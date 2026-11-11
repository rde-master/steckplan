// Abspielstrich der Zeitleisten (Führen, Versatz).
/**
 * Abspielstrich über eine ganze Leiste: als Hintergrundbild einer eigenen Ebene gezeichnet. Je Bild ändert sich nur
 * die Lage des Bilds – der Browser zeichnet dann nur diese Ebene neu (kein Layout, keine neue Aufteilung der Seite).
 * position: 0 … 1 (Anteil der Breite), data-position für Tests.
 */
export function Playhead({ position, width, image, testId }: { position: number; width: number; image: string; testId: string }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 bg-no-repeat will-change-transform"
      style={{ backgroundImage: image, backgroundSize: `${width}px 100%`, backgroundPosition: `calc(${position * 100}% + ${(position - 0.5) * width}px) 0` }}
      data-testid={testId}
      data-position={position.toFixed(4)}
    />
  );
}
