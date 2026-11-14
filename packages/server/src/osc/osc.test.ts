import { describe, expect, it } from 'vitest';
import { oscToCommand, oscToDeskCue, parseOsc } from './osc';

function pad(s: string): Buffer {
  const b = Buffer.from(`${s}\0`, 'utf8');
  return Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
}
function message(address: string, args: (number | string)[] = [], tags?: string): Buffer {
  const types = tags ?? args.map((a) => (typeof a === 'string' ? 's' : Number.isInteger(a) ? 'i' : 'f')).join('');
  const parts = [pad(address), pad(`,${types}`)];
  for (const [i, a] of args.entries()) {
    if (types[i] === 's') parts.push(pad(String(a)));
    else {
      const b = Buffer.alloc(4);
      if (types[i] === 'i') b.writeInt32BE(Number(a));
      else b.writeFloatBE(Number(a));
      parts.push(b);
    }
  }
  return Buffer.concat(parts);
}

describe('OSC', () => {
  it('Nachrichten mit int/float/string und Bundles lesen', () => {
    expect(parseOsc(message('/steckplan/item', [3]))).toEqual([{ address: '/steckplan/item', args: [3] }]);
    expect(parseOsc(message('/steckplan/forward', [2.5]))[0]!.args[0]).toBeCloseTo(2.5);
    const inner = [message('/steckplan/next'), message('/steckplan/play', [1])];
    const bundle = Buffer.concat([pad('#bundle'), Buffer.alloc(8), ...inner.flatMap((m) => [Buffer.from([0, 0, 0, m.length]), m])]);
    expect(parseOsc(bundle).map((m) => m.address)).toEqual(['/steckplan/next', '/steckplan/play']);
  });

  it('Adressen → Befehle; Loslassen eines Tasters (0) wird ignoriert', () => {
    const cmd = (address: string, args: (number | string)[] = []) => oscToCommand({ address, args });
    expect(cmd('/steckplan/play')).toEqual({ action: 'play' });
    expect(cmd('/steckplan/play', [1])).toEqual({ action: 'play' });
    expect(cmd('/steckplan/play', [0])).toBeNull();
    expect(cmd('/steckplan/stop')).toEqual({ action: 'stop' });
    expect(cmd('/steckplan/forward')).toEqual({ action: 'forward', value: 5 });
    expect(cmd('/steckplan/back', [2])).toEqual({ action: 'back', value: 2 });
    expect(cmd('/steckplan/seek', [61.5])).toEqual({ action: 'seek', value: 61.5 });
    expect(cmd('/steckplan/item', [4])).toEqual({ action: 'item', value: 4 });
    expect(cmd('/steckplan/item', ['4'])).toEqual({ action: 'item', value: 4 });
    expect(cmd('/steckplan/item')).toBeNull();
    // Nummer in der Adresse (Liedliste)
    expect(cmd('/steckplan/lied/13')).toEqual({ action: 'item', value: 13 });
    expect(cmd('/steckplan/item/2')).toEqual({ action: 'item', value: 2 });
    expect(cmd('/steckplan/lied/13', [1])).toEqual({ action: 'item', value: 13 });
    expect(cmd('/steckplan/lied/13', [0])).toBeNull();
    expect(cmd('/steckplan/lied/0')).toBeNull();
    expect(cmd('/steckplan/lied', [7])).toEqual({ action: 'item', value: 7 });
    expect(cmd('/steckplan/lied/x')).toBeNull();
    // nur den Timecode verschieben (Standard 0,1 s)
    expect(cmd('/steckplan/tc/forward')).toEqual({ action: 'tcForward', value: 0.1 });
    expect(cmd('/steckplan/tc/back')).toEqual({ action: 'tcBack', value: 0.1 });
    expect(cmd('/steckplan/tc/back', [0.04])).toEqual({ action: 'tcBack', value: 0.04 });
    expect(cmd('/steckplan/tap')).toEqual({ action: 'tap' });
    // Lichtpult-Cue als Text (kein Befehl)
    expect(cmd('/steckplan/cue', ['Cue 1'])).toBeNull();
    expect(oscToDeskCue({ address: '/steckplan/cue', args: ['Cue 12', 'Intro'] })).toBe('Cue 12 Intro');
    expect(oscToDeskCue({ address: '/steckplan/cue', args: [12.5] })).toBe('12.5');
    expect(oscToDeskCue({ address: '/steckplan/cue', args: [] })).toBeNull();
    expect(oscToDeskCue({ address: '/steckplan/play', args: ['x'] })).toBeNull();
    expect(cmd('/steckplan/tap', [1])).toEqual({ action: 'tap' });
    expect(cmd('/steckplan/tap', [0])).toBeNull(); // Loslassen eines Tasters
    expect(cmd('/steckplan/tc/forward', [0])).toBeNull();
    expect(cmd('/steckplan/scene/next')).toEqual({ action: 'sceneNext' });
    expect(cmd('/steckplan/line/next')).toEqual({ action: 'lineNext' });
    expect(cmd('/steckplan/line/prev', [1])).toEqual({ action: 'linePrev' });
    expect(cmd('/steckplan/line/prev', [0])).toBeNull(); // Loslassen eines Tasters
    expect(cmd('/steckplan/unbekannt')).toBeNull();
    expect(cmd('/anderes/play')).toBeNull();
  });
});
