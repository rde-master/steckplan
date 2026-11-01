// Maße: intern Millimeter, angezeigt und eingegeben in Metern (mit Komma).

/** 450 → „0,45“; undefined → „“ */
export function formatMeters(mm: number | undefined): string {
  if (mm === undefined || !Number.isFinite(mm)) return '';
  return (mm / 1000).toLocaleString('de-DE', { maximumFractionDigits: 3, useGrouping: false });
}

/** „0,45“ / „0.45“ / „ 2 “ → 450 / 450 / 2000; leer → undefined; ungültig → null */
export function parseMeters(text: string): number | undefined | null {
  const trimmed = text.trim().replace(/\s*m$/i, '');
  if (!trimmed) return undefined;
  if (!/^\d+([.,]\d+)?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed.replace(',', '.')) * 1000);
}

/** „1, 2,5; 10“ → [1000, 2500, 10000] (sortiert, ohne Doppelte); ungültig → null */
export function parseMeterList(text: string): number[] | null {
  const parts = text
    .split(/[;\s]+|,(?=\s)/)
    .map((p) => p.trim())
    .filter(Boolean);
  const values: number[] = [];
  for (const part of parts) {
    const value = parseMeters(part);
    if (value === null || value === undefined || value <= 0) return null;
    values.push(value);
  }
  return [...new Set(values)].sort((a, b) => a - b);
}

export function formatMeterList(values: number[] | undefined): string {
  return (values ?? []).map(formatMeters).join('; ');
}
