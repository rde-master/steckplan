/** 12345 → „12,35 m“ */
export function formatMeters(mm: number, digits = 2): string {
  return `${(mm / 1000).toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })} m`;
}

/** 10000 → „10 m“, 2500 → „2,5 m“ (für Kabellängen) */
export function formatCableLength(mm: number | null | undefined): string {
  if (mm === null || mm === undefined) return '–';
  return `${(mm / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} m`;
}
