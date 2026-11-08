import { describe, expect, it } from 'vitest';
import type { StageDrawing } from '../../pdf/svg';
import { stageBounds } from '../../pdf/svg';
import { tightStageView } from './LightSetupView';
import { formatSceneTime, parseSceneTime } from './ScenesSection';
import { applyDrag, dragBounds } from './SceneTimeline';
import { computePeaks } from './Waveform';
import type { StageItem } from '../stageplan/model';

const item = (x: number, y: number, widthMm: number, depthMm: number, rotation = 0): StageItem =>
  ({ device: { id: `${x}`, templateId: 't', layerId: 'l', label: 'x' }, template: undefined, x, y, rotation, footprint: { form: 'rect', widthMm, depthMm }, fill: '#fff', height: { mm: 0 }, kind: 'truss', locked: false, dimmed: false, layerOrder: 0 }) as unknown as StageItem;

describe('Lichtaufbau: Ausschnitt der Draufsicht', () => {
  it('rechnet mit der gedrehten Grundfläche statt einem Kreis um die längste Seite', () => {
    const drawing: StageDrawing = { items: [item(3000, 1000, 6000, 290), item(3000, 4000, 6000, 290)], shapes: [], cables: [], multicores: [], showCables: false };
    const tight = tightStageView(drawing, [])!;
    const loose = stageBounds(drawing, false)!;
    expect(tight.width).toBeCloseTo(6000 + 600, 0);
    expect(tight.height).toBeLessThan(loose.height / 2);
    // um 90° gedreht: hoch statt breit
    const turned = tightStageView({ ...drawing, items: [item(0, 0, 6000, 290, 90)] }, [])!;
    expect(turned.height).toBeGreaterThan(6000);
    expect(turned.width).toBeLessThan(1500);
    // Ziel-Punkte gehören dazu
    expect(tightStageView({ ...drawing, items: [] }, [{ id: 'z', order: 0, name: 'Z', stagePoint: { x: 100, y: 100 } }])).not.toBeNull();
    expect(tightStageView({ ...drawing, items: [] }, [])).toBeNull();
  });
});

describe('Lichtszenen: Zeitpunkt', () => {
  it('liest „m:ss“, „m:ss.s“ und Sekunden; zeigt m:ss.s', () => {
    expect(parseSceneTime('1:12')).toBe(72);
    expect(parseSceneTime('1:12,5')).toBe(72.5);
    expect(parseSceneTime('75')).toBe(75);
    expect(parseSceneTime('1:75')).toBeUndefined();
    expect(parseSceneTime('')).toBeUndefined();
    expect(formatSceneTime(72)).toBe('1:12');
    expect(formatSceneTime(72.5)).toBe('1:12.5');
    expect(formatSceneTime(5)).toBe('0:05');
  });
});

describe('Szenen-Zeitleiste: Ziehen', () => {
  const times = [0, 5, 10];
  it('ganzer Block: die folgende Szene wandert mit, Grenzen sind die Nachbarn', () => {
    expect(dragBounds(times, 1, 'body', 20)).toEqual({ min: -4.9, max: 9.9 });
    expect([...applyDrag(times, 1, 'body', 2)]).toEqual([
      [1, 7],
      [2, 12],
    ]);
    // letzte Szene: nur ihr Beginn, höchstens bis kurz vor das Ende
    expect(dragBounds(times, 2, 'body', 20)).toEqual({ min: -4.9, max: 9.9 });
    expect([...applyDrag(times, 2, 'body', 1)]).toEqual([[2, 11]]);
  });
  it('Rand: nur die Grenze zur vorigen Szene', () => {
    const b = dragBounds(times, 2, 'edge', 20);
    expect(b.min).toBeCloseTo(-4.9);
    expect(b.max).toBeCloseTo(9.9);
    expect(dragBounds(times, 1, 'edge', 20).max).toBeCloseTo(4.9);
    expect([...applyDrag(times, 1, 'edge', -1.25)]).toEqual([[1, 3.8]]);
    // erste Szene: nicht vor 0
    expect(dragBounds(times, 0, 'edge', 20).min).toBe(0);
  });
  it('ohne Platz: keine Verschiebung', () => {
    expect(dragBounds([3, 3, 3], 1, 'edge', 20)).toEqual({ min: 0, max: 0 });
  });
});

describe('Wellenform: Spitzenwerte', () => {
  it('Betrag der größten Abtastung je Abschnitt über alle Kanäle', () => {
    const left = new Float32Array([0.1, -0.5, 0.2, 0.05, 0, 0]);
    const right = new Float32Array([0, 0, 0, -0.9, 0, 0.3]);
    const peaks = computePeaks([left, right], 6, 3);
    expect(peaks.rate).toBe(3);
    expect(Array.from(peaks.data).map((v) => Math.round(v * 100) / 100)).toEqual([0.5, 0.9, 0.3]);
  });
});
