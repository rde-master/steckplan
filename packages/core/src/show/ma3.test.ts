import { describe, expect, it } from 'vitest';
import { ma3QueryCommand, ma3QueryConfig, parseMa3Reply } from './ma3';

describe('grandMA3-Abfrage', () => {
  it('Befehlszeile: Lua in doppelten Anführungszeichen, innen keine weiteren, Antwort über die OSC-Zeile', () => {
    const cmd = ma3QueryCommand(103, 2);
    expect(cmd.startsWith('Lua "')).toBe(true);
    expect(cmd.endsWith('"')).toBe(true);
    // genau zwei doppelte Anführungszeichen: die der Befehlszeile
    expect(cmd.split('"').length - 1).toBe(2);
    expect(cmd).toContain("ObjectList,'Sequence 103'");
    expect(cmd).toContain("Cmd('SendOSC 2 '..q..'/steckplan/ma3,iss,103,'");
    expect(cmd).toContain('CurrentChild()');
  });

  it('Antwort lesen: Cue mit Name, kein Cue, Sequenz fehlt, ungültig', () => {
    expect(parseMa3Reply([103, '4', 'Refrain'])).toEqual({ sequence: 103, cue: '4', name: 'Refrain', noSequence: false });
    expect(parseMa3Reply([5, '1.5', '-'])).toEqual({ sequence: 5, cue: '1.5', noSequence: false });
    expect(parseMa3Reply([5, '-', '-'])).toEqual({ sequence: 5, noSequence: false });
    expect(parseMa3Reply([5, '?', '-'])).toEqual({ sequence: 5, noSequence: true });
    expect(parseMa3Reply(['7', 3, 'Intro'])).toEqual({ sequence: 7, cue: '3', name: 'Intro', noSequence: false });
    expect(parseMa3Reply([0, '1', 'x'])).toBeNull();
    expect(parseMa3Reply(['abc'])).toBeNull();
    expect(parseMa3Reply([])).toBeNull();
  });

  it('Einstellung mit Vorgaben ergänzen', () => {
    expect(ma3QueryConfig(undefined)).toEqual({ enabled: false, host: '', port: 8000, address: '/cmd', oscLine: 1 });
    expect(ma3QueryConfig({ enabled: true, host: ' 10.0.0.5 ', port: 9000, address: '/gma3/cmd', oscLine: 3 })).toEqual({ enabled: true, host: '10.0.0.5', port: 9000, address: '/gma3/cmd', oscLine: 3 });
    expect(ma3QueryConfig({ port: 0, address: 'cmd', oscLine: 0 })).toMatchObject({ port: 8000, address: '/cmd', oscLine: 1 });
  });
});
