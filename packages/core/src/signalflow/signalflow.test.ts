import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createEmptyLibrary, type Library } from '../library/library';
import { createEmptyProject } from '../model/project';
import type { Template } from '../model/schema';
import { createYDocFromProject } from '../model/ydoc';
import { autoCableType, connectorMatch, orientConnection, rankCableTypes } from './cables';
import { cableIssueMap, checkSignalFlow } from './checks';
import { addCable, addDevice, duplicateDevices, nextLabel, readCables, readDevices, removeDevices, updateDevices } from './doc-ops';
import { boxLayout, contrastText, routeCable } from './layout';
import { canFlow, findPort, isPlaceableInSignalFlow, templatePorts } from './ports';

const T0 = '2026-01-01T00:00:00.000Z';
const mic: Template = { id: 'mic', kind: 'device', version: 1, updatedAt: T0, name: 'SM58', ports: [{ id: 'out', label: 'Out', connector: 'XLR 3', direction: 'out', signal: 'Audio' }] };
const desk: Template = {
  id: 'desk',
  kind: 'device',
  version: 1,
  updatedAt: T0,
  name: 'Pult',
  ports: [
    { id: 'in1', label: 'In 1', connector: 'XLR 3', direction: 'in', signal: 'Audio' },
    { id: 'in2', label: 'In 2', connector: 'XLR 3', direction: 'in', signal: 'Audio' },
    { id: 'net', label: 'Netz', connector: 'RJ45', direction: 'bi', signal: 'Ethernet' },
  ],
};
const snake: Template = {
  id: 'snake',
  kind: 'cableType',
  version: 1,
  updatedAt: T0,
  name: 'Multicore 1/1',
  endALabel: 'Bühne',
  endBLabel: 'FOH',
  channels: [
    { id: 's1', label: 'Send 1', connectorA: 'XLR 3', connectorB: 'XLR 3', direction: 'aToB', signal: 'Audio' },
    { id: 'r1', label: 'Return 1', connectorA: 'XLR 3', connectorB: 'XLR 3', direction: 'bToA', signal: 'Audio' },
  ],
};
const xlr: Template = { id: 'xlr', kind: 'cableType', version: 1, updatedAt: T0, name: 'XLR', connectorA: 'XLR 3', connectorB: 'xlr  3', signal: 'Audio' };
const xlr2: Template = { ...xlr, id: 'xlr2', name: 'XLR lang' };
const speakon: Template = { id: 'spk', kind: 'cableType', version: 1, updatedAt: T0, name: 'Speakon', connectorA: 'Speakon', connectorB: 'Speakon', signal: 'Lautsprecher' };

function lib(templates: Template[]): Library {
  return { ...createEmptyLibrary('l'), templates };
}

describe('Anschlüsse', () => {
  it('Geräte: Eingänge links, Ausgänge und Ein-/Ausgänge rechts', () => {
    const ports = templatePorts(desk);
    expect(ports.map((p) => `${p.id}:${p.side}:${p.role}`)).toEqual(['in1:left:in', 'in2:left:in', 'net:right:bi']);
  });

  it('Multicore: je Ader Ende A links und Ende B rechts, Rollen nach Richtung', () => {
    const ports = templatePorts(snake);
    expect(ports.map((p) => `${p.id}:${p.side}:${p.role}`)).toEqual(['s1:a:left:in', 's1:b:right:out', 'r1:a:left:out', 'r1:b:right:in']);
    expect(findPort(snake, 's1:a')!.label).toBe('Send 1 (Bühne)');
    expect(isPlaceableInSignalFlow(snake)).toBe(true);
    expect(isPlaceableInSignalFlow(xlr)).toBe(false);
  });

  it('Signal fließt nur von Ausgang zu Eingang', () => {
    expect(canFlow('out', 'in')).toBe(true);
    expect(canFlow('bi', 'bi')).toBe(true);
    expect(canFlow('in', 'out')).toBe(false);
    expect(canFlow('out', 'out')).toBe(false);
  });
});

describe('Verbindungen', () => {
  const out = findPort(mic, 'out')!;
  const in1 = findPort(desk, 'in1')!;

  it('richtet angeklickte Anschlüsse aus', () => {
    expect(orientConnection({ port: in1 }, { port: out })).toEqual({ from: { port: out }, to: { port: in1 } });
    expect(orientConnection({ port: in1 }, { port: in1 })).toBeNull();
  });

  it('vergleicht Stecker ohne Groß-/Kleinschreibung und Leerzeichen', () => {
    expect(connectorMatch(xlr, out, in1)).toBe('match');
    expect(connectorMatch(speakon, out, in1)).toBe('mismatch');
    expect(connectorMatch({ ...xlr, connectorA: undefined }, out, in1)).toBe('unknown');
  });

  it('wählt den Kabeltyp automatisch nur bei genau einem Treffer', () => {
    expect(autoCableType(lib([xlr, speakon, snake]), out, in1)?.id).toBe('xlr');
    expect(autoCableType(lib([xlr, xlr2]), out, in1)).toBeUndefined();
    expect(rankCableTypes(lib([speakon, xlr2, xlr, snake]), out, in1).map((r) => r.template.id)).toEqual(['xlr', 'xlr2', 'spk']);
  });
});

describe('Kasten-Layout und Kabelführung', () => {
  it('berechnet Größe und Anschluss-Positionen', () => {
    const layout = boxLayout('Pult', templatePorts(desk));
    expect(layout.width).toBeGreaterThanOrEqual(160);
    expect(layout.height).toBe(30 + 2 * 20 + 8);
    expect(layout.anchors.find((a) => a.port.id === 'net')).toMatchObject({ x: layout.width, y: 40 });
    expect(layout.anchors.find((a) => a.port.id === 'in2')).toMatchObject({ x: 0, y: 60 });
  });

  it('führt Kabel rechtwinklig', () => {
    expect(routeCable({ x: 0, y: 0 }, 'right', { x: 100, y: 50 }, 'left')).toEqual([0, 0, 50, 0, 50, 50, 100, 50]);
    const back = routeCable({ x: 100, y: 0 }, 'right', { x: 0, y: 40 }, 'left');
    expect(back.length).toBeGreaterThan(8);
    for (let i = 2; i < back.length; i += 2) expect(back[i] === back[i - 2] || back[i + 1] === back[i - 1]).toBe(true);
  });

  it('wählt lesbare Textfarbe', () => {
    expect(contrastText('#ffffff')).toBe('#0f172a');
    expect(contrastText('#1e293b')).toBe('#ffffff');
  });
});

describe('Live-Dokument', () => {
  function setup() {
    return createYDocFromProject(createEmptyProject({ name: 'P' }));
  }

  it('vergibt fortlaufende Kennungen', () => {
    expect(nextLabel('SM58', [{ label: 'SM58 1' }, { label: 'SM58 3' }, { label: 'Pult 9' }])).toBe('SM58 4');
    expect(nextLabel('Spot (A)', [{ label: 'Spot (A) 1' }])).toBe('Spot (A) 2');
  });

  it('legt an, verschiebt, dupliziert und löscht samt Kabeln', () => {
    const doc = setup();
    const a = addDevice(doc, { ...mic, defaultOwnerId: 'ralf' }, { x: 10.4, y: 20 }, 'test');
    const b = addDevice(doc, desk, { x: 300, y: 20 }, 'test');
    expect(a).toMatchObject({ label: 'SM58 1', ownerId: 'ralf', signalFlow: { position: { x: 10, y: 20 } } });
    addCable(doc, { templateId: 'xlr', from: { deviceId: a.id, portId: 'out' }, to: { deviceId: b.id, portId: 'in1' } }, 'test');
    updateDevices(doc, [{ id: a.id, patch: { signalFlow: { position: { x: 50, y: 60 } }, colorOverride: '#ff0000' } }], 'test');
    expect(readDevices(doc).find((d) => d.id === a.id)).toMatchObject({ colorOverride: '#ff0000', signalFlow: { position: { x: 50, y: 60 } } });

    const copies = duplicateDevices(doc, [a.id, b.id], { x: 20, y: 20 }, 'test');
    expect(copies).toHaveLength(2);
    expect(readDevices(doc).map((d) => d.label).sort()).toEqual(['Pult 1', 'Pult 2', 'SM58 1', 'SM58 2']);
    expect(readCables(doc)).toHaveLength(2);

    removeDevices(doc, [a.id], 'test');
    expect(readDevices(doc)).toHaveLength(3);
    expect(readCables(doc)).toHaveLength(1);
  });

  it('ein Rückgängig-Schritt pro Aktion', () => {
    const doc = setup();
    const undo = new Y.UndoManager([doc.getMap('devices'), doc.getMap('cables')], { trackedOrigins: new Set(['me']) });
    const a = addDevice(doc, mic, { x: 0, y: 0 }, 'me');
    addDevice(doc, desk, { x: 0, y: 0 }, 'andere'); // fremde Änderung wird nicht rückgängig gemacht
    undo.stopCapturing();
    removeDevices(doc, [a.id], 'me');
    undo.undo();
    expect(readDevices(doc).map((d) => d.label).sort()).toEqual(['Pult 1', 'SM58 1']);
    undo.undo();
    expect(readDevices(doc).map((d) => d.label)).toEqual(['Pult 1']);
  });
});

describe('Prüfungen', () => {
  const base = createEmptyProject({ name: 'P' });
  const layer = base.layers[0]!.id;
  const devices = [
    { id: 'm', templateId: 'mic', layerId: layer, label: 'SM58 1' },
    { id: 'd', templateId: 'desk', layerId: layer, label: 'Pult 1' },
    { id: 's', templateId: 'snake', layerId: layer, label: 'Multicore 1' },
  ];
  const library = lib([mic, desk, snake, xlr, speakon]);

  it('meldet falsche Richtung, unpassende Stecker, Mehrfachbelegung und verwaiste Kabel', () => {
    const issues = checkSignalFlow(
      {
        devices,
        cables: [
          { id: 'ok', templateId: 'xlr', from: { deviceId: 'm', portId: 'out' }, to: { deviceId: 's', portId: 's1:a' }, waypoints: [] },
          { id: 'direct', direct: true, from: { deviceId: 's', portId: 's1:b' }, to: { deviceId: 'd', portId: 'in1' }, waypoints: [] },
          { id: 'spk', templateId: 'spk', from: { deviceId: 'm', portId: 'out' }, to: { deviceId: 'd', portId: 'in2' }, waypoints: [] },
          { id: 'dir', templateId: 'xlr', from: { deviceId: 'd', portId: 'in2' }, to: { deviceId: 'm', portId: 'out' }, waypoints: [] },
          { id: 'gone', templateId: 'xlr', from: { deviceId: 'm', portId: 'weg' }, to: { deviceId: 'd', portId: 'in1' }, waypoints: [] },
          { id: 'nodev', templateId: 'xlr', from: { deviceId: 'x', portId: 'out' }, to: { deviceId: 'd', portId: 'in1' }, waypoints: [] },
        ],
      },
      library,
    );
    const ids = issues.map((i) => i.id);
    expect(ids).toContain('connector:spk');
    expect(ids).toContain('direction:dir');
    expect(ids).toContain('orphan-port:gone');
    expect(ids).toContain('orphan-device:nodev');
    expect(ids.some((id) => id.startsWith('occupied:m/out'))).toBe(true);
    expect(ids.some((id) => id.includes(':ok') || id.includes(':direct'))).toBe(false);
    const map = cableIssueMap(issues);
    expect(map.get('spk')).toBe('warning');
    expect(map.get('dir')).toBe('error');
  });
});
