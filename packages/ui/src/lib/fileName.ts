/** Dateiname nur aus ASCII-Zeichen – manche Browser verwerfen sonst den Namen beim Download. */
export function asciiFileName(text: string): string {
  const map: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss', '–': '-', '—': '-', '·': '-' };
  return text
    .replace(/[äöüÄÖÜß–—·]/g, (c) => map[c] ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}
