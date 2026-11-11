import { describe, expect, it } from 'vitest';
import { isDisplayPath, reloadDelayMs } from './ErrorBoundary';

describe('Fehlerseite', () => {
  it('Textfenster und Player laden von selbst neu, alle anderen Seiten zeigen die Meldung', () => {
    expect(isDisplayPath('/player')).toBe(true);
    expect(isDisplayPath('/projekt/abc/text')).toBe(true);
    expect(isDisplayPath('/projekt/abc/text/')).toBe(true);
    expect(isDisplayPath('/projekt/abc')).toBe(false);
    expect(isDisplayPath('/projekt/abc/vorstellung')).toBe(false);
    expect(isDisplayPath('/')).toBe(false);
  });

  it('lädt erst nach kurzer Zeit neu, bei wiederholtem Fehler deutlich später (keine Schleife)', () => {
    expect(reloadDelayMs(0, 1_000_000)).toBe(4000);
    expect(reloadDelayMs(1_000_000 - 10_000, 1_000_000)).toBe(30_000);
    expect(reloadDelayMs(1_000_000 - 120_000, 1_000_000)).toBe(4000);
  });
});
