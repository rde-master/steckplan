import { describe, expect, it } from 'vitest';
import type { MediaRef, ShowItem, TextSection } from '@steckplan/core';
import { backgroundPreloadIds } from './backgroundPreload';

const ref = (id: string, mime = 'image/jpeg') => ({ id, name: id, mime, sizeBytes: 1, sha256: '', addedAt: '', addedBy: '' }) as MediaRef;
const item = (id: string, order: number, extra: Partial<ShowItem> = {}) => ({ id, order, kind: 'song', title: id, personIds: [], ...extra }) as ShowItem;
const section = (id: string, itemId: string, order: number, backgroundMediaId?: string) => ({ id, itemId, order, kind: 'verse', label: id, lines: [], ...(backgroundMediaId ? { backgroundMediaId } : {}) }) as TextSection;

describe('Hintergrundbilder vorladen', () => {
  const media = ['a', 'b', 'c', 'd', 'std', 'own', 'next1', 'nextBg'].map((id) => ref(id)).concat(ref('film', 'video/mp4'));
  const items = [item('lied', 0, { lyricsBackground: { mediaId: 'own', slides: ['film'] } as never }), item('zwei', 1, { lyricsBackground: { mediaId: 'nextBg' } as never })];
  const sections = [section('s1', 'lied', 0, 'a'), section('s2', 'lied', 1), section('s3', 'lied', 2, 'b'), section('s4', 'lied', 3, 'c'), section('s5', 'lied', 4, 'd'), section('n1', 'zwei', 0, 'next1')];
  const settings = { lyricsBackground: { mediaId: 'std' } } as never;

  it('ab dem aktuellen Abschnitt drei Abschnittsbilder, dann der Hintergrund (ohne Videos), dann der nächste Eintrag', () => {
    expect(backgroundPreloadIds({ items, sections, settings, media, itemId: 'lied', sectionId: 's2' })).toEqual(['a', 'b', 'c', 'own', 'next1', 'nextBg']);
  });

  it('niemand führt: der Standard und der Anfang des ersten Eintrags; unbekannte Dateien nicht', () => {
    expect(backgroundPreloadIds({ items, sections, settings, media, itemId: undefined, sectionId: undefined })).toEqual(['std', 'a', 'own']);
    expect(backgroundPreloadIds({ items: [], sections: [], settings: { lyricsBackground: { mediaId: 'fehlt' } } as never, media, itemId: undefined, sectionId: undefined })).toEqual([]);
  });
});
