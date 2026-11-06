import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { can } from '../model/access';
import { createEmptyProject } from '../model/project';
import { createYDocFromProject, DIRECTION_ROOTS, readProjectFromYDoc, updateTouchesOnly } from '../model/ydoc';
import {
  addItemMedia,
  addSection,
  addShowItem,
  clearLineTimes,
  currentLineId,
  defaultItemMedia,
  itemLines,
  nextUntimedLine,
  readMedia,
  removeItemMedia,
  setLineTime,
  sectionBackground,
  setSectionBackground,
  mediaInUse,
  setLyricsBackground,
  setLyricsBackgroundDim,
  updateItemMedia,
  appendPastedText,
  duplicateSection,
  duplicateShowItem,
  formatDuration,
  formatTimecode,
  artTimecodePacket,
  isArtNetHost,
  itemNumbers,
  renumberShowItems,
  itemSections,
  moveSection,
  moveShowItem,
  parseDuration,
  parseSectionText,
  readShow,
  removeSection,
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

describe('Regie: Audio und Zeitpunkte', () => {
  const ref = (id: string) => ({ id, name: `${id}.mp3`, mime: 'audio/mpeg', sizeBytes: 1000, durationSec: 200, sha256: 'x', addedAt: '2026-11-05T10:00:00Z', addedBy: 'Ralf' });

  it('Audio anhängen, Standard wechseln, lösen; Verweis bleibt, solange ein anderes Lied ihn nutzt', () => {
    const d = doc();
    const a = addShowItem(d, 'song', null, { title: 'A' });
    const b = addShowItem(d, 'song', null, { title: 'B' });
    addItemMedia(d, a, ref('m1'), 'Playback', null);
    addItemMedia(d, a, ref('m2'), 'Klick', null);
    addItemMedia(d, b, ref('m1'), 'Playback', null);
    let item = readShow(d).items.find((i) => i.id === a)!;
    expect(item.media).toEqual([
      { mediaId: 'm1', label: 'Playback', isDefault: true },
      { mediaId: 'm2', label: 'Klick' },
    ]);
    expect(readMedia(d).map((m) => m.id)).toEqual(['m1', 'm2']);
    updateItemMedia(d, a, 'm2', { isDefault: true, label: 'Click' }, null);
    item = readShow(d).items.find((i) => i.id === a)!;
    expect(defaultItemMedia(item)).toEqual({ mediaId: 'm2', label: 'Click', isDefault: true });
    removeItemMedia(d, a, 'm2', null);
    expect(defaultItemMedia(readShow(d).items.find((i) => i.id === a)!)?.mediaId).toBe('m1');
    expect(readMedia(d).map((m) => m.id)).toEqual(['m1']);
    removeItemMedia(d, a, 'm1', null);
    expect(readMedia(d).map((m) => m.id)).toEqual(['m1']); // B nutzt sie noch
    removeItemMedia(d, b, 'm1', null);
    expect(readMedia(d)).toEqual([]);
    expect(readProjectFromYDoc(d).ok).toBe(true);
  });

  it('Mitschreiben: nächste Zeile ohne Zeit, aktuelle Zeile zur Abspielzeit, Zeiten löschen', () => {
    const d = doc();
    const song = addShowItem(d, 'song', null, { title: 'Lied' });
    const s1 = addSection(d, song, 'verse', 'Strophe 1', null);
    const s2 = addSection(d, song, 'chorus', 'Refrain', null);
    setSectionText(d, s1, 'Eins\nZwei', null);
    setSectionText(d, s2, 'Drei', null);
    let lines = itemLines(readShow(d).sections, song);
    expect(lines.map((l) => [l.sectionLabel, l.line.text])).toEqual([['Strophe 1', 'Eins'], ['Strophe 1', 'Zwei'], ['Refrain', 'Drei']]);
    expect(nextUntimedLine(lines)?.line.text).toBe('Eins');
    setLineTime(d, s1, lines[0]!.line.id, 3.14159, null);
    setLineTime(d, s2, lines[2]!.line.id, 20, null);
    lines = itemLines(readShow(d).sections, song);
    expect(lines[0]!.line.atSec).toBe(3.1);
    // nach der zuletzt gesetzten Zeile gibt es keine ohne Zeit mehr
    expect(nextUntimedLine(lines)).toBeUndefined();
    expect(currentLineId(lines, 1)).toBeUndefined();
    expect(currentLineId(lines, 10)).toBe(lines[0]!.line.id);
    expect(currentLineId(lines, 25)).toBe(lines[2]!.line.id);
    // Text korrigieren behält die Zeit
    setSectionText(d, s1, 'Einz\nZwei', null);
    expect(itemLines(readShow(d).sections, song)[0]!.line.atSec).toBe(3.1);
    clearLineTimes(d, song, null);
    expect(itemLines(readShow(d).sections, song).every((l) => l.line.atSec === undefined)).toBe(true);
  });
});

describe('Regie: Hintergrundbild des Textfensters', () => {
  it('setzen, abdunkeln, ersetzen und entfernen – der Verweis hält die Datei, solange sie gebraucht wird', () => {
    const d = doc();
    const ref = (id: string) => ({ id, name: `${id}.jpg`, mime: 'image/jpeg', sizeBytes: 10, sha256: '', addedAt: '', addedBy: '' });
    setLyricsBackground(d, ref('bild1'), null);
    const read = () => {
      const r = readProjectFromYDoc(d);
      if (!r.ok) throw new Error(r.error);
      return r.project;
    };
    let p = read();
    expect(p.showSettings.lyricsBackground).toEqual({ mediaId: 'bild1', dim: 0.5 });
    expect(p.media.map((m) => m.id)).toEqual(['bild1']);
    setLyricsBackgroundDim(d, 1.4, null);
    expect(read().showSettings.lyricsBackground?.dim).toBe(1);
    setLyricsBackground(d, ref('bild2'), null, 0.3);
    p = read();
    expect(p.showSettings.lyricsBackground).toEqual({ mediaId: 'bild2', dim: 0.3 });
    expect(p.media.map((m) => m.id)).toEqual(['bild2']);
    setLyricsBackground(d, null, null);
    p = read();
    expect(p.showSettings.lyricsBackground).toBeUndefined();
    expect(p.media).toEqual([]);
  });
});

describe('Regie: Nummern und Timecode', () => {
  it('feste Nummern: neue Einträge die nächste freie, Kopie eine neue, Umsortieren ändert nichts, neu durchnummerieren', () => {
    const d = doc();
    const a = addShowItem(d, 'song', null, { title: 'A' });
    const b = addShowItem(d, 'play', null, { title: 'B' });
    const c = addShowItem(d, 'break', null, { title: 'C' });
    const numbers = () => itemNumbers(readShow(d).items);
    expect([a, b, c].map((id) => numbers().get(id))).toEqual([1, 2, 3]);
    moveShowItem(d, c, 0, null);
    expect([a, b, c].map((id) => numbers().get(id))).toEqual([1, 2, 3]);
    const copy = duplicateShowItem(d, a, null)!;
    expect(numbers().get(copy)).toBe(4);
    removeShowItem(d, b, null);
    const e = addShowItem(d, 'song', null, { title: 'E' });
    expect(numbers().get(e)).toBe(5);
    renumberShowItems(d, null);
    expect(readShow(d).items.map((i) => `${i.title}:${i.number}`)).toEqual(['C:1', 'A:2', 'A (Kopie):3', 'E:4']);
  });

  it('ältere Projekte: Nummern werden vor dem Umsortieren/Löschen festgeschrieben und bleiben', () => {
    const d = doc();
    const ids = ['A', 'B', 'C'].map((title) => addShowItem(d, 'song', null, { title }));
    // wie ein älteres Projekt: Nummern entfernen
    for (const id of ids) (d.getMap('showItems').get(id) as Y.Map<unknown>).delete('number');
    moveShowItem(d, ids[2]!, 0, null);
    expect(readShow(d).items.map((i) => `${i.title}:${i.number}`)).toEqual(['C:3', 'A:1', 'B:2']);
    removeShowItem(d, ids[0]!, null);
    expect(readShow(d).items.map((i) => `${i.title}:${i.number}`)).toEqual(['C:3', 'B:2']);
  });

  it('ältere Projekte ohne Nummern: in Reihenfolge die freien Nummern', () => {
    expect([...itemNumbers([{ id: 'x' }, { id: 'y', number: 1 }, { id: 'z' }]).entries()]).toEqual([
      ['x', 2],
      ['y', 1],
      ['z', 3],
    ]);
  });

  it('Timecode HH:MM:SS:FF mit 25 fps, jeder Eintrag ab 00:00:00:00', () => {
    expect(formatTimecode(0)).toBe('00:00:00:00');
    expect(formatTimecode(61.52)).toBe('00:01:01:13');
    expect(formatTimecode(3599.999)).toBe('00:59:59:24');
    expect(formatTimecode(3600)).toBe('01:00:00:00');
  });
});

describe('Art-Net Timecode', () => {
  it('ArtTimeCode-Paket: Kopf, OpCode 0x9700, Protokoll 14, Frames/Sek/Min/Std, Typ EBU', () => {
    const p = artTimecodePacket(3723.52);
    expect(p.length).toBe(19);
    expect(new TextDecoder().decode(p.slice(0, 7))).toBe('Art-Net');
    expect([...p.slice(7, 12)]).toEqual([0, 0x00, 0x97, 0, 14]);
    expect([...p.slice(14)]).toEqual([13, 3, 2, 1, 1]);
  });
  it('Zieladresse', () => {
    expect(isArtNetHost('2.255.255.255')).toBe(true);
    expect(isArtNetHost('192.168.1.40')).toBe(true);
    expect(isArtNetHost('256.1.1.1')).toBe(false);
    expect(isArtNetHost('konsole.local')).toBe(false);
  });
});

describe('Regie: Hintergrundbilder der Abschnitte', () => {
  const ref = (id: string) => ({ id, name: `${id}.jpg`, mime: 'image/jpeg', sizeBytes: 10, sha256: '', addedAt: '', addedBy: '' });

  it('eigenes Bild, sonst das eines früheren Abschnitts (abschaltbar), sonst das Standardbild', () => {
    const list = [
      { id: 'a', backgroundMediaId: undefined },
      { id: 'b', backgroundMediaId: 'bild-b' },
      { id: 'c' },
      { id: 'd', backgroundInherit: false },
      { id: 'e', backgroundMediaId: 'bild-e' },
      { id: 'f' },
    ];
    expect(list.map((s) => sectionBackground(list, s.id, 'standard'))).toEqual(['standard', 'bild-b', 'bild-b', 'standard', 'bild-e', 'bild-e']);
    expect(sectionBackground(list, undefined, 'standard')).toBe('standard');
    expect(sectionBackground(list, 'a', undefined)).toBeUndefined();
  });

  it('Verweis bleibt, solange verwendet; Kopieren übernimmt das Bild, Löschen räumt auf', () => {
    const d = doc();
    const song = addShowItem(d, 'song', null, { title: 'Lied' });
    const s1 = addSection(d, song, 'verse', 'Strophe 1', null);
    setSectionBackground(d, s1, ref('wald'), null);
    expect(readMedia(d).map((m) => m.id)).toEqual(['wald']);
    const s2 = duplicateSection(d, s1, null)!;
    expect(readShow(d).sections.find((s) => s.id === s2)?.backgroundMediaId).toBe('wald');
    // auf einem Abschnitt entfernt: noch am anderen in Gebrauch
    setSectionBackground(d, s1, null, null);
    expect(mediaInUse(d, 'wald')).toBe(true);
    expect(readMedia(d)).toHaveLength(1);
    // Kopie des Eintrags übernimmt das Bild
    const copy = duplicateShowItem(d, song, null)!;
    expect(itemSections(readShow(d).sections, copy).map((s) => s.backgroundMediaId)).toEqual([undefined, 'wald']);
    // alle Abschnitte mit dem Bild weg → Verweis weg
    removeShowItem(d, copy, null);
    removeSection(d, s2, null);
    expect(readMedia(d)).toEqual([]);
    // Eintrag löschen räumt die Bilder seiner Abschnitte mit auf
    const other = addShowItem(d, 'song', null, { title: 'Anderes' });
    setSectionBackground(d, addSection(d, other, 'verse', 'S', null), ref('see'), null);
    removeShowItem(d, other, null);
    expect(readMedia(d)).toEqual([]);
  });
});
