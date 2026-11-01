import { describe, expect, it } from 'vitest';
import { bulkLabels, bulkPreview, createBulkPorts, MAX_BULK_PORTS } from './ports';

const base = { connector: ' XLR 3 ', direction: 'in' as const, signal: 'Audio', isNetwork: false };

describe('Mehrere Anschlüsse anlegen', () => {
  it('nummeriert fortlaufend mit Platzhalter #', () => {
    expect(bulkLabels({ pattern: 'In #', count: 3, start: 1, pad: false })).toEqual(['In 1', 'In 2', 'In 3']);
    expect(bulkLabels({ pattern: 'Ch #/L', count: 2, start: 9, pad: false })).toEqual(['Ch 9/L', 'Ch 10/L']);
  });

  it('hängt die Nummer an, wenn kein # vorkommt', () => {
    expect(bulkLabels({ pattern: 'Kanal', count: 2, start: 1, pad: false })).toEqual(['Kanal 1', 'Kanal 2']);
    expect(bulkLabels({ pattern: '', count: 2, start: 1, pad: false })).toEqual(['1', '2']);
  });

  it('führende Nullen passend zur größten Nummer', () => {
    expect(bulkLabels({ pattern: 'In #', count: 12, start: 1, pad: true })[0]).toBe('In 01');
    expect(bulkLabels({ pattern: 'In #', count: 9, start: 1, pad: true })[0]).toBe('In 1');
    expect(bulkLabels({ pattern: '#', count: 100, start: 1, pad: true }).at(-1)).toBe('100');
    expect(bulkLabels({ pattern: '#', count: 100, start: 1, pad: true })[0]).toBe('001');
  });

  it('begrenzt die Anzahl', () => {
    expect(bulkLabels({ pattern: '#', count: 10_000, start: 1, pad: false })).toHaveLength(MAX_BULK_PORTS);
    expect(bulkLabels({ pattern: '#', count: -3, start: 1, pad: false })).toEqual([]);
  });

  it('Vorschau', () => {
    expect(bulkPreview(['A', 'B'])).toBe('A, B');
    expect(bulkPreview(bulkLabels({ pattern: 'In #', count: 16, start: 1, pad: false }))).toBe('In 1, In 2, … In 16');
  });

  it('erzeugt Anschlüsse mit eindeutigen Kennungen und gemeinsamen Eigenschaften', () => {
    const existing = [{ id: 'p-1', label: 'Netz', connector: 'etherCON', direction: 'bi' as const, signal: 'Ethernet' }];
    const ports = createBulkPorts({ ...base, pattern: 'In #', count: 32, start: 1, pad: false }, existing);
    expect(ports).toHaveLength(32);
    expect(new Set([...ports, ...existing].map((p) => p.id)).size).toBe(33);
    expect(ports[31]).toMatchObject({ label: 'In 32', connector: 'XLR 3', direction: 'in', signal: 'Audio' });
    expect(ports[0]!.isNetwork).toBeUndefined();
    expect(createBulkPorts({ ...base, pattern: 'LAN #', count: 1, start: 1, pad: false, isNetwork: true }, [])[0]!.isNetwork).toBe(true);
  });
});
