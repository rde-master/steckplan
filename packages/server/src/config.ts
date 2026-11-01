export interface StandaloneConfig {
  host: string;
  port: number;
  dataDir: string;
  uiDir: string | undefined;
  editPassword: string;
  readPassword: string;
  trustProxy: boolean;
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

  const portText = env.PORT ?? '8080';
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    problems.push(`PORT „${portText}“ ist keine gültige Portnummer (1–65535).`);
  }

  if (problems.length > 0) throw new ConfigError(problems);

  return {
    host: env.HOST ?? '0.0.0.0',
    port,
    dataDir: env.STECKPLAN_DATA_DIR ?? '/data',
    uiDir: env.STECKPLAN_UI_DIR || undefined,
    editPassword,
    readPassword,
    trustProxy: ['1', 'true', 'yes', 'ja'].includes((env.STECKPLAN_TRUST_PROXY ?? '').toLowerCase()),
  };
}
