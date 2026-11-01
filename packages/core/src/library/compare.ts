// Inhaltlicher Vergleich von Vorlagen und Stammdaten (ohne Verwaltungsfelder wie Version).
import type { Template } from '../model/schema';
import type { MasterEntry } from './library';

/** JSON mit sortierten Schlüsseln, undefined-Felder weggelassen. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const TEMPLATE_META_FIELDS = new Set(['version', 'updatedAt', 'updatedBy']);
const MASTER_META_FIELDS = new Set(['archived']);

function contentOf(value: object, ignore: Set<string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([k, v]) => !ignore.has(k) && v !== undefined));
}

export function templateContentEqual(a: Template, b: Template): boolean {
  return stableStringify(contentOf(a, TEMPLATE_META_FIELDS)) === stableStringify(contentOf(b, TEMPLATE_META_FIELDS));
}

export function masterEntryEqual(a: MasterEntry, b: MasterEntry): boolean {
  return stableStringify(contentOf(a, MASTER_META_FIELDS)) === stableStringify(contentOf(b, MASTER_META_FIELDS));
}

/** Namen der Felder, die sich inhaltlich unterscheiden (für die Gegenüberstellung im Konfliktdialog). */
export function differingFields(a: object, b: object, kind: 'template' | 'master'): string[] {
  const ignore = kind === 'template' ? TEMPLATE_META_FIELDS : MASTER_META_FIELDS;
  const ca = contentOf(a, ignore);
  const cb = contentOf(b, ignore);
  const keys = [...new Set([...Object.keys(ca), ...Object.keys(cb)])].sort();
  return keys.filter((k) => stableStringify(ca[k]) !== stableStringify(cb[k]));
}
