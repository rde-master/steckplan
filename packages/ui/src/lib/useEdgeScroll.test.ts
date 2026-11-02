import { describe, expect, it } from 'vitest';
import { edgeDelta, EDGE_PX, MAX_SPEED_PX } from './useEdgeScroll';

describe('Automatisches Scrollen am Rand', () => {
  it('nur im Randbereich, schneller je näher am (oder hinter dem) Rand', () => {
    expect(edgeDelta(400, 800)).toBe(0);
    expect(edgeDelta(EDGE_PX, 800)).toBe(0);
    expect(edgeDelta(EDGE_PX / 2, 800)).toBe(Math.round(MAX_SPEED_PX / 2));
    expect(edgeDelta(0, 800)).toBe(MAX_SPEED_PX);
    expect(edgeDelta(-50, 800)).toBe(MAX_SPEED_PX); // außerhalb: volle Geschwindigkeit
    expect(edgeDelta(800 - EDGE_PX / 2, 800)).toBe(-Math.round(MAX_SPEED_PX / 2));
    expect(edgeDelta(900, 800)).toBe(-MAX_SPEED_PX);
  });
});
