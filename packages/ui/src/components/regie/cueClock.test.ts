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
