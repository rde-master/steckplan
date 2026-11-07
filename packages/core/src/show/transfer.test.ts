import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../model/project';
import { ProjectFormatError } from '../model/migrations';
import { createYDocFromProject, readProjectFromYDoc } from '../model/ydoc';
import type { Project } from '../model/schema';
import { addItemMedia, addSection, addShowItem, readShow, setSectionText, updateShowItem, updateShowSettings } from './show';
import { addScene, readScenes, readSceneStates, setFixtureValues, updateScene } from './scenes';
import { addLightTarget, placeLight, readLightPlacements, readLightTargets } from './light';
import { importLightScenes, readSoundScenes } from './sound';
import { applyRegieImport, parseRegieFile, planRegieImport, serializeRegie } from './transfer';

function project(name: string, devices: [string, string][], people: [string, string, string][] = []): Project {
  const p = createEmptyProject({ name });
  const layerId = p.layers[0]!.id;
  return {
    ...p,
    devices: devices.map(([id, label]) => ({ id, label, templateId: 'tpl', layerId })),
    people: people.map(([id, firstName, lastName]) => ({ id, firstName, lastName, kind: '' })),
  };
}

/** Quelle: ein Lied mit Text, Szenen, Ton, Lichtaufbau; ein Schauspiel mit Rolle */
function source() {
  const doc = createYDocFromProject(project('Quelle', [['MH1', 'Moving Head 1'], ['PAR1', 'PAR 1']], [['p1', 'Anna', 'Muster']]));
  updateShowSettings(doc, { startTime: '19:30', lyricsBefore: 2 }, null);
  const song = addShowItem(doc, 'song', null, { title: 'Lied', personIds: ['p1'], durationSec: 200 });
  addItemMedia(doc, song, { id: 'audio1', name: 'lied.mp3', mime: 'audio/mpeg', sizeBytes: 10, sha256: '', addedAt: '', addedBy: '' }, 'Playback', null);
  const section = addSection(doc, song, 'verse', 'Strophe 1', null);
  setSectionText(doc, section, 'Zeile eins\nZeile zwei', null);
  const line2 = readShow(doc).sections[0]!.lines[1]!.id;
  const target = addLightTarget(doc, 'Sänger', null);
  const scene = addScene(doc, song, null, { name: 'Intro' });
  updateScene(doc, scene, { lineId: line2 }, null);
  setFixtureValues(doc, scene, ['MH1'], { dimmer: 80, targetId: target }, null);
  setFixtureValues(doc, scene, ['PAR1'], { dimmer: 50 }, null);
  importLightScenes(doc, song, null);
  placeLight(doc, 'MH1', 2, 1, null);
  const play = addShowItem(doc, 'play', null, { title: 'Stück' });
  const ps = addSection(doc, play, 'scene', 'Szene 1', null);
  setSectionText(doc, ps, 'Hans: Hallo\n(geht ab)', null);
  updateShowItem(doc, play, { roles: [{ ...readShow(doc).items[1]!.roles![0]!, personId: 'p1' }] }, null);
  return doc;
}

describe('Regie exportieren und importieren', () => {
  it('Sicherung im selben Projekt: Ersetzen stellt alles wieder her (gleiche Kennungen)', () => {
    const doc = source();
    const before = readProjectFromYDoc(doc);
    const file = serializeRegie(doc, 'Quelle', new Date('2026-11-07T10:00:00Z'));
    // Regie verändern
    addShowItem(doc, 'break', null, { title: 'Pause' });
    updateShowSettings(doc, { startTime: '20:00' }, null);
    const content = parseRegieFile(file);
    expect(content.projectName).toBe('Quelle');
    const plan = planRegieImport(doc, content);
    expect(plan).toMatchObject({ missingDevices: [], missingPeople: [], missingMedia: [], counts: { items: 2, sections: 2, lightScenes: 1, soundScenes: 1 }, existingItems: 3 });
    applyRegieImport(doc, content, plan, 'replace', null);
    const after = readProjectFromYDoc(doc);
    expect(after.ok && before.ok).toBe(true);
    if (!after.ok || !before.ok) return;
    for (const key of ['show', 'showSettings', 'lightGrid', 'lightPlacements', 'lightTargets', 'lightScenes', 'sceneStates', 'soundScenes', 'media'] as const) {
      expect(after.project[key], key).toEqual(before.project[key]);
    }
  });

  it('anderes Projekt: Geräte und Personen über den Namen, fehlende fallen weg; Medien ohne Datei fallen weg', () => {
    const file = serializeRegie(source(), 'Quelle');
    const doc = createYDocFromProject(project('Ziel', [['X1', 'moving head 1'], ['X2', 'Fluter']], [['q1', 'Anna', 'Muster']]));
    const content = parseRegieFile(file);
    const plan = planRegieImport(doc, content);
    expect(plan.deviceMap).toEqual(new Map([['MH1', 'X1']]));
    expect(plan.missingDevices).toEqual(['PAR 1']);
    expect(plan.personMap).toEqual(new Map([['p1', 'q1']]));
    expect(plan.missingMedia).toEqual(['lied.mp3']);
    applyRegieImport(doc, content, plan, 'replace', null);
    const { items } = readShow(doc);
    expect(items.map((i) => i.title)).toEqual(['Lied', 'Stück']);
    expect(items[0]!.personIds).toEqual(['q1']);
    expect(items[0]!.media).toEqual([]);
    expect(items[1]!.roles![0]).toMatchObject({ name: 'Hans', personId: 'q1' });
    const states = readSceneStates(doc);
    expect(states.map((s) => s.deviceId)).toEqual(['X1']);
    expect(states[0]!.targetId).toBe(readLightTargets(doc)[0]!.id);
    expect(readLightPlacements(doc)).toEqual([{ id: 'X1', col: 2, row: 1 }]);
    expect(readProjectFromYDoc(doc).ok).toBe(true);
  });

  it('Anhängen: neue Kennungen, Einträge hinten mit nächsten Nummern, Verweise umgeschlüsselt; Einstellungen bleiben', () => {
    const src = source();
    const file = serializeRegie(src, 'Quelle');
    const doc = source();
    updateShowSettings(doc, { startTime: '18:00' }, null);
    const content = parseRegieFile(file);
    applyRegieImport(doc, content, planRegieImport(doc, content), 'append', null);
    const { items, sections } = readShow(doc);
    expect(items.map((i) => [i.title, i.number])).toEqual([['Lied', 1], ['Stück', 2], ['Lied', 3], ['Stück', 4]]);
    expect(new Set(items.map((i) => i.id)).size).toBe(4);
    expect(doc.getMap('showSettings').get('startTime')).toBe('18:00');
    // gleichnamiges Lichtziel wird geteilt, Platz im Lichtaufbau bleibt
    expect(readLightTargets(doc)).toHaveLength(1);
    expect(readLightPlacements(doc)).toEqual([{ id: 'MH1', col: 2, row: 1 }]);
    // Szene des neuen Lieds hängt an der neuen Textzeile, die Tonszene an der neuen Lichtszene
    const newSong = items[2]!;
    const scene = readScenes(doc).find((s) => s.itemId === newSong.id)!;
    const newLines = sections.filter((s) => s.itemId === newSong.id).flatMap((s) => s.lines);
    expect(scene.lineId).toBe(newLines[1]!.id);
    expect(readSoundScenes(doc).find((s) => s.itemId === newSong.id)!.lightSceneId).toBe(scene.id);
    expect(readSceneStates(doc).filter((s) => s.sceneId === scene.id)).toHaveLength(2);
    // Rolle im neuen Stück: neue Kennung, Zeilen verweisen darauf
    const newPlay = items[3]!;
    const role = newPlay.roles![0]!;
    expect(role.id).not.toBe(items[1]!.roles![0]!.id);
    expect(sections.find((s) => s.itemId === newPlay.id)!.lines[0]!.roleId).toBe(role.id);
    expect(readProjectFromYDoc(doc).ok).toBe(true);
  });

  it('fremde oder kaputte Dateien werden abgelehnt', () => {
    expect(() => parseRegieFile('kein json')).toThrow(ProjectFormatError);
    expect(() => parseRegieFile(JSON.stringify(createEmptyProject({ name: 'P' })))).toThrow(/kein Regie-Export/);
    expect(() => parseRegieFile(JSON.stringify({ format: 'steckplan-regie', schemaVersion: 99 }))).toThrow(ProjectFormatError);
    expect(() => parseRegieFile(JSON.stringify({ format: 'steckplan-regie', schemaVersion: 9, show: { items: [{ id: 'a' }] } }))).toThrow(ProjectFormatError);
  });
});
