import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId, uuidFromRandom } from './project';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newId', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('UUID v4 aus Zufallsbytes', () => {
    expect(uuidFromRandom(new Uint8Array(16).fill(0xff))).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    expect(uuidFromRandom(new Uint8Array(16))).toMatch(UUID);
  });

  it('ohne crypto.randomUUID (Browser über http://<LAN-Adresse>): eindeutige UUIDs aus getRandomValues', () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => real.getRandomValues(a) });
    expect(typeof globalThis.crypto.randomUUID).toBe('undefined');
    const ids = Array.from({ length: 1000 }, () => newId());
    for (const id of ids) expect(id).toMatch(UUID);
    expect(new Set(ids).size).toBe(1000);
  });
});
