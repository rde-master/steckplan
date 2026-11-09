import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../model/project';
import { createYDocFromProject } from '../model/ydoc';
import { addLightEvent } from './events';
import { addOscCommand, formatOscCommand, isOscAddress, parseOscArgs, readOscCommands, removeOscCommand, triggerCommands, updateOscCommand } from './osc-commands';
import { addScene } from './scenes';
import { addShowItem, duplicateShowItem, removeShowItem } from './show';
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
});
