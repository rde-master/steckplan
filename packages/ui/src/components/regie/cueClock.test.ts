import { afterEach, describe, expect, it, vi } from 'vitest';
import { CueClock } from './LyricsWindow';

afterEach(() => vi.restoreAllMocks());

describe('Uhr einer empfangenen Stelle', () => {
  it('ohne Stelle: steht auf 0', () => {
    const clock = new CueClock();
    expect(clock.paused).toBe(true);
    expect(clock.currentTime).toBe(0);
  });

  it('angehalten: bleibt an der Stelle; läuft: zählt seit dem Empfang weiter (mit Geschwindigkeit)', () => {
    const now = vi.spyOn(performance, 'now');
    const clock = new CueClock();
    now.mockReturnValue(5000);
    clock.set({ at: 12, playing: false, rate: 1, receivedAt: 1000 });
    expect(clock.paused).toBe(true);
    expect(clock.currentTime).toBe(12);

    clock.set({ at: 12, playing: true, rate: 1, receivedAt: 1000 });
    expect(clock.paused).toBe(false);
    expect(clock.currentTime).toBeCloseTo(16);
    clock.set({ at: 12, playing: true, rate: 1.5, receivedAt: 1000 });
    expect(clock.currentTime).toBeCloseTo(18);
    // Empfang „in der Zukunft“ (Uhren weichen ab): nie rückwärts
    clock.set({ at: 12, playing: true, rate: 1, receivedAt: 9000 });
    expect(clock.currentTime).toBe(12);
  });

  it('schwankende Laufzeit (WLAN): kleine Abweichungen weich ausgleichen, nie rückwärts; Sprünge sofort', () => {
    const now = vi.spyOn(performance, 'now');
    const clock = new CueClock();
    now.mockReturnValue(0);
    clock.set({ at: 10, playing: true, rate: 1, receivedAt: 0 });
    now.mockReturnValue(2000);
    expect(clock.currentTime).toBeCloseTo(12);
    // nächste Stelle kam 0,2 s verspätet an: sie sagt 11,8 – angezeigt bleibt 12, danach holt die Uhr auf
    clock.set({ at: 11.8, playing: true, rate: 1, receivedAt: 2000 });
    expect(clock.currentTime).toBeCloseTo(12);
    let last = clock.currentTime;
    for (let t = 2050; t <= 3200; t += 50) {
      now.mockReturnValue(t);
      expect(clock.currentTime).toBeGreaterThan(last);
      last = clock.currentTime;
    }
    // nach dem Ausgleich: wie die Stelle sagt
    expect(clock.currentTime).toBeCloseTo(11.8 + 1.2);
    // zu weit weg (gespult): sofort
    clock.set({ at: 40, playing: true, rate: 1, receivedAt: 3200 });
    expect(clock.currentTime).toBeCloseTo(40);
    // angehalten: genau die Stelle
    clock.set({ at: 40.1, playing: false, rate: 1, receivedAt: 3200 });
    expect(clock.currentTime).toBe(40.1);
  });

  it('meldet jede neue Stelle (Start/Pause und Sprung), damit Anzeigen nachziehen', () => {
    const clock = new CueClock();
    const seen: string[] = [];
    for (const type of ['play', 'pause', 'seeked']) clock.addEventListener(type, () => seen.push(type));
    clock.set({ at: 1, playing: true, rate: 1, receivedAt: 0 });
    clock.set({ at: 2, playing: false, rate: 1, receivedAt: 0 });
    clock.set(null);
    expect(seen).toEqual(['play', 'seeked', 'pause', 'seeked', 'pause', 'seeked']);
  });
});
