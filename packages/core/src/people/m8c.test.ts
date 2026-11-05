import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createEmptyProject } from '../model/project';
import type { Cable, DeviceInstance, Person, Project, Template } from '../model/schema';
import { createYDocFromProject, readProjectFromYDoc } from '../model/ydoc';
import { checkStock, stockUsage } from '../logistics/checks';
import { listCsv } from '../logistics/exports';
import { buildCaseLists, buildPackingList, caseTrailerId, packItems } from '../logistics/lists';
import { assignGroup, boundsOf, createGroup, readGroups, removeGroup } from '../signalflow/groups';
import { standLayout, tBarLength } from '../stageplan/docking';
import { buildProjectUsageLibrary } from './test-helpers';
import { addPerson, buildDeviceLabels, buildPeopleList, checkPeople, devicePerson, peopleWithoutDevice, personKinds, personName, readPeople, removePerson, usesPerson } from './people';

const T0 = '2026-01-01T00:00:00.000Z';
const t = (x: Partial<Template> & Pick<Template, 'id' | 'kind' | 'name'>): Template => ({ version: 1, updatedAt: T0, ...x });
const mic = t({ id: 'mic', kind: 'device', name: 'Funkmikro', usedByPerson: true, stock: 2, shape: { form: 'rect', widthMm: 200, depthMm: 200 }, ports: [{ id: 'out', label: 'Out', connector: 'XLR 3', direction: 'out', signal: 'Audio' }] });
const box = t({ id: 'box', kind: 'device', name: 'Stagebox', ports: [{ id: 'in5', label: 'Kanal 5', connector: 'XLR 3', direction: 'in', signal: 'Audio' }, { id: 'in6', label: 'Kanal 6', connector: 'XLR 3', direction: 'in', signal: 'Audio' }] });
const xlr = t({ id: 'xlr', kind: 'cableType', name: 'XLR', availableLengthsMm: [5000, 10000], stockByLength: [{ lengthMm: 5000, count: 1 }] });
const stand = t({ id: 'stand', kind: 'stand', name: 'Stativ', tBarLengthMm: 1200, shape: { form: 'circle', widthMm: 600, depthMm: 600, heightMm: 2500 } });
const templates = [mic, box, xlr, stand];
const library = buildProjectUsageLibrary(templates, {
  trailers: [{ id: 'a1', name: 'Anhänger 1' }, { id: 'a2', name: 'Anhänger 2' }],
  cases: [{ id: 'k1', name: 'Kabelcase 1', defaultTrailerId: 'a1' }],
});

const anna: Person = { id: 'anna', lastName: 'Muster', firstName: 'Anna', kind: 'Sängerin' };
const dev = (id: string, templateId: string, extra: Partial<DeviceInstance> = {}): DeviceInstance => ({ id, templateId, layerId: 'l', label: id, ...extra });
const cable = (id: string, from: string, to: string, toPort: string, extra: Partial<Cable> = {}): Cable => ({
  id,
  templateId: 'xlr',
  from: { deviceId: from, portId: 'out' },
  to: { deviceId: to, portId: toPort },
  waypoints: [],
  manualLengthMm: 5000,
  ...extra,
});

function project(extra: Partial<Project> = {}): Project {
  const base = createEmptyProject({ name: 'M8c' });
  return {
    ...base,
    settings: { ...base.settings, defaultReservePercent: 0, defaultReservePerEndMm: 0 },
    people: [anna],
    devices: [dev('Mikro 1', 'mic', { personId: 'anna' }), dev('Mikro 2', 'mic'), dev('Mikro 3', 'mic', { usedByPerson: false }), dev('Box', 'box')],
    cables: [cable('k1', 'Mikro 1', 'Box', 'in5', { label: 'A5' }), cable('k2', 'Mikro 2', 'Box', 'in6', { caseId: 'k1' })],
    ...extra,
  };
}

describe('Personen und „benutzt von Mensch“', () => {
  it('Vorgabe der Vorlage, je Gerät überschreibbar; Name „Vorname Name“', () => {
    expect(usesPerson({}, mic)).toBe(true);
    expect(usesPerson({ usedByPerson: false }, mic)).toBe(false);
    expect(usesPerson({ usedByPerson: true }, box)).toBe(true);
    expect(personName(anna)).toBe('Anna Muster');
    expect(personName({ firstName: '', lastName: 'Muster' })).toBe('Muster');
    const p = project();
    expect(devicePerson(p.devices[0]!, mic, p.people)?.id).toBe('anna');
    expect(devicePerson({ ...p.devices[0]!, usedByPerson: false }, mic, p.people)).toBeUndefined();
    expect(personKinds([anna, { ...anna, id: 'b', kind: 'Sängerin' }])).toContain('Sängerin');
  });

  it('Personenliste mit Verbindungen; nicht zugeordnete Geräte am Ende; Etiketten', () => {
    const list = buildPeopleList(project(), library);
    expect(list.map((e) => e.person?.id ?? '-')).toEqual(['anna', '-']);
    expect(list[0]!.devices[0]!.connections).toEqual([{ port: 'Out', target: 'Box · Kanal 5', cable: 'XLR 5 m', cableLabel: 'A5', signal: 'audio', role: 'out' }]);
    expect(list[1]!.devices.map((d) => d.device.id)).toEqual(['Mikro 2']);
    const labels = buildDeviceLabels(project(), library);
    expect(labels[0]).toMatchObject({ title: 'Mikro 1', person: 'Anna Muster', personKind: 'Sängerin', lines: ['Out → Box · Kanal 5 (XLR 5 m, A5)'] });
    expect(buildDeviceLabels(project(), library, ['Mikro 2']).map((l) => l.title)).toEqual(['Mikro 2']);
    expect(listCsv('people', project(), library)).toContain('Muster;Anna;Sängerin;Mikro 1;Funkmikro;Out;Box · Kanal 5;XLR 5 m');
  });

  it('Personen ohne Gerät: Übersicht, Hinweis, CSV', () => {
    const bert = { id: 'bert', lastName: 'Beispiel', firstName: 'Bert', kind: 'Redner' };
    const p = project({ people: [anna, bert] });
    expect(peopleWithoutDevice(p, library).map((x) => x.id)).toEqual(['bert']);
    // Zuordnung zählt nur, wenn „benutzt von Mensch“ aktiv ist
    const off = project({ people: [anna, bert], devices: project().devices.map((d) => (d.id === 'Mikro 1' ? { ...d, usedByPerson: false } : d)) });
    expect(peopleWithoutDevice(off, library).map((x) => x.id)).toEqual(['bert', 'anna']);
    expect(checkPeople(p, library)).toEqual([{ id: 'people-without-device', severity: 'info', message: '1 Person hat kein Gerät (Bert Beispiel).', objectIds: [] }]);
    expect(checkPeople(project(), library)).toEqual([]);
    expect(listCsv('people', p, library)).toContain('Beispiel;Bert;Redner;(kein Gerät);;;;');
  });

  it('Person anlegen/löschen im Live-Dokument; Geräte verlieren die Zuordnung', () => {
    const doc = createYDocFromProject(project({ people: [] }));
    const created = addPerson(doc, { lastName: ' Beispiel ', firstName: 'Bert', kind: 'Redner' }, null);
    expect(readPeople(doc).map((p) => p.lastName)).toEqual(['Beispiel']);
    (doc.getMap('devices').get('Mikro 2') as Y.Map<unknown>).set('personId', created.id);
    removePerson(doc, created.id, null);
    expect(readPeople(doc)).toEqual([]);
    expect((doc.getMap('devices').get('Mikro 2') as Y.Map<unknown>).get('personId')).toBeUndefined();
    const read = readProjectFromYDoc(doc);
    expect(read.ok).toBe(true);
  });
});

describe('Gruppen', () => {
  it('anlegen, umhängen, leere Gruppen verschwinden, auflösen', () => {
    const doc = createYDocFromProject(project());
    const g1 = createGroup(doc, ['Mikro 1', 'Mikro 2'], null);
    expect(g1.name).toBe('Gruppe 1');
    const g2 = createGroup(doc, ['Mikro 1', 'Mikro 2'], null, 'Gesang');
    expect(readGroups(doc).map((g) => g.name)).toEqual(['Gesang']);
    assignGroup(doc, ['Box'], g2.id, null);
    removeGroup(doc, g2.id, null);
    expect(readGroups(doc)).toEqual([]);
    expect(readProjectFromYDoc(doc).ok && readProjectFromYDoc(doc)).toMatchObject({ project: { groups: [] } });
  });

  it('Rahmen umschließt alle Mitglieder mit Rand', () => {
    expect(boundsOf([{ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 5, width: 10, height: 20 }], 5)).toEqual({ x: -5, y: -5, width: 40, height: 35 });
    expect(boundsOf([])).toBeNull();
  });
});

describe('Stativ mit T-Bar', () => {
  const s = dev('S', 'stand', { stagePlan: { position: { x: 1000, y: 1000 }, rotationDeg: 0 } });
  const on = (id: string, x: number) => dev(id, 'mic', { mountedOnId: 'S', stagePlan: { position: { x, y: 1000 }, rotationDeg: 0 } });
  const map = new Map(templates.map((x) => [x.id, x]));

  it('Geräte liegen nebeneinander, gleichmäßig auf der T-Bar verteilt, Reihenfolge bleibt', () => {
    const placements = standLayout(s, [s, on('b', 1000), on('a', 900), on('c', 1000)], map);
    // 1200 mm T-Bar, 3 × 200 mm Geräte → Abstand 200 mm, Mitten bei −400, 0, +400
    expect(placements.map((p) => [p.id, p.position.x])).toEqual([
      ['a', 600],
      ['b', 1000],
      ['c', 1400],
    ]);
    expect(new Set(placements.map((p) => p.position.x)).size).toBe(3);
  });

  it('gedrehtes Stativ: entlang seiner Achse; zu kurze T-Bar → dicht nebeneinander', () => {
    const turned = { ...s, tBarLengthMm: 0, stagePlan: { position: { x: 0, y: 0 }, rotationDeg: 90 } };
    expect(tBarLength(turned, stand)).toBe(0);
    const placements = standLayout(turned, [turned, on('a', 0), on('b', 0)], map);
    expect(placements.map((p) => p.position)).toEqual([
      { x: 0, y: -125 },
      { x: 0, y: 125 },
    ]);
    expect(placements.every((p) => p.rotationDeg === 90)).toBe(true);
  });
});

describe('Cases und Packliste', () => {
  it('Inhalt eines Cases kommt in dessen Anhänger (Projekt-Zuordnung vor Standard)', () => {
    expect(caseTrailerId('k1', [], library.masterData.cases)).toBe('a1');
    expect(caseTrailerId('k1', [{ id: 'k1', trailerId: 'a2' }], library.masterData.cases)).toBe('a2');
    const items = packItems(project({ caseTrailers: [{ id: 'k1', trailerId: 'a2' }] }), library);
    expect(items.find((i) => i.id === 'k2')).toMatchObject({ caseId: 'k1', trailerId: 'a2' });
    expect(items.find((i) => i.id === 'Mikro 1')).toMatchObject({ person: 'Anna Muster' });
    const list = buildPackingList(items, library, { groupBy: ['trailer', 'case'], mode: 'aggregated' });
    expect(list.groups.map((g) => g.label)).toEqual(['Anhänger 2', 'ohne Anhänger']);
    expect(list.groups[0]!.groups.map((g) => g.label)).toEqual(['Kabelcase 1']);
  });
});

describe('Lagerbestand', () => {
  it('Warnung, wenn ein Projekt mehr verwendet als im Lager steht (Kabel je Länge)', () => {
    const p = project({ devices: [...project().devices, dev('Mikro 4', 'mic')] });
    const usage = stockUsage(p, library);
    expect(usage.find((u) => u.templateId === 'mic')).toMatchObject({ used: 4, stock: 2 });
    expect(usage.find((u) => u.templateId === 'xlr')).toMatchObject({ lengthMm: 5000, used: 2, stock: 1 });
    expect(checkStock(p, library).map((i) => i.message)).toEqual(['Funkmikro: 4 verwendet, aber nur 2 im Lager.', 'XLR 5 m: 2 verwendet, aber nur 1 im Lager.']);
    // ohne Bestandsangabe keine Warnung
    expect(stockUsage(p, library).some((u) => u.templateId === 'box')).toBe(false);
  });
});

describe('Case-Listen und Sortieren nach Case', () => {
  it('je Case der Inhalt mit Anhänger; Packliste nach Case sortierbar', () => {
    const p = project({
      caseTrailers: [{ id: 'k1', trailerId: 'a2' }],
      cables: [...project().cables, cable('k3', 'Mikro 3', 'Box', 'in6', { caseId: 'k1' })],
      devices: project().devices.map((d) => (d.id === 'Mikro 1' ? { ...d, caseId: 'k1', check: { out: { at: T0, by: 'A', status: 'ok' as const } } } : d)),
    });
    const items = packItems(p, library);
    const lists = buildCaseLists(items, library, { mode: 'aggregated', caseTrailers: p.caseTrailers });
    expect(lists).toHaveLength(1);
    expect(lists[0]).toMatchObject({ name: 'Kabelcase 1', trailerId: 'a2', total: 3, checkedOut: 1 });
    expect(lists[0]!.rows.map((r) => `${r.items.length}× ${r.name}`)).toEqual(['1× Funkmikro', '2× XLR']);
    expect(listCsv('cases', p, library)).toContain('Kabelcase 1;Anhänger 2;2;XLR;5 m');

    const sorted = buildPackingList(items, library, { groupBy: [], mode: 'aggregated', sortBy: 'case' });
    const names = sorted.groups[0]!.rows.map((r) => `${r.items[0]!.caseId ?? '-'}:${r.name}`);
    expect(names.slice(0, 2)).toEqual(['k1:Funkmikro', 'k1:XLR']);
    expect(names.at(-1)!.startsWith('-')).toBe(true);
  });
});
