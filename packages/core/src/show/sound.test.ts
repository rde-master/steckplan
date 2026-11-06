import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../model/project';
import { createYDocFromProject } from '../model/ydoc';
import { addScene, readScenes, stickyNote, updateScene } from './scenes';
import { addShowItem, duplicateShowItem, removeShowItem } from './show';
import { addSoundScene, importLightScenes, itemSoundScenes, moveSoundScene, readSoundScenes, removeSoundScene, updateSoundScene } from './sound';

const doc = () => createYDocFromProject(createEmptyProject({ name: 'Ton' }));

describe('Tonszenen', () => {
  it('vom Licht übernehmen: neu anlegen, erneut übernehmen gleicht Name/Auslöser an, Notizen und eigene Szenen bleiben', () => {
    const d = doc();
    const song = addShowItem(d, 'song', null, { title: 'Lied' });
    const l1 = addScene(d, song, null, { name: 'Intro' });
    updateScene(d, l1, { atSec: 0 }, null);
    const l2 = addScene(d, song, null, { name: 'Refrain' });
    updateScene(d, l2, { atSec: 30 }, null);
    expect(importLightScenes(d, song, null)).toBe(2);
    let sound = itemSoundScenes(readSoundScenes(d), song);
    expect(sound.map((s) => `${s.name}@${s.atSec}`)).toEqual(['Intro@0', 'Refrain@30']);
    updateSoundScene(d, sound[1]!.id, { notes: '<b>Chor-Mikros</b>' }, null);
    const own = addSoundScene(d, song, null, { name: 'Applaus', atSec: 90 });
    // Licht ändert sich, dann erneut übernehmen
    updateScene(d, l2, { name: 'Refrain 1', atSec: 32 }, null);
    addScene(d, song, null, { name: 'Bridge' });
    expect(importLightScenes(d, song, null)).toBe(1);
    sound = itemSoundScenes(readSoundScenes(d), song);
    expect(sound.map((s) => s.name)).toEqual(['Intro', 'Refrain 1', 'Bridge', 'Applaus']);
    expect(sound[1]).toMatchObject({ atSec: 32, notes: '<b>Chor-Mikros</b>' });
    expect(sound[3]!.id).toBe(own);
    expect(readScenes(d)).toHaveLength(3);
  });

  it('sortieren, löschen; mit dem Eintrag kopiert und gelöscht', () => {
    const d = doc();
    const song = addShowItem(d, 'song', null, { title: 'Lied' });
    const a = addSoundScene(d, song, null, { name: 'A' });
    const b = addSoundScene(d, song, null, { name: 'B' });
    moveSoundScene(d, b, -1, null);
    expect(itemSoundScenes(readSoundScenes(d), song).map((s) => s.name)).toEqual(['B', 'A']);
    const copy = duplicateShowItem(d, song, null)!;
    expect(itemSoundScenes(readSoundScenes(d), copy).map((s) => s.name)).toEqual(['B', 'A']);
    removeSoundScene(d, a, null);
    expect(itemSoundScenes(readSoundScenes(d), song).map((s) => s.name)).toEqual(['B']);
    removeShowItem(d, song, null);
    expect(readSoundScenes(d).every((s) => s.itemId === copy)).toBe(true);
  });

  it('Notiz bleibt stehen, bis eine Szene mit neuer Notiz kommt', () => {
    const scenes = [{ notes: 'eins' }, {}, { notes: '  ' }, { notes: 'vier' }, {}];
    expect([0, 1, 2, 3, 4].map((i) => stickyNote(scenes, i))).toEqual(['eins', 'eins', 'eins', 'vier', 'vier']);
    expect(stickyNote([{}, { notes: 'x' }], 0)).toBeUndefined();
  });
});
