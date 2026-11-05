import { mkdtempSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyProject, serializeProject } from '@steckplan/core';
import { DataDirProjectStore, TRASH_RETENTION_MS } from './data-dir-store';
import { LocalFileStore, mediaDirFor } from './local-file-store';
import { MediaStore } from './media-store';
import { FileLock, LockedError, LOCK_STALE_MS, lockPathFor, readLock } from './lock-file';
import { MAX_VERSIONS, VersionStore } from './version-store';
import { writeFileAtomic } from './fs-utils';
import { ProjectNotFoundError } from './types';

const tmp = () => mkdtempSync(join(tmpdir(), 'steckplan-test-'));

describe('writeFileAtomic', () => {
  it('schreibt die Datei und hinterlässt keine Temp-Dateien', async () => {
    const dir = tmp();
    await writeFileAtomic(join(dir, 'unter/ordner/a.txt'), 'hallo');
    expect(readFileSync(join(dir, 'unter/ordner/a.txt'), 'utf8')).toBe('hallo');
    expect(readdirSync(join(dir, 'unter/ordner'))).toEqual(['a.txt']);
  });
});

describe('DataDirProjectStore', () => {
  async function makeStore() {
    const store = new DataDirProjectStore(tmp());
    await store.init();
    return store;
  }

  it('legt an, listet, lädt und speichert', async () => {
    const store = await makeStore();
    const project = createEmptyProject({ name: 'Stadtfest' });
    const id = await store.create(project);
    expect(id).toBe(project.id);
    expect((await store.list()).map((p) => p.name)).toEqual(['Stadtfest']);
    const loaded = await store.load(id);
    await store.save(id, { ...loaded, meta: { ...loaded.meta, name: 'Stadtfest 2026' } });
    expect((await store.load(id)).meta.name).toBe('Stadtfest 2026');
    expect((await store.list())[0]!.name).toBe('Stadtfest 2026');
  });

  it('vergibt bei Kollision eine neue id', async () => {
    const store = await makeStore();
    const project = createEmptyProject({ name: 'A' });
    const first = await store.create(project);
    const second = await store.create(project);
    expect(second).not.toBe(first);
    expect((await store.load(second)).id).toBe(second);
  });

  it('meldet unbekannte und unsichere ids als nicht gefunden', async () => {
    const store = await makeStore();
    await expect(store.load('gibtsnicht')).rejects.toBeInstanceOf(ProjectNotFoundError);
    await expect(store.load('../../etc/passwd')).rejects.toBeInstanceOf(ProjectNotFoundError);
  });

  it('verschiebt in den Papierkorb und stellt wieder her', async () => {
    const store = await makeStore();
    const id = await store.create(createEmptyProject({ name: 'Weg damit' }));
    await store.trash(id);
    expect(await store.list()).toEqual([]);
    const trash = await store.listTrash();
    expect(trash).toHaveLength(1);
    expect(trash[0]).toMatchObject({ projectId: id, name: 'Weg damit' });
    const restored = await store.restoreFromTrash(trash[0]!.trashId);
    expect(restored).toBe(id);
    expect(await store.listTrash()).toEqual([]);
    expect((await store.list()).map((p) => p.id)).toEqual([id]);
  });

  it('leert den Papierkorb nach 30 Tagen', async () => {
    const store = await makeStore();
    const id = await store.create(createEmptyProject({ name: 'Alt' }));
    await store.trash(id);
    expect(await store.purgeTrash(Date.now() + TRASH_RETENTION_MS - 1000)).toEqual([]);
    expect(await store.purgeTrash(Date.now() + TRASH_RETENTION_MS + 1000)).toEqual([id]);
    expect(await store.listTrash()).toEqual([]);
  });
});

describe('VersionStore', () => {
  it('speichert Versionen und behält höchstens 30', async () => {
    const versions = new VersionStore(tmp());
    const project = createEmptyProject({ name: 'V' });
    for (let i = 0; i < MAX_VERSIONS + 3; i++) {
      await versions.add(project.id, { ...project, meta: { ...project.meta, version: String(i) } }, ['Ralf'], undefined, new Date(2026, 0, 1, 0, i));
    }
    const list = await versions.list(project.id);
    expect(list).toHaveLength(MAX_VERSIONS);
    expect(list[0]!.at > list[1]!.at).toBe(true);
    expect((await versions.load(project.id, list[0]!.id)).meta.version).toBe(String(MAX_VERSIONS + 2));
    expect(readdirSync(join((versions as unknown as { baseDir: string }).baseDir, project.id))).toHaveLength(MAX_VERSIONS + 1);
  });

  it('liefert eine leere Liste für Projekte ohne Versionen', async () => {
    expect(await new VersionStore(tmp()).list('abc')).toEqual([]);
  });
});

describe('Sperrdatei', () => {
  it('setzt, erkennt fremde Sperren und gibt frei', async () => {
    const file = join(tmp(), 'Projekt.steckplan');
    writeFileSync(file, '{}');
    const mine = new FileLock(file, 'Ralf');
    await mine.acquire();
    expect(existsSync(lockPathFor(file))).toBe(true);
    expect(lockPathFor(file).endsWith('Projekt.steckplan.lock')).toBe(true);

    const other = new FileLock(file, 'Anna');
    const error = await other.acquire().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LockedError);
    expect((error as LockedError).stale).toBe(false);
    expect((error as LockedError).info.name).toBe('Ralf');

    await mine.release();
    expect(existsSync(lockPathFor(file))).toBe(false);
    await other.acquire();
    await other.release();
  });

  it('erkennt veraltete Sperren und erlaubt die Übernahme', async () => {
    const file = join(tmp(), 'P.steckplan');
    const old = new Date(Date.now() - LOCK_STALE_MS - 1000).toISOString();
    writeFileSync(lockPathFor(file), JSON.stringify({ app: 'Steckplan', host: 'alt', name: 'Anna', pid: 1, instance: 'x', startedAt: old, updatedAt: old }));
    const lock = new FileLock(file, 'Ralf');
    const error = await lock.acquire().catch((e: unknown) => e);
    expect((error as LockedError).stale).toBe(true);
    await lock.acquire({ takeOver: true });
    expect((await readLock(file))?.name).toBe('Ralf');
    await lock.release();
  });

  it('löscht keine Sperre, die ein anderer übernommen hat', async () => {
    const file = join(tmp(), 'P.steckplan');
    const a = new FileLock(file, 'A');
    await a.acquire();
    const b = new FileLock(file, 'B');
    await b.acquire({ takeOver: true });
    await a.release();
    expect((await readLock(file))?.name).toBe('B');
    await b.release();
  });
});

describe('LocalFileStore', () => {
  it('legt Dateien an, öffnet, speichert und schließt', async () => {
    const dir = tmp();
    const store = new LocalFileStore('Ralf');
    const project = createEmptyProject({ name: 'Lokal' });
    const id = await store.create(join(dir, 'Lokal.steckplan'), project);
    expect(existsSync(join(dir, 'Lokal.steckplan.lock'))).toBe(true);
    expect((await store.list()).map((p) => p.name)).toEqual(['Lokal']);

    await store.save(id, { ...project, meta: { ...project.meta, venue: 'Halle' } });
    expect(JSON.parse(readFileSync(join(dir, 'Lokal.steckplan'), 'utf8')).meta.venue).toBe('Halle');

    // dieselbe Datei erneut öffnen → gleiche id
    expect((await store.open(join(dir, 'Lokal.steckplan'))).id).toBe(id);

    await store.close(id);
    expect(existsSync(join(dir, 'Lokal.steckplan.lock'))).toBe(false);
    expect(await store.list()).toEqual([]);
  });

  it('öffnet gesperrte Dateien nur lesend und speichert dann nicht', async () => {
    const dir = tmp();
    const file = join(dir, 'P.steckplan');
    writeFileSync(file, serializeProject(createEmptyProject({ name: 'P' })));
    const foreign = new FileLock(file, 'Anna');
    await foreign.acquire();

    const store = new LocalFileStore('Ralf');
    await expect(store.open(file)).rejects.toBeInstanceOf(LockedError);
    const { id, project } = await store.open(file, { readOnly: true });
    expect(store.readOnlyReason(id)).toBeDefined();
    await store.save(id, { ...project, meta: { ...project.meta, name: 'geändert' } });
    expect(JSON.parse(readFileSync(file, 'utf8')).meta.name).toBe('P');
    await store.close(id);
    expect((await readLock(file))?.name).toBe('Anna');
    await foreign.release();
  });

  it('„Speichern unter“ wechselt Datei und Sperre', async () => {
    const dir = tmp();
    const store = new LocalFileStore('Ralf');
    const project = createEmptyProject({ name: 'A' });
    const id = await store.create(join(dir, 'A.steckplan'), project);
    await store.saveAs(id, join(dir, 'B.steckplan'), project);
    expect(store.pathOf(id)).toBe(join(dir, 'B.steckplan'));
    expect(existsSync(join(dir, 'A.steckplan.lock'))).toBe(false);
    expect(existsSync(join(dir, 'B.steckplan.lock'))).toBe(true);
    await store.closeAll();
  });

  it('Medien liegen neben der Datei; „Speichern unter“ nimmt sie mit, Hochladen landet dort', async () => {
    const dir = tmp();
    const store = new LocalFileStore('Ralf');
    const media = new MediaStore((pid) => {
      const path = store.pathOf(pid);
      return path ? mediaDirFor(path) : undefined;
    });
    expect(mediaDirFor(join(dir, 'Fest.steckplan'))).toBe(join(dir, 'Fest.medien'));
    const project = createEmptyProject({ name: 'Fest' });
    const id = await store.create(join(dir, 'Fest.steckplan'), project);
    const started = await media.startUpload(id, { size: 3 });
    await media.appendChunk(id, started.uploadId, 0, Buffer.from('abc'));
    const info = await media.completeUpload(id, started.uploadId);
    expect(readFileSync(join(dir, 'Fest.medien', info.id), 'utf8')).toBe('abc');
    await store.saveAs(id, join(dir, 'Fest 2.steckplan'), project);
    expect(readFileSync(join(dir, 'Fest 2.medien', info.id), 'utf8')).toBe('abc');
    expect((await media.open(id, info.id))?.path).toBe(join(dir, 'Fest 2.medien', info.id));
    await store.closeAll();
  });

  it('closeAll wartet auf bereits laufende Schließvorgänge (Beenden der App)', async () => {
    const dir = tmp();
    const store = new LocalFileStore('Ralf');
    const id = await store.create(join(dir, 'A.steckplan'), createEmptyProject({ name: 'A' }));
    const first = store.close(id); // z. B. Fenster geschlossen
    expect(store.close(id)).toBe(first);
    await store.closeAll(); // gleichzeitig: App wird beendet
    expect(existsSync(join(dir, 'A.steckplan.lock'))).toBe(false);
    await first;
  });

  it('meldet ungültige Dateien verständlich', async () => {
    const file = join(tmp(), 'kaputt.steckplan');
    writeFileSync(file, 'nicht json');
    await expect(new LocalFileStore('R').open(file)).rejects.toThrow(/kein gültiges JSON/);
    expect(existsSync(lockPathFor(file))).toBe(false);
  });

  it('aktualisiert die Sperre regelmäßig', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    try {
      const file = join(tmp(), 'P.steckplan');
      const lock = new FileLock(file, 'Ralf');
      await lock.acquire();
      const first = (await readLock(file))!.updatedAt;
      vi.advanceTimersByTime(61_000);
      vi.useRealTimers();
      await new Promise((r) => setTimeout(r, 50));
      expect((await readLock(file))!.updatedAt > first).toBe(true);
      await lock.release();
    } finally {
      vi.useRealTimers();
    }
  });
});
