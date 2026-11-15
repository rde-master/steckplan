import { describe, expect, it } from 'vitest';
import { bandOfChannel, dbmToPercent, evaluateNet, parseNetChecks, worstCheck } from './netcheck';
import { parsePlayerReport } from './player';

const byId = (checks: ReturnType<typeof evaluateNet>) => Object.fromEntries(checks.map((c) => [c.id, c]));

describe('Netzprüfung des Players', () => {
  it('ohne Netz: nur das Problem', () => {
    expect(evaluateNet({ connected: false, wired: false })).toEqual([{ id: 'network', state: 'bad', text: 'Kein Netzwerk', tip: expect.any(String) }]);
  });

  it('gutes WLAN: Signal, 5 GHz, Höchstleistung, schnelle Antwort', () => {
    const checks = evaluateNet({ connected: true, wired: false, wifi: 'Technik', signal: 88, bandGHz: 5, powerSaveAc: 0, powerSaveDc: 3, battery: false, latency: { sent: 10, answered: 10, avgMs: 6, maxMs: 21 } });
    expect(checks.map((c) => [c.id, c.state])).toEqual([
      ['link', 'ok'],
      ['signal', 'ok'],
      ['band', 'ok'],
      ['powersave', 'ok'],
      ['latency', 'ok'],
    ]);
    expect(byId(checks).link!.text).toBe('WLAN „Technik“');
    expect(byId(checks).latency!.text).toBe('Steuersoftware antwortet: Ø 6 ms · max 21 ms');
    expect(checks.every((c) => !c.tip)).toBe(true);
    expect(worstCheck(checks)).toBe('ok');
  });

  it('schwaches WLAN: Hinweise und Probleme mit Tipp', () => {
    const checks = byId(evaluateNet({ connected: true, wired: false, wifi: 'Saal', signal: 42, bandGHz: 2.4, powerSaveAc: 2, battery: true, powerSaveDc: 3, latency: { sent: 10, answered: 9, avgMs: 40, maxMs: 300 } }));
    expect(checks.signal).toMatchObject({ state: 'bad', text: 'WLAN-Signal 42 %' });
    expect(checks.band).toMatchObject({ state: 'warn', text: 'Frequenzband 2,4 GHz' });
    expect(checks.powersave).toMatchObject({ state: 'warn' });
    expect(checks.battery).toMatchObject({ state: 'warn' });
    expect(checks.latency).toMatchObject({ state: 'warn', text: 'Steuersoftware antwortet: Ø 40 ms · max 300 ms · 1 von 10 ohne Antwort' });
    for (const c of Object.values(checks)) if (c.state !== 'ok') expect(c.tip).toBeTruthy();
    // im Akku zählt der Akku-Wert
    expect(byId(evaluateNet({ connected: true, wired: false, wifi: 'x', powerSaveAc: 0, powerSaveDc: 2, battery: true })).powersave!.state).toBe('warn');
    expect(evaluateNet({ connected: true, wired: false, wifi: 'x', latency: { sent: 5, answered: 0 } }).at(-1)).toMatchObject({ state: 'bad', text: 'Steuersoftware antwortet nicht' });
  });

  it('per Kabel: keine WLAN-Prüfungen', () => {
    expect(evaluateNet({ connected: true, wired: true, wifi: 'Saal', signal: 20, bandGHz: 2.4, powerSaveAc: 3 }).map((c) => c.id)).toEqual(['link']);
  });

  it('Hilfen: Kanal → Band, dBm → Prozent; Lebenszeichen übernimmt nur gültige Prüfungen', () => {
    expect([bandOfChannel(6), bandOfChannel(36)]).toEqual([2.4, 5]);
    expect([dbmToPercent(-50), dbmToPercent(-65), dbmToPercent(-110)]).toEqual([100, 70, 0]);
    expect(parseNetChecks([{ id: 'signal', state: 'warn', text: 'x', tip: 't' }, { id: 'boom', state: 'ok', text: 'y' }, { id: 'band', state: 'rot', text: 'z' }, null])).toEqual([{ id: 'signal', state: 'warn', text: 'x', tip: 't' }]);
    expect(parsePlayerReport({ phase: 'ready', checks: [{ id: 'link', state: 'ok', text: 'Kabel' }] })?.checks).toEqual([{ id: 'link', state: 'ok', text: 'Kabel' }]);
  });
});
