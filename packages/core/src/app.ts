import { VERSION } from './version';

export const APP_NAME = 'Steckplan';
export const FILE_EXTENSION = '.steckplan';

/** Antwort von GET /api/health – gemeinsam für Server und UI. */
export interface HealthInfo {
  name: typeof APP_NAME;
  version: string;
  mode: ServerMode;
}

/** Wo der Server läuft: eingebettet in der Desktop-App oder eigenständig (Docker). */
export type ServerMode = 'desktop' | 'standalone';

export function createHealthInfo(mode: ServerMode): HealthInfo {
  return { name: APP_NAME, version: VERSION, mode };
}

/** Anzeigetext „Steckplan 0.1.0“ für „Über Steckplan“ und Fensterleisten. */
export function formatAppTitle(version: string = VERSION): string {
  return `${APP_NAME} ${version}`;
}
