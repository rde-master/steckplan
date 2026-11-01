// Verbindungen: Richtung, Stecker und passende Kabeltypen.
import type { Library } from '../library/library';
import type { Template } from '../model/schema';
import { canFlow, normalizeConnector, type EffectivePort } from './ports';

export type ConnectorMatch = 'match' | 'mismatch' | 'unknown';

/** Passen die Stecker eines Kabeltyps zu den Anschlüssen (in einer der beiden Ausrichtungen)? */
export function connectorMatch(cableType: Template | undefined, from: EffectivePort, to: EffectivePort): ConnectorMatch {
  const a = normalizeConnector(cableType?.connectorA);
  const b = normalizeConnector(cableType?.connectorB);
  const f = normalizeConnector(from.connector);
  const t = normalizeConnector(to.connector);
  if (!a || !b || !f || !t) return 'unknown';
  return (a === f && b === t) || (a === t && b === f) ? 'match' : 'mismatch';
}

/** Kabeltypen, sortiert: passende zuerst (Stecker und Signal), dann unbekannt, dann unpassend. Ohne Multicores. */
export function rankCableTypes(library: Library, from: EffectivePort, to: EffectivePort): { template: Template; match: ConnectorMatch; signalMatch: boolean }[] {
  const signal = normalizeConnector(from.signal || to.signal);
  const order: Record<ConnectorMatch, number> = { match: 0, unknown: 1, mismatch: 2 };
  return library.templates
    .filter((t) => t.kind === 'cableType' && t.channels === undefined)
    .map((template) => ({
      template,
      match: connectorMatch(template, from, to),
      signalMatch: !signal || !template.signal || normalizeConnector(template.signal) === signal,
    }))
    .sort((x, y) => order[x.match] - order[y.match] || Number(y.signalMatch) - Number(x.signalMatch) || x.template.name.localeCompare(y.template.name, 'de'));
}

/** Genau ein eindeutig passender Kabeltyp → automatisch verwenden. */
export function autoCableType(library: Library, from: EffectivePort, to: EffectivePort): Template | undefined {
  const exact = rankCableTypes(library, from, to).filter((r) => r.match === 'match' && r.signalMatch);
  return exact.length === 1 ? exact[0]!.template : undefined;
}

/** Ordnet zwei angeklickte Anschlüsse als (von, nach) – oder null, wenn kein Signal fließen kann. */
export function orientConnection<T extends { port: EffectivePort }>(a: T, b: T): { from: T; to: T } | null {
  if (canFlow(a.port.role, b.port.role)) return { from: a, to: b };
  if (canFlow(b.port.role, a.port.role)) return { from: b, to: a };
  return null;
}
