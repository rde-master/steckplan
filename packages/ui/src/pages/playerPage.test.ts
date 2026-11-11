import { describe, expect, it } from 'vitest';
import { shouldReloadForVersion } from './PlayerPage';

describe('Player: nach einem Update der Steuersoftware neu laden', () => {
  it('lädt neu, wenn der Server eine andere Version meldet', () => {
    expect(shouldReloadForVersion('0.48.0', '0.47.0', false, 0, 1_000_000)).toBe(true);
  });

  it('nicht bei gleicher Version oder ohne Angabe (älterer Server)', () => {
    expect(shouldReloadForVersion('0.47.0', '0.47.0', false, 0, 1_000_000)).toBe(false);
    expect(shouldReloadForVersion(undefined, '0.47.0', false, 0, 1_000_000)).toBe(false);
  });

  it('nicht, solange das Textfenster gezeigt wird (mitten in der Vorstellung)', () => {
    expect(shouldReloadForVersion('0.48.0', '0.47.0', true, 0, 1_000_000)).toBe(false);
  });

  it('höchstens einmal je Minute (keine Schleife, falls die neue Oberfläche nicht ankommt)', () => {
    expect(shouldReloadForVersion('0.48.0', '0.47.0', false, 1_000_000 - 20_000, 1_000_000)).toBe(false);
    expect(shouldReloadForVersion('0.48.0', '0.47.0', false, 1_000_000 - 61_000, 1_000_000)).toBe(true);
  });
});
