import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { login, startTestServer, waitFor, type TestServer } from './test-utils';

let server: TestServer | undefined;
const sockets: WebSocket[] = [];
afterEach(async () => {
  for (const s of sockets.splice(0)) s.terminate();
  await server?.close();
  server = undefined;
});

describe('Lebenszeichen auf WebSocket-Verbindungen', () => {
  it('sendet regelmäßig Pings (hält Proxys offen) und beendet Verbindungen ohne Antwort', async () => {
    server = await startTestServer({ keepAliveMs: 40 });
    const cookie = await login(server, 'edit');
    const url = `${server.baseUrl.replace('http', 'ws')}/api/events`;

    // normaler Client antwortet automatisch mit Pong → bleibt verbunden
    const ok = new WebSocket(url, { headers: { cookie } });
    sockets.push(ok);
    let pings = 0;
    ok.on('ping', () => (pings += 1));
    await new Promise((r) => ok.once('open', r));
    await waitFor(() => pings >= 3, 2000, 'keine Pings');
    expect(ok.readyState).toBe(WebSocket.OPEN);

    // Gegenstelle antwortet nicht → Server beendet die Verbindung
    const dead = new WebSocket(url, { headers: { cookie }, autoPong: false });
    sockets.push(dead);
    let closed = false;
    dead.on('close', () => (closed = true));
    await new Promise((r) => dead.once('open', r));
    await waitFor(() => closed, 2000, 'tote Verbindung nicht beendet');
    expect(ok.readyState).toBe(WebSocket.OPEN);
  });
});
