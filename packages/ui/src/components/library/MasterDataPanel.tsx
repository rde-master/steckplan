// Stammdaten: Kategorien, Besitzer, Anhänger – anlegen, umbenennen, Farbe, archivieren, löschen (nur wenn unbenutzt).
import { useState } from 'react';
import { MASTER_KIND_LABELS, MASTER_KINDS, type Library, type MasterEntry, type MasterKind } from '@steckplan/core';
import { api, ApiError, errorMessage } from '../../lib/api';
import { texts } from '../../texts';
import { Banner, Button, Field, TextInput } from '../ui';
import { ColorField } from './fields';

const m = texts.library.master;

function extraField(kind: MasterKind): { key: 'contact' | 'notes'; label: string } | null {
  if (kind === 'owners') return { key: 'contact', label: m.contact };
  if (kind === 'trailers') return { key: 'notes', label: m.notes };
  return null;
}

export function MasterDataPanel({ library, canEdit }: { library: Library; canEdit: boolean }) {
  const [kind, setKind] = useState<MasterKind>('categories');
  const [showArchived, setShowArchived] = useState(false);
  const entries = (library.masterData[kind] as MasterEntry[])
    .filter((e) => showArchived || !e.archived)
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="tablist">
        {MASTER_KINDS.map((k) => (
          <Button key={k} role="tab" aria-selected={kind === k} variant={kind === k ? 'primary' : 'secondary'} onClick={() => setKind(k)}>
            {MASTER_KIND_LABELS[k].plural}
          </Button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          {m.showArchived}
        </label>
      </div>

      {!canEdit && <Banner tone="info">{texts.library.readOnly}</Banner>}
      {canEdit && <AddEntry key={kind} kind={kind} />}

      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">{m.empty}</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900">
          {entries.map((entry) => (
            <EntryRow key={entry.id} kind={kind} entry={entry} canEdit={canEdit} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AddEntry({ kind }: { kind: MasterKind }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await api.createMaster(kind, { name, ...(color ? { color } : {}) });
          setName('');
          setColor(undefined);
        } catch (err) {
          setError(errorMessage(err));
        }
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Field label={`${MASTER_KIND_LABELS[kind].singular}: ${texts.library.fields.name}`}>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
          </Field>
        </div>
        <Button type="submit" variant="primary" disabled={!name.trim()}>
          ＋ {m.add}
        </Button>
      </div>
      <ColorField label={texts.library.fields.color} value={color} onChange={setColor} />
      {error && <Banner tone="error">{error}</Banner>}
    </form>
  );
}

function EntryRow({ kind, entry, canEdit }: { kind: MasterKind; entry: MasterEntry; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MasterEntry>(entry);
  const [error, setError] = useState<string | null>(null);
  const [usedBy, setUsedBy] = useState<string[] | null>(null);
  const extra = extraField(kind);
  const extraValue = extra ? ((entry as Record<string, unknown>)[extra.key] as string | undefined) : undefined;

  async function run(action: () => Promise<unknown>) {
    setError(null);
    setUsedBy(null);
    try {
      await action();
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && Array.isArray(err.details.usedBy)) setUsedBy(err.details.usedBy as string[]);
    }
  }

  return (
    <li className="space-y-2 px-3 py-2">
      {editing ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => api.updateMaster(kind, entry.id, draft));
          }}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={texts.library.fields.name}>
              <TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required autoFocus />
            </Field>
            {extra && (
              <Field label={extra.label}>
                <TextInput
                  value={((draft as Record<string, unknown>)[extra.key] as string | undefined) ?? ''}
                  onChange={(e) => setDraft({ ...draft, [extra.key]: e.target.value } as MasterEntry)}
                />
              </Field>
            )}
          </div>
          <ColorField label={texts.library.fields.color} value={draft.color} onChange={(color) => setDraft({ ...draft, color: color ?? '' })} />
          <div className="flex gap-2">
            <Button type="submit" variant="primary">
              {texts.common.save}
            </Button>
            <Button onClick={() => setEditing(false)}>{texts.common.cancel}</Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="h-4 w-4 shrink-0 rounded border border-slate-300 dark:border-slate-600" style={{ backgroundColor: entry.color ?? 'transparent' }} />
          <span className={`font-medium ${entry.archived ? 'text-slate-400 line-through' : ''}`}>{entry.name}</span>
          {extraValue && <span className="text-sm text-slate-500">{extraValue}</span>}
          {entry.archived && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs dark:bg-slate-700">{m.archived}</span>}
          <div className="flex-1" />
          {canEdit && (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setDraft(entry);
                  setEditing(true);
                }}
              >
                {m.edit}
              </Button>
              <Button variant="ghost" onClick={() => void run(() => api.updateMaster(kind, entry.id, { archived: !entry.archived }))}>
                {entry.archived ? m.unarchive : m.archive}
              </Button>
              <Button variant="ghost" aria-label={`${texts.common.delete}: ${entry.name}`} onClick={() => void run(() => api.deleteMaster(kind, entry.id))}>
                {texts.common.delete}
              </Button>
            </>
          )}
        </div>
      )}
      {error && (
        <Banner tone="warn">
          <div>{error}</div>
          {usedBy && <div className="mt-1 text-xs">{usedBy.join(', ')}</div>}
          {usedBy && !entry.archived && (
            <Button className="mt-2" onClick={() => void run(() => api.updateMaster(kind, entry.id, { archived: true }))}>
              {m.archive}
            </Button>
          )}
        </Banner>
      )}
    </li>
  );
}
