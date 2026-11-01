// Bibliothek (Vorlagen + Stammdaten) als JSON-Datei; Änderungen werden nacheinander ausgeführt.
import { readFile } from 'node:fs/promises';
import { createEmptyLibrary, LibrarySchema, type Library } from '@steckplan/core';
import { isNotFound, writeFileAtomic } from '../storage/fs-utils';

export interface LibraryChange {
  revision: number;
  /** ids geänderter/gelöschter Vorlagen */
  templateIds: string[];
  /** geänderte Stammdaten als „kind:id“ */
  masterKeys: string[];
}

export class LibraryError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'LibraryError';
  }
}

export interface MutationResult<T> {
  library: Library;
  result: T;
  templateIds?: string[];
  masterKeys?: string[];
}

export class LibraryStore {
  private library: Library = createEmptyLibrary();
  private chain: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<(change: LibraryChange) => void>();

  /** file: Pfad der library.json; ohne Datei nur im Speicher (Tests) */
  constructor(private readonly file?: string) {}

  async load(): Promise<void> {
    if (!this.file) return;
    let text: string;
    try {
      text = await readFile(this.file, 'utf8');
    } catch (error) {
      if (!isNotFound(error)) throw error;
      await this.save();
      return;
    }
    // Beschädigte Datei NICHT überschreiben – lieber mit klarer Meldung abbrechen.
    const parsed = LibrarySchema.safeParse(JSON.parse(text));
    if (!parsed.success) throw new Error(`Bibliothek ${this.file} ist beschädigt: ${parsed.error.issues[0]?.message ?? ''}`);
    this.library = parsed.data;
  }

  get(): Library {
    return this.library;
  }

  get libraryId(): string {
    return this.library.libraryId;
  }

  onChange(listener: (change: LibraryChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Führt eine Änderung aus (nacheinander, nie gleichzeitig). Gibt die Funktion dieselbe Bibliothek zurück, passiert nichts. */
  mutate<T>(fn: (library: Library) => MutationResult<T> | Promise<MutationResult<T>>): Promise<T> {
    const run = async (): Promise<T> => {
      const before = this.library;
      const { library, result, templateIds = [], masterKeys = [] } = await fn(before);
      if (library !== before) {
        this.library = { ...library, revision: Math.max(library.revision, before.revision + 1) };
        await this.save();
        const change: LibraryChange = { revision: this.library.revision, templateIds, masterKeys };
        for (const listener of this.listeners) listener(change);
      }
      return result;
    };
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async save(): Promise<void> {
    if (this.file) await writeFileAtomic(this.file, JSON.stringify(this.library, null, 2) + '\n');
  }
}
