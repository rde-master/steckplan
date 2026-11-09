import { describe, expect, it } from 'vitest';
import { dropAddress } from './DmxUniverseView';

describe('DMX-Patch: Ablegen per Ziehen', () => {
  it('gegriffener Kanal bleibt an der Stelle, Gerät passt immer ins Universum', () => {
    expect(dropAddress(33, { offset: 0, channels: 4 })).toBe(33);
    expect(dropAddress(40, { offset: 3, channels: 8 })).toBe(37);
    expect(dropAddress(2, { offset: 5, channels: 8 })).toBe(1);
    expect(dropAddress(512, { offset: 0, channels: 16 })).toBe(497);
    expect(dropAddress(100, { offset: 0, channels: 600 })).toBe(1);
  });
});
