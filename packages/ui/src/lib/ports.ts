// Mehrere Anschlüsse auf einmal anlegen (z. B. 16 Eingänge einer Stagebox).
import type { PortDef } from '@steckplan/core';

export const MAX_BULK_PORTS = 512;

export interface BulkPortOptions {
  /** Bezeichnung; „#“ wird durch die Nummer ersetzt (ohne „#“ wird die Nummer angehängt) */
  pattern: string;
  count: number;
  start: number;
  /** führende Nullen (01, 02 … bzw. 001 …) passend zur größten Nummer */
  pad: boolean;
  connector: string;
  direction: PortDef['direction'];
  signal: string;
  isNetwork: boolean;
}

export function bulkLabels(options: Pick<BulkPortOptions, 'pattern' | 'count' | 'start' | 'pad'>): string[] {
  const count = Math.max(0, Math.min(MAX_BULK_PORTS, Math.floor(options.count)));
  const start = Math.max(0, Math.floor(options.start));
  const width = options.pad ? String(start + count - 1).length : 0;
  const pattern = options.pattern.includes('#') ? options.pattern : `${options.pattern.trimEnd()} #`.trimStart();
  return Array.from({ length: count }, (_, i) => pattern.replaceAll('#', String(start + i).padStart(width, '0')).trim());
}

/** Kurzvorschau: „In 1, In 2, … In 16“ */
export function bulkPreview(labels: string[]): string {
  if (labels.length <= 4) return labels.join(', ');
  return `${labels.slice(0, 2).join(', ')}, … ${labels[labels.length - 1]}`;
}

/** Erzeugt neue Anschlüsse mit eindeutigen Kennungen (auch gegenüber vorhandenen). */
export function createBulkPorts(options: BulkPortOptions, existing: PortDef[]): PortDef[] {
  const used = new Set(existing.map((p) => p.id));
  const nextId = (): string => {
    let id: string;
    do id = `p-${Math.random().toString(36).slice(2, 8)}`;
    while (used.has(id));
    used.add(id);
    return id;
  };
  return bulkLabels(options).map((label) => ({
    id: nextId(),
    label,
    connector: options.connector.trim(),
    direction: options.direction,
    signal: options.signal.trim(),
    ...(options.isNetwork ? { isNetwork: true } : {}),
  }));
}
