// Merkt sich, welche Projekte welche Vorlagen und Stammdaten verwenden (für „Löschen nur, wenn unbenutzt“).
// Docker: alle Projekte im Datenordner. Desktop: alle Dateien, die mit dieser App gespeichert wurden.
import { readFile } from 'node:fs/promises';
import { usageFromJson, usageKey, usageToJson, type MasterKind, type Usage } from '@steckplan/core';
import { writeFileAtomic } from '../storage/fs-utils';

interface Entry {
  name: string;
  seenAt: string;
  usage: Usage;
}

export class UsageTracker {
  private readonly entries = new Map<string, Entry>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly file?: string) {}

  async load(): Promise<void> {
    if (!this.file) return;
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8')) as Record<string, { name: string; seenAt: string; usage: Record<string, string[]> }>;
      for (const [key, value] of Object.entries(data)) {
        this.entries.set(key, { name: value.name, seenAt: value.seenAt, usage: usageFromJson(value.usage) });
      }
    } catch {
      // noch keine Datei
    }
  }

  record(key: string, name: string, usage: Usage): void {
    this.entries.set(key, { name, seenAt: new Date().toISOString(), usage });
    this.schedulePersist();
  }

  remove(key: string): void {
    if (this.entries.delete(key)) this.schedulePersist();
  }

  /** Namen der Projekte, die den Eintrag verwenden. */
  find(kind: 'template' | MasterKind, id: string): string[] {
    const field = usageKey(kind);
    const names: string[] = [];
    for (const entry of this.entries.values()) if (entry.usage[field].has(id)) names.push(entry.name || '(ohne Namen)');
    return names.sort((a, b) => a.localeCompare(b, 'de'));
  }

  private schedulePersist(): void {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, 500);
    this.saveTimer.unref?.();
  }

  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.file) return;
    const data = Object.fromEntries([...this.entries].map(([key, e]) => [key, { name: e.name, seenAt: e.seenAt, usage: usageToJson(e.usage) }]));
    await writeFileAtomic(this.file, JSON.stringify(data, null, 2));
  }
}
