// Lebenszeichen für WebSocket-Verbindungen: regelmäßig ein Ping senden.
// Hält die Verbindung durch Reverse-Proxys offen, die ruhende Verbindungen trennen (z. B. nginx nach 60 s),
// und beendet Verbindungen, deren Gegenstelle nicht mehr antwortet.
import type { WebSocket } from 'ws';

export const DEFAULT_KEEPALIVE_MS = 25_000;

export function keepAlive(socket: WebSocket, intervalMs: number = DEFAULT_KEEPALIVE_MS): void {
  if (intervalMs <= 0) return;
  let alive = true;
  socket.on('pong', () => {
    alive = true;
  });
  const timer = setInterval(() => {
    if (socket.readyState !== socket.OPEN) return;
    if (!alive) {
      // auf das letzte Ping kam keine Antwort → Verbindung ist tot
      socket.terminate();
      return;
    }
    alive = false;
    try {
      socket.ping();
    } catch {
      // Verbindung wird gerade geschlossen
    }
  }, intervalMs);
  timer.unref?.();
  socket.once('close', () => clearInterval(timer));
}
