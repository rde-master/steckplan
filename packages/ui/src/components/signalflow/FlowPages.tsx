// Seiten im Signalfluss: Reiter zum Umschalten, neue Seite, Seiten verwalten (umbenennen, Reihenfolge, löschen).
import { useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Plus, Settings2, Trash2 } from 'lucide-react';
import type * as Y from 'yjs';
import { addFlowPage, moveFlowPage, removeFlowPage, renameFlowPage, type FlowPage } from '@steckplan/core';
import { texts } from '../../texts';
import { ICON } from '../icons';
import { Button, Modal, TextInput } from '../ui';
import { selectClass } from '../library/fields';

const t = texts.flowPages;

export function FlowPagesBar({
  doc,
  origin,
  pages,
  current,
  counts,
  editable,
  onSelect,
}: {
  doc: Y.Doc;
  origin: object;
  pages: FlowPage[];
  current: string;
  counts: Map<string, number>;
  editable: boolean;
  onSelect: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-900 *:shrink-0" role="tablist" aria-label={t.title}>
      {pages.length === 0 ? (
        <span className="px-2 text-xs text-slate-500">{t.single}</span>
      ) : (
        pages.map((p) => (
          <Button key={p.id} role="tab" aria-selected={p.id === current} variant={p.id === current ? 'primary' : 'ghost'} className="min-h-8 py-1" onClick={() => onSelect(p.id)}>
            {p.name || t.unnamed} <span className="text-xs opacity-70">({counts.get(p.id) ?? 0})</span>
          </Button>
        ))
      )}
      {editable && (
        <>
          <Button variant="ghost" className="min-h-8 py-1 text-xs" onClick={() => setAdding(true)}>
            <Plus {...ICON} /> {t.add}
          </Button>
          {pages.length > 0 && (
            <Button variant="ghost" className="min-h-8 py-1 text-xs" onClick={() => setManaging(true)}>
              <Settings2 {...ICON} /> {t.manage}
            </Button>
          )}
        </>
      )}
      {adding && (
        <NewPageDialog
          firstPage={pages.length === 0}
          onClose={() => setAdding(false)}
          onCreate={(name, existingName) => {
            // Erste Seite: vorhandene Geräte bekommen ihre eigene Seite (Name wählbar), dann die neue
            if (pages.length === 0 && existingName !== null) addFlowPage(doc, existingName, origin);
            const page = addFlowPage(doc, name, origin);
            onSelect(page.id);
            setAdding(false);
          }}
        />
      )}
      {managing && <ManagePagesDialog doc={doc} origin={origin} pages={pages} counts={counts} onClose={() => setManaging(false)} />}
    </div>
  );
}

function NewPageDialog({ firstPage, onClose, onCreate }: { firstPage: boolean; onClose: () => void; onCreate: (name: string, existingName: string | null) => void }) {
  const [name, setName] = useState('');
  const [existing, setExisting] = useState<string>(t.defaultExisting);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim(), firstPage ? existing.trim() || t.defaultExisting : null);
  }
  return (
    <Modal title={t.newTitle} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-500">{t.name}</span>
          <TextInput autoFocus value={name} placeholder={t.namePlaceholder} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </label>
        {firstPage && (
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-slate-500">{t.existingName}</span>
            <TextInput value={existing} maxLength={60} onChange={(e) => setExisting(e.target.value)} />
            <span className="mt-1 block text-xs text-slate-500">{t.existingHint}</span>
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{texts.common.cancel}</Button>
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            {t.create}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ManagePagesDialog({ doc, origin, pages, counts, onClose }: { doc: Y.Doc; origin: object; pages: FlowPage[]; counts: Map<string, number>; onClose: () => void }) {
  const [deleting, setDeleting] = useState<FlowPage | null>(null);
  const [moveTo, setMoveTo] = useState('');
  return (
    <Modal title={t.manageTitle} onClose={onClose}>
      <ul className="space-y-2" data-testid="flow-pages">
        {pages.map((p, i) => (
          <li key={p.id} className="flex items-center gap-1">
            <TextInput aria-label={`${t.name}: ${p.name}`} value={p.name} maxLength={60} onChange={(e) => renameFlowPage(doc, p.id, e.target.value, origin)} />
            <span className="w-16 shrink-0 text-center text-xs text-slate-500">{t.devices(counts.get(p.id) ?? 0)}</span>
            <Button variant="ghost" className="px-2" aria-label={`${t.up}: ${p.name}`} disabled={i === 0} onClick={() => moveFlowPage(doc, p.id, -1, origin)}>
              <ArrowUp {...ICON} />
            </Button>
            <Button variant="ghost" className="px-2" aria-label={`${t.down}: ${p.name}`} disabled={i === pages.length - 1} onClick={() => moveFlowPage(doc, p.id, 1, origin)}>
              <ArrowDown {...ICON} />
            </Button>
            <Button
              variant="ghost"
              className="px-2"
              aria-label={`${texts.common.delete}: ${p.name}`}
              disabled={pages.length < 2}
              onClick={() => {
                setDeleting(p);
                setMoveTo(pages.find((x) => x.id !== p.id)?.id ?? '');
              }}
            >
              <Trash2 {...ICON} />
            </Button>
          </li>
        ))}
      </ul>
      {deleting && (
        <div className="mt-3 space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950">
          <div>{t.deleteText(deleting.name, counts.get(deleting.id) ?? 0)}</div>
          <select className={selectClass} aria-label={t.moveTo} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
            {pages
              .filter((p) => p.id !== deleting.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          <div className="flex gap-2">
            <Button
              variant="danger"
              onClick={() => {
                removeFlowPage(doc, deleting.id, moveTo, origin);
                setDeleting(null);
              }}
            >
              {t.deleteConfirm}
            </Button>
            <Button onClick={() => setDeleting(null)}>{texts.common.cancel}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
