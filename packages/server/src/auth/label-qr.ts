// QR-Code auf den Geräte-Etiketten: Einstellungen (an/aus, Adresse, Hinweis) und Lese-Schlüssel je Projekt.
// Ein Schlüssel öffnet ohne Passwort die Leseansicht genau eines Projekts. Er steht im Klartext in der Datei,
// weil er für jedes neue Etikett wieder in den QR-Code muss; erneuern oder sperren macht alte Etiketten ungültig.
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { writeFileAtomic } from '../storage/fs-utils';

export const DEFAULT_LABEL_HINT = 'Aktuelle Informationen finden Sie hier.';
export const LABEL_HINT_MAX = 120;

export interface LabelQrSettings {
  enabled: boolean;
  /** Öffentliche Adresse (z. B. https://steckplan.example.de); leer = Adresse aus dem Browser */
  baseUrl: string;
  hint: string;
}

export interface ShareLink {
  /** dauerhafte Kennung des Projekts (Docker: id, Desktop: Dateipfad) */
  key: string;
  token: string;
  createdAt: string;
  createdBy: string;
}

interface FileData {
  settings: LabelQrSettings;
  links: ShareLink[];
}

const DEFAULTS: LabelQrSettings = { enabled: true, baseUrl: '', hint: DEFAULT_LABEL_HINT };

/** „https://host[:port][/pfad]“ ohne Schrägstrich am Ende; leer erlaubt; sonst null = ungültig */
export function normalizeBaseUrl(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.search || url.hash) return null;
    return trimmed;
  } catch {
    return null;
  }
}

export class LabelQrStore {
  private data: FileData = { settings: { ...DEFAULTS }, links: [] };

  constructor(private readonly file?: string) {}

  async load(): Promise<void> {
    if (!this.file) return;
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8')) as Partial<FileData>;
      this.data = {
        settings: { ...DEFAULTS, ...raw.settings },
        links: (raw.links ?? []).filter((l): l is ShareLink => !!l && typeof l.key === 'string' && typeof l.token === 'string'),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  private async save(): Promise<void> {
    if (this.file) await writeFileAtomic(this.file, JSON.stringify(this.data, null, 2));
  }

  get settings(): LabelQrSettings {
    return { ...this.data.settings };
  }

  async updateSettings(patch: Partial<LabelQrSettings>): Promise<LabelQrSettings> {
    this.data.settings = { ...this.data.settings, ...patch };
    await this.save();
    return this.settings;
  }

  links(): ShareLink[] {
    return [...this.data.links];
  }

  link(key: string): ShareLink | undefined {
    return this.data.links.find((l) => l.key === key);
  }

  byToken(token: string): ShareLink | undefined {
    return token ? this.data.links.find((l) => l.token === token) : undefined;
  }

  /** Schlüssel des Projekts; renew = neuen Schlüssel erzeugen (der alte gilt nicht mehr). Gibt auch den alten zurück. */
  async ensure(key: string, by: string, renew = false): Promise<{ link: ShareLink; previous?: ShareLink }> {
    const previous = this.link(key);
    if (previous && !renew) return { link: previous };
    const link: ShareLink = { key, token: randomBytes(18).toString('base64url'), createdAt: new Date().toISOString(), createdBy: by };
    this.data.links = [...this.data.links.filter((l) => l.key !== key), link];
    await this.save();
    return { link, ...(previous ? { previous } : {}) };
  }

  /** Schlüssel sperren (alte Etiketten öffnen nichts mehr). */
  async revoke(key: string): Promise<ShareLink | undefined> {
    const previous = this.link(key);
    if (!previous) return undefined;
    this.data.links = this.data.links.filter((l) => l.key !== key);
    await this.save();
    return previous;
  }
}
