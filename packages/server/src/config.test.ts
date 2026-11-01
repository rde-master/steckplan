import { describe, expect, it } from 'vitest';
import { ConfigError, readStandaloneConfig } from './config';

const valid = { STECKPLAN_EDIT_PASSWORD: 'bearbeiten', STECKPLAN_READ_PASSWORD: 'lesen' };

describe('readStandaloneConfig', () => {
  it('nutzt Standardwerte', () => {
    expect(readStandaloneConfig(valid)).toEqual({
      host: '0.0.0.0',
      port: 8080,
      dataDir: '/data',
      uiDir: undefined,
      editPassword: 'bearbeiten',
      readPassword: 'lesen',
    });
  });

  it('übernimmt PORT, Datenordner und UI-Ordner', () => {
    const config = readStandaloneConfig({ ...valid, PORT: '9000', STECKPLAN_DATA_DIR: '/x', STECKPLAN_UI_DIR: '/ui' });
    expect(config).toMatchObject({ port: 9000, dataDir: '/x', uiDir: '/ui' });
  });

  it('verweigert den Start ohne Passwörter', () => {
    expect(() => readStandaloneConfig({})).toThrow(ConfigError);
    try {
      readStandaloneConfig({});
    } catch (error) {
      expect((error as ConfigError).problems).toHaveLength(2);
    }
  });

  it('verlangt unterschiedliche Passwörter', () => {
    expect(() => readStandaloneConfig({ STECKPLAN_EDIT_PASSWORD: 'x', STECKPLAN_READ_PASSWORD: 'x' })).toThrow(
      /unterscheiden/,
    );
  });

  it('prüft den Port', () => {
    expect(() => readStandaloneConfig({ ...valid, PORT: 'abc' })).toThrow(/Portnummer/);
    expect(() => readStandaloneConfig({ ...valid, PORT: '70000' })).toThrow(/Portnummer/);
  });
});
