export interface StandaloneConfig {
  host: string;
  port: number;
  dataDir: string;
  uiDir: string | undefined;
  editPassword: string;
  readPassword: string;
  /** optional: Regie-Passwort (ohne = kein Regie-Zugang) */
  directionPassword: string | undefined;
  trustProxy: boolean;
  /** Suche für Player (UDP) an; Standard an */
  discovery: boolean;
  /** UDP-Port der Suche (Standard 41234) */
  discoveryPort: number | undefined;
  /** Port, unter dem Player die Oberfläche erreichen (hinter Docker-Portweiterleitung; Standard PORT) */
  publicPort: number | undefined;
}

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Konfiguration unvollständig:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/** Liest die Konfiguration des eigenständigen Servers (Docker) aus Umgebungsvariablen. */
export function readStandaloneConfig(env: NodeJS.ProcessEnv): StandaloneConfig {
  const problems: string[] = [];

  const editPassword = env.STECKPLAN_EDIT_PASSWORD ?? '';
  const readPassword = env.STECKPLAN_READ_PASSWORD ?? '';
  if (!editPassword) problems.push('STECKPLAN_EDIT_PASSWORD (Bearbeiten-Passwort) ist nicht gesetzt.');
  if (!readPassword) problems.push('STECKPLAN_READ_PASSWORD (Lese-Passwort) ist nicht gesetzt.');
  if (editPassword && readPassword && editPassword === readPassword) {
    problems.push('Bearbeiten- und Lese-Passwort müssen sich unterscheiden.');
  }
  const directionPassword = env.STECKPLAN_DIRECTION_PASSWORD || undefined;
  if (directionPassword && (directionPassword === editPassword || directionPassword === readPassword)) {
    problems.push('STECKPLAN_DIRECTION_PASSWORD (Regie-Passwort) muss sich vom Bearbeiten- und Lese-Passwort unterscheiden.');
  }

  const portText = env.PORT ?? '8080';
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    problems.push(`PORT „${portText}“ ist keine gültige Portnummer (1–65535).`);
  }

  const optionalPort = (name: string): number | undefined => {
    const text = env[name];
    if (!text) return undefined;
    const value = Number(text);
    if (!Number.isInteger(value) || value < 1 || value > 65535) {
      problems.push(`${name} „${text}“ ist keine gültige Portnummer (1–65535).`);
      return undefined;
    }
    return value;
  };
  const discoveryPort = optionalPort('STECKPLAN_DISCOVERY_PORT');
  const publicPort = optionalPort('STECKPLAN_PUBLIC_PORT');

  if (problems.length > 0) throw new ConfigError(problems);

  return {
    host: env.HOST ?? '0.0.0.0',
    port,
    dataDir: env.STECKPLAN_DATA_DIR ?? '/data',
    uiDir: env.STECKPLAN_UI_DIR || undefined,
    editPassword,
    readPassword,
    directionPassword,
    trustProxy: ['1', 'true', 'yes', 'ja'].includes((env.STECKPLAN_TRUST_PROXY ?? '').toLowerCase()),
    discovery: !['0', 'false', 'no', 'nein', 'aus'].includes((env.STECKPLAN_DISCOVERY ?? '').toLowerCase()),
    discoveryPort,
    publicPort,
  };
}
