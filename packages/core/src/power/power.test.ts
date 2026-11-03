import { describe, expect, it } from 'vitest';
import type { Cable, DeviceInstance, PortDef, Template } from '../model/schema';
import { createEmptyLibrary } from '../library/library';
import { createEmptyProject } from '../model/project';
import { listCsv } from '../logistics/exports';
import { buildPowerReport, checkPower, devicePowerW, formatAmps, formatWatts, powerNotes } from './power';

const T0 = '2026-01-01T00:00:00.000Z';
const t = (x: Partial<Template> & Pick<Template, 'id' | 'kind' | 'name'>): Template => ({ version: 1, updatedAt: T0, ...x });
const pin = (fuseA?: number, phase?: PortDef['phase']): PortDef => ({ id: 'in', label: 'Netz', connector: 'Schuko', direction: 'in', signal: 'Strom', isPower: true, ...(fuseA ? { fuseA } : {}), ...(phase ? { phase } : {}) });
const pout = (id: string, phase: PortDef['phase'], fuseA = 16): PortDef => ({ id, label: id, connector: 'Schuko', direction: 'out', signal: 'Strom', isPower: true, fuseA, phase });

const templates = [
  // Hauptverteiler: CEE 32 A Drehstrom, Abgänge je Phase 16 A, ein CEE-16-Abgang (3P)
  t({ id: 'hv', kind: 'device', name: 'Verteiler 32A', ports: [{ ...pin(32, '3P'), connector: 'CEE 32' }, pout('A1', 'L1'), pout('A2', 'L2'), pout('A3', 'L3'), { ...pout('CEE', '3P'), connector: 'CEE 16' }] }),
  // Unterverteiler mit Drehstrom-Zuleitung (16 A) und Abgängen je Phase
  t({ id: 'uv', kind: 'device', name: 'Unterverteiler 16A', ports: [{ ...pin(16, '3P'), connector: 'CEE 16' }, pout('B1', 'L1', 10), pout('B2', 'L2', 10), pout('B3', 'L3', 10)] }),
  // Steckdosenleiste (einphasig, ohne Absicherung)
  t({ id: 'leiste', kind: 'device', name: 'Steckdosenleiste', ports: [pin(), { ...pout('S1', undefined), fuseA: undefined }, { ...pout('S2', undefined), fuseA: undefined }] }),
  t({ id: 'spot', kind: 'device', name: 'Spot', powerW: 575, ports: [pin()] }),
  t({ id: 'dimmer', kind: 'device', name: 'Dimmer 3P', powerW: 6900, ports: [{ ...pin(undefined, '3P'), connector: 'CEE 16' }] }),
];

const dev = (id: string, templateId: string, extra: Partial<DeviceInstance> = {}): DeviceInstance => ({ id, templateId, layerId: 'l', label: id, ...extra });
const pc = (id: string, from: [string, string], to: [string, string]): Cable => ({ id, templateId: 'strom', from: { deviceId: from[0], portId: from[1] }, to: { deviceId: to[0], portId: to[1] }, waypoints: [] });

describe('Strom: Last je Abgang und Phase', () => {
  const devices = [
    dev('HV', 'hv'),
    dev('UV', 'uv'),
    dev('Leiste', 'leiste'),
    dev('Spot 1', 'spot'),
    dev('Spot 2', 'spot'),
    dev('Spot 3', 'spot', { powerW: 1000 }),
    dev('Dimmer', 'dimmer'),
    dev('Spot lose', 'spot'),
  ];
  const cables = [
    pc('k1', ['HV', 'A1'], ['Leiste', 'in']),
    pc('k2', ['Leiste', 'S1'], ['Spot 1', 'in']),
    pc('k3', ['Spot 2', 'in'], ['Leiste', 'S2']), // falsch herum gezeichnet
    pc('k4', ['HV', 'CEE'], ['UV', 'in']),
    pc('k5', ['UV', 'B2'], ['Spot 3', 'in']),
    pc('k6', ['HV', 'A3'], ['Dimmer', 'in']),
  ];

  it('summiert über Steckdosenleisten und Unterverteiler, verteilt Drehstrom auf die Phasen', () => {
    const report = buildPowerReport({ devices, cables }, { templates });
    expect(report.distributors.map((d) => [d.device.id, d.depth])).toEqual([
      ['HV', 0],
      ['Leiste', 1],
      ['UV', 1],
    ]);
    const hv = report.distributors[0]!;
    // L1: 2 × 575 über die Leiste; L2: 1000 über UV; L3: Dimmer 6900 auf einer Phase (Abgang L3)
    expect(hv.load).toEqual({ L1: 1150, L2: 1000, L3: 6900 });
    expect(hv.outlets.find((o) => o.portId === 'A1')).toMatchObject({ phase: 'L1', currentA: 1150 / 230 });
    expect(hv.outlets.find((o) => o.portId === 'CEE')!.load).toEqual({ L1: 0, L2: 1000, L3: 0 });
    expect(report.distributors.find((d) => d.device.id === 'UV')!.fedFrom).toBe('HV · CEE');
    // Leiste hängt an L1: alle ihre Abgänge sind L1
    expect(report.distributors.find((d) => d.device.id === 'Leiste')!.outlets.map((o) => o.phase)).toEqual(['L1', 'L1']);
    expect(report.unconnected.map((u) => u.device.id)).toEqual(['Spot lose']);
    expect(devicePowerW(devices[5]!, templates[3])).toBe(1000);
  });

  it('Anzeige im Signalfluss: Summe je Verteiler/Leiste, Strom je Abgang, Leistung je Verbraucher', () => {
    const notes = powerNotes({ devices, cables }, { templates });
    // Leiste an L1: 2 × 575 W = 1150 W ≈ 5,0 A (ohne Absicherung)
    expect(notes.devices.get('Leiste')).toEqual({ text: '⚡ 5,0 A · 1,15 kW', level: 'ok' });
    expect(notes.outlets.get('Leiste/S1')).toEqual({ text: '2,5 A', level: 'ok' });
    // Abgang mit Absicherung: Auslastung; Dimmer 30 A an 16 A → Überlast
    expect(notes.outlets.get('HV/A3')).toEqual({ text: '30,0 A (188 %)', level: 'over' });
    expect(notes.outlets.has('HV/A2')).toBe(false); // nichts angeschlossen
    // Hauptverteiler (3P, 32 A): höchster Phasenstrom 30 A → 94 %
    expect(notes.devices.get('HV')).toEqual({ text: '⚡ 30,0 A · 9,05 kW · 94 %', level: 'high' });
    // Verbraucher: eigene Leistung (auch ohne Stromkabel)
    expect(notes.devices.get('Spot 3')).toEqual({ text: '⚡ 1 kW', level: 'ok' });
    expect(notes.devices.get('Spot lose')).toEqual({ text: '⚡ 575 W', level: 'ok' });
  });

  it('Überlast, hohe Auslastung, Schieflast und nicht angeschlossene Geräte', () => {
    const issues = checkPower({ devices, cables }, { templates });
    const messages = issues.map((i) => `${i.severity}: ${i.message}`);
    // Dimmer 6900 W an einem 16-A-Abgang: 30 A → Überlast
    expect(messages).toContain('error: HV · A3: Überlast – 30,0 A bei 16 A Absicherung.');
    // Schieflast am Hauptverteiler: L3 30 A gegenüber L2 4,3 A
    expect(messages.some((m) => m.startsWith('warning: HV: Schieflast'))).toBe(true);
    expect(messages).toContain('info: 1 Gerät hat Leistung, aber keinen Stromanschluss (Spot lose).');
    // 3P-Dimmer an CEE: gleichmäßig verteilt, keine Schieflast
    const balanced = checkPower({ devices: [dev('HV', 'hv'), dev('Dimmer', 'dimmer')], cables: [pc('x', ['HV', 'CEE'], ['Dimmer', 'in'])] }, { templates });
    expect(balanced).toEqual([]);
    // 80 %: 3 Spots à 1000 W = 13 A an 16 A
    const high = checkPower(
      { devices: [dev('HV', 'hv'), dev('L', 'leiste'), dev('a', 'spot', { powerW: 1500 }), dev('b', 'spot', { powerW: 1500 })], cables: [pc('1', ['HV', 'A2'], ['L', 'in']), pc('2', ['L', 'S1'], ['a', 'in']), pc('3', ['L', 'S2'], ['b', 'in'])] },
      { templates },
    );
    expect(high.map((i) => i.message)).toContain('HV · A2: 82 % ausgelastet (13,0 A von 16 A).');
  });

  it('CSV-Stromliste', () => {
    const base = createEmptyProject({ name: 'P' });
    const csv = listCsv('power', { ...base, devices, cables }, { ...createEmptyLibrary('l'), templates });
    expect(csv).toContain('HV;Einspeisung;Zuleitung;3P;32;;9050;30,0 A;94 %');
    expect(csv).toContain('HV;;A1;L1;16;Leiste;1150;5,0 A;31 %');
    expect(csv).toContain('(ohne Stromanschluss);;;;;Spot lose;575;;');
  });

  it('Kreise führen nicht in eine Endlosschleife; Formatierung', () => {
    const loop = { devices: [dev('L1x', 'leiste'), dev('L2x', 'leiste')], cables: [pc('a', ['L1x', 'S1'], ['L2x', 'in']), pc('b', ['L2x', 'S1'], ['L1x', 'in'])] };
    expect(() => buildPowerReport(loop, { templates })).not.toThrow();
    expect(formatAmps(13.04)).toBe('13,0 A');
    expect(formatWatts(575)).toBe('575 W');
    expect(formatWatts(6900)).toBe('6,9 kW');
  });
});
