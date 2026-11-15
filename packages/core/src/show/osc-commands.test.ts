import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../model/project';
import { createYDocFromProject } from '../model/ydoc';
import { addLightEvent } from './events';
import {
  addOscCommand,
  addOscRange,
  fadeIsFloat,
  fadeValue,
  formatOscCommand,
  inOscRange,
  isOscAddress,
  itemOscTimeline,
  itemStartEndCommands,
  oscArgs,
  oscRanges,
  parseOscArgs,
  readOscCommands,
  removeOscCommand,
  removeOscRange,
  setOscRangeBounds,
  triggerCommands,
  updateOscCommand,
} from './osc-commands';
import { OSC_ALL_ITEMS } from '../model/schema';
import { addScene } from './scenes';
import { addSection, addShowItem, duplicateShowItem, itemTimedLines, readShow, removeShowItem } from './show';
import { applyRegieImport, exportRegie, parseRegieFile, planRegieImport } from './transfer';

describe('OSC-Befehle', () => {
  it('Argumente: Zahlen, Text, Text in Anführungszeichen', () => {
    expect(parseOscArgs('"Go Cue 3" 1 0.5 -2 abc "12"')).toEqual(['Go Cue 3', 1, 0.5, -2, 'abc', '12']);
    expect(parseOscArgs('')).toEqual([]);
    expect(parseOscArgs(undefined)).toEqual([]);
    expect(formatOscCommand({ address: '/cmd', args: '"Go Cue 3"  1' })).toBe('/cmd "Go Cue 3" 1');
    expect(isOscAddress('/eos/cue/1/fire')).toBe(true);
    expect(isOscAddress('cmd')).toBe(false);
    expect(isOscAddress('/a b')).toBe(false);
  });
  it('je Auslöser in Reihenfolge; mit dem Eintrag kopiert (Szenen/Events umgeschlüsselt) und gelöscht; Regie-Export', () => {
    const doc = createYDocFromProject(createEmptyProject({ name: 'O' }));
    const song = addShowItem(doc, 'song', null, { title: 'Lied' });
    const scene = addScene(doc, song, null, { name: 'Intro' });
    const event = addLightEvent(doc, song, 5, 'Pyro', null);
    addOscCommand(doc, { itemId: song, trigger: 'item', address: '/cmd', args: '"Go Cue 1"' }, null);
    const second = addOscCommand(doc, { itemId: song, trigger: 'item', address: '/video/play' }, null);
    addOscCommand(doc, { itemId: song, trigger: 'scene', refId: scene, address: '/cmd', args: '"Go Cue 2"' }, null);
    addOscCommand(doc, { itemId: song, trigger: 'event', refId: event, address: '/pyro/fire', args: '1' }, null);
    const manual = addOscCommand(doc, { itemId: song, trigger: 'manual', label: 'Blackout', address: '/cmd', args: 'Blackout' }, null);
    const all = readOscCommands(doc);
    expect(triggerCommands(all, song, 'item').map((c) => c.address)).toEqual(['/cmd', '/video/play']);
    expect(triggerCommands(all, song, 'scene', scene).map((c) => c.args)).toEqual(['"Go Cue 2"']);
    expect(triggerCommands(all, song, 'scene', 'andere')).toEqual([]);
    updateOscCommand(doc, second, { host: '10.0.0.5', port: 7000 }, null);
    updateOscCommand(doc, manual, { label: '' }, null);
    expect(readOscCommands(doc).find((c) => c.id === manual)!.label).toBeUndefined();
    // Kopie des Eintrags: Szenen- und Event-Befehle zeigen auf die kopierte Szene bzw. das kopierte Event
    const copy = duplicateShowItem(doc, song, null)!;
    const copied = readOscCommands(doc).filter((c) => c.itemId === copy);
    expect(copied).toHaveLength(5);
    expect(copied.find((c) => c.trigger === 'scene')!.refId).not.toBe(scene);
    expect(copied.find((c) => c.trigger === 'item' && c.address === '/video/play')).toMatchObject({ host: '10.0.0.5', port: 7000 });
    // Export/Import
    const content = parseRegieFile(JSON.stringify(exportRegie(doc, 'O')));
    expect(content.oscCommands).toHaveLength(10);
    const target = createYDocFromProject(createEmptyProject({ name: 'Z' }));
    applyRegieImport(target, content, planRegieImport(target, content), 'replace', null);
    expect(readOscCommands(target)).toHaveLength(10);
    // Löschen
    removeOscCommand(doc, manual, null);
    removeShowItem(doc, song, null);
    expect(readOscCommands(doc).every((c) => c.itemId === copy)).toBe(true);
  });

  it('Platzhalter: {nr}, {titel} (auch mit Leerzeichen und Anführungszeichen), {wert} ganz oder als Kommazahl', () => {
    expect(oscArgs('Lied {nr} "{titel}"', { nr: 3, titel: 'Sag "Hallo" Welt' })).toEqual(['Lied', 3, 'Sag "Hallo" Welt']);
    expect(oscArgs('/x {wert} 1', { wert: 42.6 })).toEqual(['/x', 43, 1]);
    expect(oscArgs('"Dimmer"', { wert: 0.5, float: true })).toEqual(['Dimmer', { float: 0.5 }]);
    // auch die Endwerte bleiben Kommazahlen
    expect(oscArgs('{wert}', { wert: 1, float: true })).toEqual([{ float: 1 }]);
    expect(fadeIsFloat({ from: 0, to: 100 })).toBe(false);
    expect(fadeIsFloat({ from: 0, to: 0.8 })).toBe(true);
    expect(fadeIsFloat({ from: 0, to: 1 })).toBe(true);
    expect(fadeIsFloat({ from: 0, to: 1, float: false })).toBe(false);
    expect(fadeIsFloat({ from: 0, to: 255, float: true })).toBe(true);
    expect([fadeValue({ from: 0, to: 100 }, -1), fadeValue({ from: 0, to: 100 }, 0.25), fadeValue({ from: 100, to: 0 }, 2)]).toEqual([0, 25, 0]);
  });

  it('jeder Eintrag, Bereiche (anlegen, Grenzen, im Bereich, löschen), Zeitplan im Stück', () => {
    const doc = createYDocFromProject(createEmptyProject({ name: 'OSC' }));
    const a = addShowItem(doc, 'song', null, { title: 'A', durationSec: 60 });
    const b = addShowItem(doc, 'song', null, { title: 'B', durationSec: 90 });
    const c = addShowItem(doc, 'song', null, { title: 'C' });
    const all = addOscCommand(doc, { itemId: OSC_ALL_ITEMS, trigger: 'item', address: '/song', args: '{nr}' }, null);
    const own = addOscCommand(doc, { itemId: b, trigger: 'item', address: '/own' }, null);
    const allEnd = addOscCommand(doc, { itemId: OSC_ALL_ITEMS, trigger: 'end', address: '/end' }, null);
    expect(itemStartEndCommands(readOscCommands(doc), b, 'item').map((x) => x.id)).toEqual([all, own]);
    expect(itemStartEndCommands(readOscCommands(doc), a, 'end').map((x) => x.id)).toEqual([allEnd]);

    // Bereich A–B: Start und Ende
    const range = addOscRange(doc, a, b, null);
    const [r] = oscRanges(readOscCommands(doc));
    expect(r).toMatchObject({ id: range, fromItemId: a, untilItemId: b });
    expect([r!.start.length, r!.end.length]).toEqual([1, 1]);
    const position = new Map(readShow(doc).items.map((i, n) => [i.id, n]));
    expect([a, b, c].map((id) => inOscRange(position, r!, id))).toEqual([true, true, false]);
    // vertauschte Grenzen gelten auch
    expect(inOscRange(position, { fromItemId: c, untilItemId: b }, a)).toBe(false);
    expect(inOscRange(position, { fromItemId: c, untilItemId: b }, b)).toBe(true);
    setOscRangeBounds(doc, range, { untilItemId: c }, null);
    expect(oscRanges(readOscCommands(doc))[0]!.untilItemId).toBe(c);

    // Zeitplan im Stück B: Zeitpunkt, Zeile, Abschnitt, Ende (eigenes + jeder Eintrag); Bereichsende nur am letzten
    addSection(doc, b, 'verse', 'Strophe', null, [{ id: 'z1', text: 'Eins', atSec: 10 }, { id: 'z2', text: 'Zwei' }]);
    addSection(doc, b, 'chorus', 'Refrain', null, [{ id: 'z3', text: 'Drei', atSec: 30 }]);
    const sections = readShow(doc).sections;
    const refrain = sections.find((x) => x.label === 'Refrain')!.id;
    const time = addOscCommand(doc, { itemId: b, trigger: 'time', atSec: 5, address: '/t' }, null);
    addOscCommand(doc, { itemId: b, trigger: 'line', refId: 'z1', address: '/z1' }, null);
    addOscCommand(doc, { itemId: b, trigger: 'line', refId: 'z2', address: '/ohneZeit' }, null);
    addOscCommand(doc, { itemId: b, trigger: 'section', refId: refrain, address: '/refrain' }, null);
    const itemB = readShow(doc).items.find((i) => i.id === b)!;
    const timeline = itemOscTimeline({ itemId: b, itemTitle: 'B', commands: readOscCommands(doc), events: [], lines: itemTimedLines(sections, itemB), durationSec: 90 });
    expect(timeline.map((x) => [x.key.split(':')[0], x.atSec, x.commands.map((y) => y.address).join(',')])).toEqual([
      ['time', 5, '/t'],
      ['line', 10, '/z1'],
      ['section', 30, '/refrain'],
      ['end', 90, '/end'],
    ]);
    expect(timeline[0]!.key).toBe(`time:${time}`);
    expect(timeline[0]!.source).toBe('Zeit 0:05,0');
    expect(timeline[3]!.source).toBe('Ende: B');
    // Bereich endet mit C: Bereichsende (und Ende für jeden Eintrag) an dessen Dauer
    expect(itemOscTimeline({ itemId: c, commands: readOscCommands(doc), events: [], lines: [], durationSec: 30 }).map((x) => x.key)).toEqual(['end', `range-end:${range}`]);

    // Kopie des Eintrags: Zeile/Abschnitt umgeschlüsselt, Bereiche nicht mitkopiert
    const copy = duplicateShowItem(doc, b, null)!;
    const copied = readOscCommands(doc).filter((x) => x.itemId === copy);
    expect(copied.map((x) => x.trigger).sort()).toEqual(['item', 'line', 'line', 'section', 'time']);
    expect(copied.filter((x) => x.trigger === 'line').every((x) => x.refId !== 'z1' && x.refId !== 'z2')).toBe(true);

    // Eintrag am Ende des Bereichs gelöscht → Bereich weg
    removeShowItem(doc, c, null);
    expect(oscRanges(readOscCommands(doc))).toEqual([]);
    const range2 = addOscRange(doc, a, b, null);
    removeOscRange(doc, range2, null);
    expect(readOscCommands(doc).some((x) => x.trigger === 'range')).toBe(false);
  });
});
