import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { can } from '../model/access';
import { createEmptyProject } from '../model/project';
import { createYDocFromProject, DIRECTION_ROOTS, readProjectFromYDoc, updateTouchesOnly } from '../model/ydoc';
import {
  addSection,
  addShowItem,
  appendPastedText,
  duplicateSection,
  duplicateShowItem,
  formatDuration,
  itemSections,
  moveSection,
  moveShowItem,
  parseDuration,
  parseSectionText,
  readShow,
  removeShowItem,
  sectionToText,
  setSectionText,
  showSchedule,
  splitPastedText,
  updateShowItem,
  updateShowSettings,
} from './show';

function doc(): Y.Doc {
  return createYDocFromProject(createEmptyProject({ name: 'Regie' }));
}

describe('Regie: Zugang', () => {
  it('Regie darf nur die Regie bearbeiten', () => {
    expect(can('direction', 'editShow')).toBe(true);
    expect(can('direction', 'editProject')).toBe(false);
    expect(can('direction', 'checkItems')).toBe(false);
    expect(can('direction', 'viewSecrets')).toBe(false);
    expect(can('edit', 'editShow')).toBe(true);
    expect(can('local', 'editShow')).toBe(true);
    expect(can('read', 'editShow')).toBe(false);
  });

  it('Server-Prüfung: nur Änderungen an Regie-Bereichen gelten als erlaubt', () => {
    const server = doc();
    const client = new Y.Doc();
    Y.applyUpdate(client, Y.encodeStateAsUpdate(server));
    const capture = (change: () => void): Uint8Array => {
      const before = Y.encodeStateVector(client);
      change();
      return Y.encodeStateAsUpdate(client, before);
    };
    const show = capture(() => addShowItem(client, 'song', null, { title: 'Opener' }));
    expect(updateTouchesOnly(server, show, DIRECTION_ROOTS)).toBe(true);
    Y.applyUpdate(server, show);
    const settings = capture(() => updateShowSettings(client, { startTime: '19:30' }, null));
    expect(updateTouchesOnly(server, settings, DIRECTION_ROOTS)).toBe(true);
    Y.applyUpdate(server, settings);
    const meta = capture(() => client.getMap('meta').set('venue', 'Halle'));
    expect(updateTouchesOnly(server, meta, DIRECTION_ROOTS)).toBe(false);
    Y.applyUpdate(server, meta); // (im Test übernehmen, damit die folgenden Änderungen vollständig sind)
    const mixed = capture(() => {
      client.transact(() => {
        addShowItem(client, 'break', null);
        client.getMap('devices').set('x', new Y.Map());
      });
    });
    expect(updateTouchesOnly(server, mixed, DIRECTION_ROOTS)).toBe(false);
    Y.applyUpdate(server, mixed);
    // Löschen im Regie-Bereich ist erlaubt
    const id = readShow(client).items.find((i) => i.title === 'Opener')!.id;
    const removal = capture(() => removeShowItem(client, id, null));
    expect(updateTouchesOnly(server, removal, DIRECTION_ROOTS)).toBe(true);
    Y.applyUpdate(server, removal);
    // die Prüfung verändert das Dokument selbst nicht
    const probe = capture(() => client.getMap('meta').set('venue', 'Wiese'));
    updateTouchesOnly(server, probe, DIRECTION_ROOTS);
    expect(server.getMap('meta').get('venue')).toBe('Halle');
    // Änderung, deren Vorgänger fehlt, wird nicht erlaubt
    const later = capture(() => addShowItem(client, 'song', null));
    const fresh = doc();
    expect(updateTouchesOnly(fresh, later, DIRECTION_ROOTS)).toBe(false);
  });
});

describe('Regie: Ablauf', () => {
  it('anlegen, sortieren, kopieren, löschen; Startzeiten und Gesamtdauer', () => {
    const d = doc();
    const a = addShowItem(d, 'song', null, { title: 'Opener', durationSec: 220 });
    const b = addShowItem(d, 'play', null, { title: 'Szene 1', durationSec: 480 });
    const c = addShowItem(d, 'break', null, { title: 'Pause', durationSec: 900 });
    const n = addShowItem(d, 'announcement', null, { title: 'Begrüßung' }, undefined);
    moveShowItem(d, n, 0, null);
    expect(readShow(d).items.map((i) => i.title)).toEqual(['Begrüßung', 'Opener', 'Szene 1', 'Pause']);
    updateShowSettings(d, { startTime: '19:30' }, null);
    updateShowItem(d, n, { durationSec: 60 }, null);
    const { items } = readShow(d);
    const schedule = showSchedule(items, { startTime: '19:30' });
    expect([n, a, b, c].map((id) => schedule.entries.get(id)!.clock)).toEqual(['19:30', '19:31', '19:34', '19:42']);
    expect(schedule.totalSec).toBe(60 + 220 + 480 + 900);
    expect(showSchedule(items, {}).entries.get(b)).toEqual({ offsetSec: 280 });

    addSection(d, a, 'chorus', 'Refrain', null, [{ id: 'l1', text: 'La la' }]);
    const copy = duplicateShowItem(d, a, null)!;
    expect(readShow(d).items.map((i) => i.title)).toEqual(['Begrüßung', 'Opener', 'Opener (Kopie)', 'Szene 1', 'Pause']);
    const copied = itemSections(readShow(d).sections, copy);
    expect(copied.map((s) => s.lines[0]!.text)).toEqual(['La la']);
    expect(copied[0]!.lines[0]!.id).not.toBe('l1');
    removeShowItem(d, a, null);
    expect(readShow(d).sections.filter((s) => s.itemId === a)).toEqual([]);
    expect(readShow(d).items.map((i) => i.order)).toEqual([0, 1, 2, 3]);
    // gültig in der Datei
    const read = readProjectFromYDoc(d);
    expect(read.ok).toBe(true);
  });

  it('Dauer lesen und anzeigen', () => {
    expect(parseDuration('3:40')).toBe(220);
    expect(parseDuration('1:02:03')).toBe(3723);
    expect(parseDuration('15')).toBe(900);
    expect(parseDuration('4 min')).toBe(240);
    expect(parseDuration('')).toBeUndefined();
    expect(parseDuration('drei')).toBeUndefined();
    expect(formatDuration(220)).toBe('3:40');
    expect(formatDuration(3723)).toBe('1:02:03');
  });
});

describe('Regie: Texte', () => {
  it('Lied: Zeilen behalten ihre Kennung beim Einfügen, Löschen und Korrigieren', () => {
    const first = parseSectionText('Eins\nZwei\nDrei', [], [], false).lines;
    const ids = first.map((l) => l.id);
    const timed = first.map((l, i) => ({ ...l, atSec: i * 10 }));
    // Zeile eingefügt, Tippfehler korrigiert, Zeile gelöscht
    const next = parseSectionText('Null\nEins\nZwo\n', timed, [], false).lines;
    expect(next.map((l) => l.text)).toEqual(['Null', 'Eins', 'Zwo']);
    expect(next[1]!.id).toBe(ids[0]);
    expect(next[1]!.atSec).toBe(0);
    expect(next[2]!.id).toBe(ids[1]); // „Zwei“ → „Zwo“ bleibt dieselbe Zeile
    expect(next[0]!.id).not.toBe(ids[2]);
    expect(sectionToText(next, [], false)).toBe('Null\nEins\nZwo');
  });

  it('Schauspiel: „Rolle: Text“, Fortsetzung ohne Rolle, Regieanweisung in Klammern; Rollen werden angelegt', () => {
    const roles = [{ id: 'r1', name: 'Hamlet' }];
    const { lines, roles: all } = parseSectionText('Hamlet: Sein oder nicht sein,\ndas ist hier die Frage.\n(Ophelia tritt auf)\nOphelia: Mein Prinz!\n19:30 Uhr ist es.', [], roles, true);
    expect(all.map((r) => r.name)).toEqual(['Hamlet', 'Ophelia']);
    const ophelia = all[1]!.id;
    expect(lines.map((l) => [l.text, l.roleId ?? null, l.direction ?? false])).toEqual([
      ['Sein oder nicht sein,', 'r1', false],
      ['das ist hier die Frage.', 'r1', false],
      ['Ophelia tritt auf', null, true],
      ['Mein Prinz!', ophelia, false],
      ['19:30 Uhr ist es.', ophelia, false],
    ]);
    expect(sectionToText(lines, all, true)).toBe('Hamlet: Sein oder nicht sein,\ndas ist hier die Frage.\n(Ophelia tritt auf)\nOphelia: Mein Prinz!\n19:30 Uhr ist es.');
    // Groß-/Kleinschreibung der Rolle egal, keine doppelte Rolle
    expect(parseSectionText('HAMLET: Ja', [], all, true).roles).toHaveLength(2);
  });

  it('ganzen Text einfügen: Abschnitte und Überschriften erkennen', () => {
    expect(splitPastedText('[Strophe 1]\nA\nB\n\nRefrain:\nC\nD\n\nE\nF', 'song')).toEqual([
      { kind: 'verse', label: 'Strophe 1', text: 'A\nB' },
      { kind: 'chorus', label: 'Refrain', text: 'C\nD' },
      { kind: 'verse', label: 'Strophe 2', text: 'E\nF' },
    ]);
    expect(splitPastedText('Hamlet: A\n\nOphelia: B', 'play').map((p) => p.label)).toEqual(['Szene 1', 'Szene 2']);
    const d = doc();
    const play = addShowItem(d, 'play', null, { title: 'Hamlet' });
    appendPastedText(d, play, 'Hamlet: Sein\n\nOphelia: Prinz', null);
    const { items, sections } = readShow(d);
    expect(items[0]!.roles!.map((r) => r.name)).toEqual(['Hamlet', 'Ophelia']);
    const secs = itemSections(sections, play);
    expect(secs.map((s) => s.lines[0]!.text)).toEqual(['Sein', 'Prinz']);
    // Abschnitte: verschieben, kopieren, Text ändern behält Kennungen
    const lineId = secs[0]!.lines[0]!.id;
    moveSection(d, secs[0]!.id, 1, null);
    expect(itemSections(readShow(d).sections, play).map((s) => s.label)).toEqual(['Szene 2', 'Szene 1']);
    duplicateSection(d, secs[1]!.id, null);
    expect(itemSections(readShow(d).sections, play)).toHaveLength(3);
    setSectionText(d, secs[0]!.id, 'Hamlet: Sein\nHamlet: oder nicht', null);
    const changed = readShow(d).sections.find((s) => s.id === secs[0]!.id)!;
    expect(changed.lines[0]!.id).toBe(lineId);
    expect(changed.lines.map((l) => l.text)).toEqual(['Sein', 'oder nicht']);
  });
});
