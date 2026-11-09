import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../model/project';
import { createYDocFromProject } from '../model/ydoc';
import { addLightEvent, itemLightEvents, readLightEvents, removeLightEvent, updateLightEvent, upcomingLightEvents } from './events';
import { addShowItem, duplicateShowItem, removeShowItem } from './show';
import { applyRegieImport, exportRegie, parseRegieFile, planRegieImport } from './transfer';

describe('Licht-Events', () => {
  it('anlegen, nach Zeit sortiert, ändern, löschen; mit dem Eintrag kopiert und gelöscht', () => {
    const doc = createYDocFromProject(createEmptyProject({ name: 'E' }));
    const song = addShowItem(doc, 'song', null, { title: 'Lied' });
    const b = addLightEvent(doc, song, 42.04, 'Pyro', null);
    const a = addLightEvent(doc, song, 12.3, 'Blinder', null);
    expect(itemLightEvents(readLightEvents(doc), song).map((e) => [e.atSec, e.note])).toEqual([
      [12.3, 'Blinder'],
      [42, 'Pyro'],
    ]);
    updateLightEvent(doc, a, { atSec: 50, note: 'Blinder voll' }, null);
    expect(itemLightEvents(readLightEvents(doc), song).map((e) => e.note)).toEqual(['Pyro', 'Blinder voll']);
    removeLightEvent(doc, b, null);
    const copy = duplicateShowItem(doc, song, null)!;
    expect(itemLightEvents(readLightEvents(doc), copy).map((e) => [e.atSec, e.note])).toEqual([[50, 'Blinder voll']]);
    removeShowItem(doc, song, null);
    expect(readLightEvents(doc).map((e) => e.itemId)).toEqual([copy]);
  });
  it('kommende Events mit Zeit bis dahin (gerade erreichte noch kurz)', () => {
    const events = [
      { id: '1', itemId: 'x', atSec: 5, note: 'a' },
      { id: '2', itemId: 'x', atSec: 20, note: 'b' },
    ];
    expect(upcomingLightEvents(events, 6).map((x) => [x.event.id, x.inSec])).toEqual([
      ['1', -1],
      ['2', 14],
    ]);
    expect(upcomingLightEvents(events, 8).map((x) => x.event.id)).toEqual(['2']);
  });
  it('Regie-Export und -Import nehmen die Events mit', () => {
    const doc = createYDocFromProject(createEmptyProject({ name: 'A' }));
    const song = addShowItem(doc, 'song', null, { title: 'Lied' });
    addLightEvent(doc, song, 7, 'Konfetti', null);
    const content = parseRegieFile(JSON.stringify(exportRegie(doc, 'A')));
    expect(content.lightEvents).toHaveLength(1);
    const target = createYDocFromProject(createEmptyProject({ name: 'B' }));
    const plan = planRegieImport(target, content);
    applyRegieImport(target, content, plan, 'replace', null);
    expect(readLightEvents(target).map((e) => [e.atSec, e.note])).toEqual([[7, 'Konfetti']]);
  });
});
