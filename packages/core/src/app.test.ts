import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_NAME, createHealthInfo, formatAppTitle, VERSION } from './index';

describe('App-Grunddaten', () => {
  it('VERSION stimmt mit der Root-package.json überein', () => {
    const root = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
    expect(VERSION).toBe(root.version);
  });

  it('erzeugt Health-Info mit Name, Version und Betriebsart', () => {
    expect(createHealthInfo('standalone')).toEqual({ name: APP_NAME, version: VERSION, mode: 'standalone' });
  });

  it('formatiert den App-Titel', () => {
    expect(formatAppTitle('1.2.3')).toBe('Steckplan 1.2.3');
    expect(formatAppTitle()).toBe(`Steckplan ${VERSION}`);
  });
});
