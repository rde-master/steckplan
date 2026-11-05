import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../model/project';
import { createYDocFromProject, readProjectFromYDoc } from '../model/ydoc';
import { addSection, addShowItem, duplicateShowItem, itemLines, readShow, removeShowItem, setLineTime, setSectionText } from './show';
import {
  addScene,
  clearFixtureValues,
  currentSceneId,
  duplicateScene,
  itemScenes,
  moveScene,
  readScenes,
  readSceneStates,
  removeScene,
  sceneStates,
  sceneTime,
  setFixtureValues,
  updateScene,
} from './scenes';

const doc = () => createYDocFromProject(createEmptyProject({ name: 'Szenen' }));

describe('Lichtszenen', () => {
  it('anlegen „wie vorige“, leer, sortieren, kopieren, löschen; Werte für mehrere Geräte', () => {
    const d = doc();
    const song = addShowItem(d, 'song', null, { title: 'Lied' });
    const s1 = addScene(d, song, null);
    setFixtureValues(d, s1, ['MH1', 'MH2'], { dimmer: 80, color: { hex: '#ff0000', name: 'Rot' } }, null);
    setFixtureValues(d, s1, ['MH2'], { gobo: { wheel: 0, name: 'Sterne', rotate: 'cw' }, targetId: 't1' }, null);
    // wie vorige
    const s2 = addScene(d, song, null);
    expect(sceneStates(readSceneStates(d), s2).get('MH2')).toMatchObject({ dimmer: 80, gobo: { name: 'Sterne' }, targetId: 't1' });
    setFixtureValues(d, s2, ['MH2'], { gobo: undefined, dimmer: 0 }, null);
    expect(sceneStates(readSceneStates(d), s2).get('MH2')!.gobo).toBeUndefined();
    expect(sceneStates(readSceneStates(d), s1).get('MH2')!.gobo).toEqual({ wheel: 0, name: 'Sterne', rotate: 'cw' });
    // leer beginnen
    const s3 = addScene(d, song, null, { copyFrom: null, name: 'Blackout' });
    expect(sceneStates(readSceneStates(d), s3).size).toBe(0);
    expect(itemScenes(readScenes(d), song).map((s) => s.name)).toEqual(['Szene 1', 'Szene 2', 'Blackout']);
    moveScene(d, s3, -1, null);
    const copy = duplicateScene(d, s1, null)!;
    expect(itemScenes(readScenes(d), song).map((s) => s.name)).toEqual(['Szene 1', 'Szene 1 (Kopie)', 'Blackout', 'Szene 2']);
    expect(sceneStates(readSceneStates(d), copy).get('MH1')).toMatchObject({ dimmer: 80 });
    // Werte löschen; leerer Eintrag verschwindet
    clearFixtureValues(d, copy, ['MH1'], null);
    setFixtureValues(d, copy, ['MH2'], { dimmer: undefined, color: undefined, gobo: undefined, targetId: undefined }, null);
    expect(sceneStates(readSceneStates(d), copy).size).toBe(0);
    removeScene(d, s1, null);
    expect(readSceneStates(d).some((s) => s.sceneId === s1)).toBe(false);
    expect(itemScenes(readScenes(d), song).map((s) => s.order)).toEqual([0, 1, 2]);
    expect(readProjectFromYDoc(d).ok).toBe(true);
    // Eintrag löschen nimmt die Szenen mit
    removeShowItem(d, song, null);
    expect(readScenes(d)).toEqual([]);
    expect(readSceneStates(d)).toEqual([]);
  });

  it('Auslöser: Zeitpunkt oder Textzeile; aktuelle Szene zur Abspielzeit; Kopie des Eintrags schlüsselt Zeilen um', () => {
    const d = doc();
    const song = addShowItem(d, 'song', null, { title: 'Lied' });
    const sec = addSection(d, song, 'verse', 'Strophe 1', null);
    setSectionText(d, sec, 'Eins\nZwei', null);
    const lines = () => itemLines(readShow(d).sections, song).map((l) => l.line);
    setLineTime(d, sec, lines()[1]!.id, 30, null);
    const intro = addScene(d, song, null, { name: 'Intro' });
    const strophe = addScene(d, song, null, { name: 'Strophe' });
    const ohne = addScene(d, song, null, { name: 'ohne Zeit' });
    updateScene(d, intro, { atSec: 0 }, null);
    updateScene(d, strophe, { lineId: lines()[1]!.id }, null);
    const scenes = itemScenes(readScenes(d), song);
    expect(sceneTime(scenes[1]!, lines())).toBe(30);
    expect(sceneTime(scenes[2]!, lines())).toBeUndefined();
    expect(currentSceneId(scenes, lines(), 10)).toBe(intro);
    expect(currentSceneId(scenes, lines(), 31)).toBe(strophe);
    expect(currentSceneId(scenes.filter((s) => s.id === ohne), lines(), 31)).toBeUndefined();

    setFixtureValues(d, strophe, ['PAR1'], { dimmer: 50 }, null);
    const copy = duplicateShowItem(d, song, null)!;
    const copiedScenes = itemScenes(readScenes(d), copy);
    const copiedLines = itemLines(readShow(d).sections, copy).map((l) => l.line);
    expect(copiedScenes.map((s) => s.name)).toEqual(['Intro', 'Strophe', 'ohne Zeit']);
    expect(copiedScenes[1]!.lineId).toBe(copiedLines[1]!.id);
    expect(copiedScenes[1]!.lineId).not.toBe(lines()[1]!.id);
    expect(sceneStates(readSceneStates(d), copiedScenes[1]!.id).get('PAR1')).toMatchObject({ dimmer: 50 });
  });
});
