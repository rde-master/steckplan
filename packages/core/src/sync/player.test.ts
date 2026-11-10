import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../model/project';
import { createYDocFromProject, readProjectFromYDoc } from '../model/ydoc';
import { addLyricsSlide, addShowItem, effectiveBackground, isVideoMedia, keepBackgroundMedia, lyricsImages, mediaInUse, readShow, removeLyricsSlide, removeShowItem, setLyricsBackground, setLyricsSlideTiming } from '../show/show';
import { exportRegie } from '../show/transfer';
import { formatBytes, pairingCode, parseDiscoveryReply, parsePlayerReport, playerCatalogEntry, playerMediaIds } from './player';

function projectOf(doc: Parameters<typeof readProjectFromYDoc>[0]) {
  const read = readProjectFromYDoc(doc);
  if (!read.ok) throw new Error(read.error);
  return read.project;
}

const ref = (id: string, mime: string) => ({ id, name: `${id}.bin`, mime, sizeBytes: 100, sha256: '', addedAt: '', addedBy: '' });

describe('Hintergrund je Eintrag (Bilder und Videos)', () => {
  it('eigener Hintergrund: anhängen, Ablauf einmalig, Datei bleibt verwendet; gilt vor dem Standard; Löschen des Eintrags räumt auf', () => {
    const doc = createYDocFromProject(createEmptyProject({ name: 'V' }));
    const song = addShowItem(doc, 'song', null, { title: 'Lied' });
    setLyricsBackground(doc, ref('std', 'image/png'), null);
    addLyricsSlide(doc, ref('v1', 'video/mp4'), null, song);
    addLyricsSlide(doc, ref('v2', 'video/webm'), null, song);
    setLyricsSlideTiming(doc, { loop: false, fadeSec: 2 }, null, song);
    const item = () => readShow(doc).items.find((i) => i.id === song)!;
    expect(item().lyricsBackground).toEqual({ mediaId: 'v1', slides: ['v2'], dim: 0.5, loop: false, fadeSec: 2 });
    // Schleife ist Standard: nicht gespeichert
    setLyricsSlideTiming(doc, { loop: true }, null, song);
    expect(item().lyricsBackground).not.toHaveProperty('loop');
    expect(mediaInUse(doc, 'v2')).toBe(true);

    const project = projectOf(doc);
    expect(effectiveBackground(project.showSettings, item())).toMatchObject({ own: true, background: { mediaId: 'v1' } });
    expect(effectiveBackground(project.showSettings, undefined)).toMatchObject({ own: false, background: { mediaId: 'std' } });
    expect(playerMediaIds(project).sort()).toEqual(['std', 'v1', 'v2']);
    // Regie-Export nimmt die Videos mit
    expect((exportRegie(doc, 'V').media as { id: string }[]).map((m) => m.id).sort()).toEqual(['std', 'v1', 'v2']);

    removeLyricsSlide(doc, 'v1', null, song);
    expect(item().lyricsBackground?.mediaId).toBe('v2');
    expect(projectOf(doc).media.map((m) => m.id)).not.toContain('v1');
    removeShowItem(doc, song, null);
    expect(projectOf(doc).media.map((m) => m.id)).toEqual(['std']);
  });

  it('Video erkennen; beim Import nur vorhandene Dateien', () => {
    expect(isVideoMedia({ mime: 'video/mp4', name: '' })).toBe(true);
    expect(isVideoMedia({ mime: '', name: 'Intro.MOV' })).toBe(true);
    expect(isVideoMedia({ mime: 'image/png', name: 'a.mp4' })).toBe(false);
    expect(isVideoMedia(undefined)).toBe(false);
    const bg = { mediaId: 'a', slides: ['b', 'c'], dim: 0.4, loop: false };
    expect(keepBackgroundMedia(bg, (id) => id !== 'a')).toEqual({ mediaId: 'b', slides: ['c'], dim: 0.4, loop: false });
    expect(keepBackgroundMedia(bg, () => false)).toBeUndefined();
    expect(lyricsImages(undefined)).toEqual([]);
  });
});

describe('Player-Protokoll', () => {
  it('Antwort der Suche prüfen', () => {
    expect(parseDiscoveryReply(JSON.stringify({ app: 'steckplan', v: 1, id: 'x', name: 'PC', port: 8080, mode: 'desktop', version: '1.0.0' }))).toEqual({ app: 'steckplan', v: 1, id: 'x', name: 'PC', port: 8080, mode: 'desktop', version: '1.0.0' });
    expect(parseDiscoveryReply('kein json')).toBeNull();
    expect(parseDiscoveryReply(JSON.stringify({ app: 'anderes', v: 1, id: 'x', port: 1 }))).toBeNull();
    expect(parseDiscoveryReply(JSON.stringify({ app: 'steckplan', v: 1, id: 'x', port: 70000 }))).toBeNull();
  });

  it('Stand des Players prüfen; Code; Größen', () => {
    expect(parsePlayerReport({ phase: 'ready', version: '1', projects: 2, mediaDone: 3.7, mediaTotal: -1, bytesDone: 'x', error: '' })).toEqual({ phase: 'ready', version: '1', projects: 2, mediaDone: 3, mediaTotal: 0, bytesDone: 0, bytesTotal: 0 });
    expect(parsePlayerReport({ phase: 'kaputt' })).toBeNull();
    let n = 0;
    expect(pairingCode(new Set(['1000']), () => [0, 0.5][n++ % 2]!)).toMatch(/^\d{4}$/);
    expect(() => pairingCode(new Set(['1000']), () => 0)).toThrow();
    expect(formatBytes(512 * 1024)).toBe('512 KB');
    expect(formatBytes(3.5 * 1024 * 1024)).toBe('3,5 MB');
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2,0 GB');
  });

  it('Katalog: nur Projekte mit Texten oder Hintergrund, nur Bilder/Videos des Textfensters', () => {
    const empty = createEmptyProject({ name: 'Leer' });
    expect(playerCatalogEntry(empty)).toBeNull();
    const project = { ...createEmptyProject({ name: 'Mit' }) };
    project.show = { items: [], sections: [{ id: 's', itemId: 'i', order: 0, kind: 'verse', label: '', lines: [{ id: 'l', text: 'a' }], backgroundMediaId: 'bild' } as never] };
    project.media = [ref('bild', 'image/png'), ref('audio', 'audio/wav')];
    expect(playerCatalogEntry(project)).toMatchObject({ name: 'Mit', lines: 1, media: [{ id: 'bild' }] });
  });
});
