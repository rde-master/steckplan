// „Zuletzt geändert von/am“ und Änderungsprotokoll – vom Server erfasst (Namen stammen aus der Sitzung).
import * as Y from 'yjs';
import type { Access, ChangeLogEntry } from '@steckplan/core';

export interface Actor {
  by: string;
  access: Access;
  via: ChangeLogEntry['via'];
}

/** Herkunft der Stempel-Schreibvorgänge (lösen selbst keine neuen Stempel aus). */
export const STAMP_ORIGIN = { name: 'stempel' };

type Kind = 'devices' | 'cables';
const KIND_WORDS: Record<Kind, [string, string]> = { devices: ['Gerät', 'Geräte'], cables: ['Kabel', 'Kabel'] };
const AREA_WORDS: Record<string, string> = {
  meta: 'Projektdaten geändert',
  settings: 'Einstellungen geändert',
  shapes: 'Zeichnung geändert',
  layers: 'Ebenen geändert',
  subnets: 'Netzwerk geändert',
  wifi: 'WLAN geändert',
  people: 'Personen geändert',
  groups: 'Gruppen geändert',
  caseTrailers: 'Cases umgeladen',
  showItems: 'Regie: Ablauf geändert',
  showSections: 'Regie: Texte geändert',
  showSettings: 'Regie: Startzeit geändert',
};
const POSITION_FIELDS = new Set(['signalFlow', 'stagePlan']);
const IGNORED_FIELDS = new Set(['check', 'lastModified']);

interface Bucket {
  actor: Actor;
  startedAt: number;
  added: Record<Kind, Set<string>>;
  deleted: Record<Kind, Set<string>>;
  moved: Record<Kind, Set<string>>;
  changed: Record<Kind, Set<string>>;
  areas: Set<string>;
  labels: Map<string, string>;
  timer: ReturnType<typeof setTimeout> | null;
}

function emptySets(): Record<Kind, Set<string>> {
  return { devices: new Set(), cables: new Set() };
}

export interface ActivityOptions {
  doc: Y.Doc;
  /** Verzögerung der Stempel (bündelt Tippen/Ziehen) */
  stampDelayMs?: number;
  /** Zeitfenster für einen Protokolleintrag je Person */
  windowMs?: number;
  onEntry: (entry: ChangeLogEntry) => void;
}

export class ActivityTracker {
  private readonly doc: Y.Doc;
  private readonly stampDelayMs: number;
  private readonly windowMs: number;
  private readonly onEntry: (entry: ChangeLogEntry) => void;
  private readonly pendingStamps = new Map<string, { kind: Kind; by: string }>();
  private stampTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly buckets = new Map<string, Bucket>();
  private stopped = false;

  constructor(options: ActivityOptions) {
    this.doc = options.doc;
    this.stampDelayMs = options.stampDelayMs ?? 1000;
    this.windowMs = options.windowMs ?? 60_000;
    this.onEntry = options.onEntry;
  }

  /** Nach jeder Transaktion eines Clients aufrufen. */
  record(transaction: Y.Transaction, actor: Actor): void {
    if (this.stopped) return;
    const collections = { devices: this.doc.getMap('devices'), cables: this.doc.getMap('cables') };
    const areas = Object.keys(AREA_WORDS).map((name) => [name, this.doc.getMap(name)] as const);
    let bucket: Bucket | null = null;
    const ensure = () => (bucket ??= this.bucketFor(actor));

    for (const [changedType, keys] of transaction.changed) {
      const type = changedType as unknown as Y.Map<unknown>;
      for (const kind of ['devices', 'cables'] as const) {
        const collection = collections[kind];
        if (type === collection) {
          for (const key of keys) {
            if (key === null) continue;
            const b = ensure();
            if (collection.has(key)) {
              b.added[kind].add(key);
              this.rememberLabel(b, collection.get(key), key);
              this.stamp(kind, key, actor.by);
            } else if (b.added[kind].has(key)) {
              b.added[kind].delete(key); // im selben Zeitfenster angelegt und wieder gelöscht
            } else {
              b.deleted[kind].add(key);
            }
          }
        } else if (type.parent === collection) {
          const id = type._item?.parentSub;
          if (!id) continue;
          const fields = [...keys].filter((k): k is string => k !== null && !IGNORED_FIELDS.has(k));
          if (fields.length === 0) continue;
          const b = ensure();
          this.rememberLabel(b, type, id);
          if (!b.added[kind].has(id)) (fields.every((f) => POSITION_FIELDS.has(f)) ? b.moved : b.changed)[kind].add(id);
          this.stamp(kind, id, actor.by);
        }
      }
      for (const [name, map] of areas) {
        if (type === map || type.parent === map) ensure().areas.add(name);
      }
    }
  }

  private rememberLabel(bucket: Bucket, item: unknown, id: string): void {
    const label = item instanceof Y.Map ? item.get('label') : undefined;
    if (typeof label === 'string' && label) bucket.labels.set(id, label);
  }

  private stamp(kind: Kind, id: string, by: string): void {
    this.pendingStamps.set(id, { kind, by });
    if (this.stampTimer) return;
    this.stampTimer = setTimeout(() => this.flushStamps(), this.stampDelayMs);
    this.stampTimer.unref?.();
  }

  flushStamps(): void {
    if (this.stampTimer) clearTimeout(this.stampTimer);
    this.stampTimer = null;
    if (this.pendingStamps.size === 0) return;
    const at = new Date().toISOString();
    const pending = [...this.pendingStamps];
    this.pendingStamps.clear();
    this.doc.transact(() => {
      for (const [id, { kind, by }] of pending) {
        const map = this.doc.getMap<Y.Map<unknown>>(kind).get(id);
        if (map instanceof Y.Map) map.set('lastModified', { at, by });
      }
    }, STAMP_ORIGIN);
  }

  private bucketFor(actor: Actor): Bucket {
    const key = `${actor.by}\u0000${actor.access}\u0000${actor.via}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { actor, startedAt: Date.now(), added: emptySets(), deleted: emptySets(), moved: emptySets(), changed: emptySets(), areas: new Set(), labels: new Map(), timer: null };
      bucket.timer = setTimeout(() => this.flushBucket(key), this.windowMs);
      bucket.timer.unref?.();
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  private entryOf(bucket: Bucket, at: string): ChangeLogEntry | null {
    const parts: string[] = [];
    const ids = new Set<string>();
    const describe = (sets: Record<Kind, Set<string>>, verb: string) => {
      for (const kind of ['devices', 'cables'] as const) {
        const n = sets[kind].size;
        if (!n) continue;
        const [one, many] = KIND_WORDS[kind];
        parts.push(`${n} ${n === 1 ? one : many} ${verb}`);
        for (const id of sets[kind]) ids.add(id);
      }
    };
    describe(bucket.added, 'hinzugefügt');
    describe(bucket.deleted, 'gelöscht');
    describe(bucket.moved, 'verschoben');
    describe(bucket.changed, 'geändert');
    for (const area of bucket.areas) parts.push(AREA_WORDS[area]!);
    if (parts.length === 0) return null;
    const labels = [...ids].map((id) => bucket.labels.get(id)).filter((l): l is string => !!l);
    const named = labels.length ? ` (${labels.slice(0, 3).join(', ')}${labels.length > 3 ? ' …' : ''})` : '';
    return { at, by: bucket.actor.by, access: bucket.actor.access, via: bucket.actor.via, action: parts.join(', ') + named, objectIds: [...ids] };
  }

  private flushBucket(key: string): void {
    const bucket = this.buckets.get(key);
    if (!bucket) return;
    this.buckets.delete(key);
    if (bucket.timer) clearTimeout(bucket.timer);
    const entry = this.entryOf(bucket, new Date(bucket.startedAt).toISOString());
    if (entry) this.onEntry(entry);
  }

  /** Noch offene Einträge (für die Anzeige, bevor das Zeitfenster abgelaufen ist). */
  pendingEntries(): ChangeLogEntry[] {
    return [...this.buckets.values()].map((b) => this.entryOf(b, new Date(b.startedAt).toISOString())).filter((e): e is ChangeLogEntry => e !== null);
  }

  flushAll(): void {
    this.flushStamps();
    for (const key of [...this.buckets.keys()]) this.flushBucket(key);
  }

  stop(): void {
    this.flushAll();
    this.stopped = true;
  }
}
