import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { LinkMonitor } from './link';
import { advanceLead } from './room';

/** WebSocket-Ersatz: merkt sich die Pings, Pong von Hand */
class FakeSocket extends EventEmitter {
  readonly OPEN = 1;
  readyState = 1;
  pings: Buffer[] = [];
  ping(data: Buffer): void {
    this.pings.push(data);
  }
}

describe('Laufzeit einer Live-Verbindung', () => {
  it('misst hin und zurück, zählt verlorene Pings, schätzt die Verzögerung (Median)', () => {
    let now = 0;
    const socket = new FakeSocket();
    const link = new LinkMonitor(socket as unknown as WebSocket, 0, () => now);
    expect(link.stats()).toEqual({ lost: 0, samples: 0, silentMs: 0 });
    expect(link.oneWaySec()).toBe(0);

    const answer = (index: number, after: number) => {
      now += after;
      socket.emit('pong', socket.pings[index]);
    };
    link.ping();
    answer(0, 20);
    now += 980;
    link.ping();
    answer(1, 40);
    now += 960;
    link.ping();
    answer(2, 300);
    // fremdes Pong (keepAlive, ohne Nummer) und doppeltes zählen nicht
    socket.emit('pong', Buffer.alloc(0));
    socket.emit('pong', socket.pings[0]);
    expect(link.rttMs).toBe(300);
    // ein Ping ohne Antwort: erst nach 2 s verloren
    link.ping();
    now += 1000;
    expect(link.stats()).toMatchObject({ rttMs: 300, avgMs: 120, maxMs: 300, lost: 0, samples: 4, silentMs: 1000 });
    now += 1500;
    expect(link.stats()).toMatchObject({ lost: 1, silentMs: 2500 });
    // Median aus 20/40/300 = 40 ms → 20 ms in eine Richtung
    expect(link.oneWaySec()).toBeCloseTo(0.02);
  });

  it('pingt nur offene Verbindungen und hört beim Schließen auf', () => {
    const socket = new FakeSocket();
    const link = new LinkMonitor(socket as unknown as WebSocket, 0);
    socket.readyState = 3;
    link.ping();
    expect(socket.pings).toHaveLength(0);
  });

  it('Stelle weiterrechnen: nur wenn sie läuft, mit der Geschwindigkeit, auch der Timecode', () => {
    const lead = { itemId: 'a', connectionId: 'c', name: 'R', at: 10, playing: true, rate: 2, tc: { at: 5, playing: true } };
    expect(advanceLead(lead, 0.1)).toMatchObject({ at: 10.2, tc: { at: 5.2, playing: true } });
    expect(advanceLead({ ...lead, playing: false, tc: { at: 5, playing: false } }, 0.1)).toMatchObject({ at: 10, tc: { at: 5 } });
    expect(advanceLead(lead, 0)).toBe(lead);
    // Pause: Restzeit läuft in Echtzeit (auch angehalten), nie unter 0
    expect(advanceLead({ ...lead, playing: false, rate: 2, pause: { leftSec: 10 } }, 3).pause).toEqual({ leftSec: 7 });
    expect(advanceLead({ ...lead, pause: { title: 'P', leftSec: 1 } }, 3).pause).toEqual({ title: 'P', leftSec: 0 });
  });
});
