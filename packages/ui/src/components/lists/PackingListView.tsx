// Packliste zum Abhaken (Desktop, Browser, Handy): Hin/Zurück, fehlt/defekt, Zähler bei zusammengefassten Zeilen.
import { createContext, useContext, useMemo, useState } from 'react';
import {
  buildCaseLists,
  buildPackingList,
  formatCableLength,
  nextUnchecked,
  packItems,
  deviceMatches,
  cableMatches,
  type CheckMark,
  type GroupBy,
  type Library,
  type PackGroup,
  type PackItem,
  type PackRow,
  masterLabel,
} from '@steckplan/core';
import { api, errorMessage } from '../../lib/api';
import { useEditor } from '../../lib/editor';
import { formatDateTime } from '../../lib/format';
import type { ProjectData } from '../../lib/useProjectData';
import { texts } from '../../texts';
import { Banner, Button, Modal, TextInput } from '../ui';
import { selectClass } from '../library/fields';

const p = texts.packing;
type Direction = 'out' | 'in';

/** Zusatzangaben je Exemplar: Kategorie · Besitzer · Anhänger · Case (und Person) */
const InfoContext = createContext<(item: PackItem) => { meta: string; person?: string }>(() => ({ meta: '' }));

function ItemInfo({ item }: { item: PackItem }) {
  const info = useContext(InfoContext)(item);
  if (!info.meta && !info.person) return null;
  return (
    <div className="text-xs text-slate-500 dark:text-slate-400" data-testid="pack-info">
      {info.person && <span className="font-medium text-sky-700 dark:text-sky-300">{info.person}</span>}
      {info.person && info.meta ? ' · ' : ''}
      {info.meta}
    </div>
  );
}

interface Props {
  projectId: string;
  data: ProjectData;
  library: Library | null;
  canCheck: boolean;
  canReset: boolean;
  /** packing = Packliste (Standard), cases = je Case was hinein muss */
  view?: 'packing' | 'cases';
}

export function PackingListView({ projectId, data, library, canCheck, canReset, view = 'packing' }: Props) {
  const [groupBy, setGroupBy] = useState<GroupBy>('category');
  const [sortBy, setSortBy] = useState<'name' | 'case'>('name');
  const [thenBy, setThenBy] = useState<GroupBy | ''>('');
  const [mode, setMode] = useState<'aggregated' | 'single'>('aggregated');
  const [error, setError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const filter = useEditor((s) => s.filter);
  const templates = useMemo(() => new Map((library?.templates ?? []).map((t) => [t.id, t])), [library]);

  const items = useMemo(() => {
    if (!library) return [];
    const devices = new Map(data.devices.map((d) => [d.id, d]));
    const cables = new Map(data.cables.map((c) => [c.id, c]));
    const project = {
      devices: data.devices,
      cables: data.cables,
      settings: { gridMm: 500, snap: true, defaultReservePercent: 10, defaultReservePerEndMm: 500, ...data.settings },
      people: data.people,
      caseTrailers: data.caseTrailers,
    };
    return packItems(project, library).filter((item) => {
      const d = devices.get(item.id);
      const ctx = { caseTrailers: data.caseTrailers, cases: library.masterData.cases };
      if (d) return deviceMatches(filter, d, templates.get(d.templateId), ctx);
      const c = cables.get(item.id);
      return c ? cableMatches(filter, c, templates.get(c.templateId ?? ''), ctx) : true;
    });
  }, [data, library, filter, templates]);

  const info = useMemo(
    () => (item: PackItem) => ({
      meta: library
        ? [
            masterLabel(library, 'categories', item.categoryId),
            masterLabel(library, 'owners', item.ownerId),
            masterLabel(library, 'trailers', item.trailerId),
            item.caseId ? `${p.inCase} ${masterLabel(library, 'cases', item.caseId)}` : '',
          ]
            .filter(Boolean)
            .join(' · ')
        : '',
      ...(item.person ? { person: item.person } : {}),
    }),
    [library],
  );

  const list = useMemo(
    () => (library ? buildPackingList(items, library, { groupBy: thenBy ? [groupBy, thenBy] : [groupBy], mode, sortBy }) : null),
    [items, library, groupBy, thenBy, mode, sortBy],
  );
  const caseLists = useMemo(() => (library ? buildCaseLists(items, library, { mode, caseTrailers: data.caseTrailers }) : []), [items, library, mode, data.caseTrailers]);

  async function check(item: PackItem, direction: Direction, status: CheckMark['status'] | null, note?: string) {
    setError(null);
    try {
      await api.check(projectId, { kind: item.kind === 'cable' && data.cables.some((c) => c.id === item.id) ? 'cable' : 'device', id: item.id, direction, status, ...(note !== undefined ? { note } : {}) });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!list) return null;
  const done = { out: items.filter((i) => i.check?.out).length, in: items.filter((i) => i.check?.in).length };

  if (view === 'cases') {
    return (
      <InfoContext.Provider value={info}>
        <div className="mx-auto w-full max-w-4xl space-y-3 p-3" data-testid="case-lists">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex rounded-md border border-slate-300 dark:border-slate-600" role="radiogroup" aria-label={p.view}>
              {(['aggregated', 'single'] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`px-3 py-2 text-sm ${mode === m ? 'bg-sky-600 text-white' : ''}`}>
                  {p.modes[m]}
                </button>
              ))}
            </div>
          </div>
          {!canCheck && <Banner tone="info">{p.cannotCheck}</Banner>}
          {error && <Banner tone="error">{error}</Banner>}
          {caseLists.length === 0 && <p className="py-8 text-center text-sm text-slate-500">{p.noCases}</p>}
          {caseLists.map((c) => (
            <section key={c.caseId} className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" aria-label={c.name}>
              <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                {c.color && <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: c.color }} />}
                <h3 className="font-semibold">{c.name}</h3>
                <span className="text-sm text-slate-500">
                  {c.trailerId ? `→ ${masterLabel(library!, 'trailers', c.trailerId)}` : p.groupsUnassigned.trailer}
                  {c.notes ? ` · ${c.notes}` : ''}
                </span>
                <span className="ml-auto text-xs text-slate-500 tabular-nums" data-testid="case-progress">
                  {p.progress(c.checkedOut, c.checkedIn, c.total)}
                </span>
              </header>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {c.rows.map((row) =>
                  mode === 'aggregated' ? (
                    <AggregatedRow key={row.key} row={row} canCheck={canCheck} onCheck={check} />
                  ) : (
                    <ItemRow key={row.key} item={row.items[0]!} title canCheck={canCheck} onCheck={check} />
                  ),
                )}
              </ul>
            </section>
          ))}
        </div>
      </InfoContext.Provider>
    );
  }

  return (
    <InfoContext.Provider value={info}>
    <div className="mx-auto w-full max-w-4xl space-y-3 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="block text-xs text-slate-500">{p.groupBy}</span>
          <select className={`${selectClass} w-auto`} value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} aria-label={p.groupBy}>
            {(['category', 'trailer', 'case', 'owner'] as const).map((g) => (
              <option key={g} value={g}>
                {p.groups[g]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs text-slate-500">{p.thenBy}</span>
          <select className={`${selectClass} w-auto`} value={thenBy} onChange={(e) => setThenBy(e.target.value as GroupBy | '')} aria-label={p.thenBy}>
            <option value="">–</option>
            {(['category', 'trailer', 'case', 'owner'] as const)
              .filter((g) => g !== groupBy)
              .map((g) => (
                <option key={g} value={g}>
                  {p.groups[g]}
                </option>
              ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs text-slate-500">{p.sortBy}</span>
          <select className={`${selectClass} w-auto`} value={sortBy} onChange={(e) => setSortBy(e.target.value as 'name' | 'case')} aria-label={p.sortBy}>
            <option value="name">{p.sort.name}</option>
            <option value="case">{p.sort.case}</option>
          </select>
        </label>
        <div className="flex rounded-md border border-slate-300 dark:border-slate-600" role="radiogroup" aria-label={p.view}>
          {(['aggregated', 'single'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`px-3 py-2 text-sm ${mode === m ? 'bg-sky-600 text-white' : ''}`}>
              {p.modes[m]}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="text-sm text-slate-600 dark:text-slate-300" data-testid="packing-progress">
          {p.progress(done.out, done.in, items.length)}
        </div>
        {canReset && (
          <Button variant="ghost" onClick={() => setResetOpen(true)}>
            ↺ {p.reset}
          </Button>
        )}
      </div>
      {!canCheck && <Banner tone="info">{p.cannotCheck}</Banner>}
      {error && <Banner tone="error">{error}</Banner>}
      {items.length === 0 && <p className="py-8 text-center text-sm text-slate-500">{p.empty}</p>}
      {list.groups.map((group) => (
        <GroupView key={group.key} group={group} depth={0} mode={mode} canCheck={canCheck} onCheck={check} />
      ))}
      {list.problems.length > 0 && (
        <section className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950" data-testid="problems">
          <h3 className="mb-2 font-semibold text-red-900 dark:text-red-100">{p.problems}</h3>
          <ul className="space-y-1 text-sm">
            {list.problems.map(({ item, direction, mark }) => (
              <li key={`${item.id}-${direction}`}>
                <strong>{mark.status === 'missing' ? p.missing : p.damaged}</strong> ({direction === 'out' ? p.out : p.in}): {item.name}
                {item.label ? ` – ${item.label}` : ''}
                {item.inventoryNo ? ` (${item.inventoryNo})` : ''}
                {mark.note ? ` · „${mark.note}“` : ''} <span className="text-xs text-slate-500">· {mark.by}, {formatDateTime(mark.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {resetOpen && (
        <Modal title={p.resetTitle} onClose={() => setResetOpen(false)}>
          <p className="mb-3 text-sm">{p.resetText}</p>
          <div className="flex flex-wrap gap-2">
            {(['out', 'in', 'both'] as const).map((d) => (
              <Button
                key={d}
                variant={d === 'both' ? 'danger' : 'secondary'}
                onClick={async () => {
                  setResetOpen(false);
                  try {
                    await api.resetChecks(projectId, d);
                  } catch (err) {
                    setError(errorMessage(err));
                  }
                }}
              >
                {p.resetOptions[d]}
              </Button>
            ))}
          </div>
        </Modal>
      )}
    </div>
    </InfoContext.Provider>
  );
}

function GroupView({ group, depth, mode, canCheck, onCheck }: { group: PackGroup; depth: number; mode: 'aggregated' | 'single'; canCheck: boolean; onCheck: (item: PackItem, d: Direction, s: CheckMark['status'] | null, note?: string) => void }) {
  const count = (g: PackGroup): number => g.rows.reduce((n, r) => n + r.items.length, 0) + g.groups.reduce((n, sub) => n + count(sub), 0);
  return (
    <section className={depth === 0 ? 'rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900' : 'border-t border-slate-100 dark:border-slate-800'} aria-label={group.label}>
      <h3 className={`flex items-center gap-2 px-3 py-2 ${depth === 0 ? 'text-base font-semibold' : 'text-sm font-medium text-slate-600 dark:text-slate-300'}`}>
        {group.color && <span className="h-3.5 w-3.5 rounded border border-slate-300" style={{ backgroundColor: group.color }} />}
        <span className={group.unassigned ? 'italic' : ''}>{group.label}</span>
        <span className="text-xs font-normal text-slate-400">({count(group)})</span>
      </h3>
      {group.rows.length > 0 && (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {group.rows.map((row) => (mode === 'aggregated' ? <AggregatedRow key={row.key} row={row} canCheck={canCheck} onCheck={onCheck} /> : <ItemRow key={row.key} item={row.items[0]!} title canCheck={canCheck} onCheck={onCheck} />))}
        </ul>
      )}
      {group.groups.map((sub) => (
        <div key={sub.key} className="pl-3">
          <GroupView group={sub} depth={depth + 1} mode={mode} canCheck={canCheck} onCheck={onCheck} />
        </div>
      ))}
    </section>
  );
}

function rowTitle(row: PackRow): string {
  return `${row.name}${row.lengthMm ? ` ${formatCableLength(row.lengthMm)}` : ''}`;
}

function AggregatedRow({ row, canCheck, onCheck }: { row: PackRow; canCheck: boolean; onCheck: (item: PackItem, d: Direction, s: CheckMark['status'] | null, note?: string) => void }) {
  const [open, setOpen] = useState(false);
  const n = row.items.length;
  const counter = (direction: Direction) => {
    const checked = direction === 'out' ? row.checkedOut : row.checkedIn;
    const complete = checked === n;
    return (
      <button
        type="button"
        disabled={!canCheck || complete}
        onClick={() => {
          const next = nextUnchecked(row, direction);
          if (next) onCheck(next, direction, 'ok');
        }}
        aria-label={`${direction === 'out' ? p.out : p.in}: ${rowTitle(row)} – ${checked} von ${n}`}
        className={`min-h-11 min-w-24 rounded-md border px-3 text-sm font-medium tabular-nums ${complete ? 'border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900 dark:text-emerald-100' : 'border-slate-300 bg-white hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800'} disabled:cursor-default`}
      >
        {complete ? '✓ ' : '☐ '}
        {direction === 'out' ? p.out : p.in} {checked}/{n}
      </button>
    );
  };
  return (
    <li data-testid="pack-row">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="text-slate-400">{open ? '▾' : '▸'}</span>
          <span className="font-semibold tabular-nums">{n} ×</span>
          <span className="min-w-0">
            <span className="block truncate">{rowTitle(row)}</span>
            <ItemInfo item={{ ...row.items[0]!, person: [...new Set(row.items.map((i) => i.person).filter(Boolean))].join(', ') || undefined }} />
          </span>
        </button>
        {counter('out')}
        {counter('in')}
      </div>
      {open && (
        <ul className="border-t border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
          {row.items.map((item) => (
            <ItemRow key={item.id} item={item} canCheck={canCheck} onCheck={onCheck} />
          ))}
        </ul>
      )}
    </li>
  );
}

function ItemRow({ item, title = false, canCheck, onCheck }: { item: PackItem; title?: boolean; canCheck: boolean; onCheck: (item: PackItem, d: Direction, s: CheckMark['status'] | null, note?: string) => void }) {
  return (
    <li className="flex flex-wrap items-start gap-2 px-3 py-2" data-testid="pack-item">
      <div className="min-w-40 flex-1 text-sm">
        <div className={title ? 'font-medium' : ''}>
          {title ? `${item.name}${item.lengthMm ? ` ${formatCableLength(item.lengthMm)}` : ''}` : ''}
          {title && item.label ? ' – ' : ''}
          {item.label || (title ? '' : item.name)}
        </div>
        <div className="text-xs text-slate-500">{[item.route, item.inventoryNo, item.carrier && `${p.at} ${item.carrier}`, item.notes].filter(Boolean).join(' · ')}</div>
        {title && <ItemInfo item={item} />}
        {!title && item.person && <div className="text-xs font-medium text-sky-700 dark:text-sky-300">{item.person}</div>}
      </div>
      <CheckControl item={item} direction="out" canCheck={canCheck} onCheck={onCheck} />
      <CheckControl item={item} direction="in" canCheck={canCheck} onCheck={onCheck} />
    </li>
  );
}

function CheckControl({ item, direction, canCheck, onCheck }: { item: PackItem; direction: Direction; canCheck: boolean; onCheck: (item: PackItem, d: Direction, s: CheckMark['status'] | null, note?: string) => void }) {
  const mark = item.check?.[direction];
  const [note, setNote] = useState(mark?.note ?? '');
  const [lastNote, setLastNote] = useState(mark?.note);
  if (mark?.note !== lastNote) {
    setLastNote(mark?.note);
    setNote(mark?.note ?? '');
  }
  const label = `${direction === 'out' ? p.out : p.in}: ${item.label || item.name}`;
  const btn = (status: CheckMark['status'], text: string, tone: string) => (
    <button
      type="button"
      disabled={!canCheck}
      aria-pressed={mark?.status === status}
      aria-label={`${label} – ${text}`}
      onClick={() => onCheck(item, direction, mark?.status === status ? null : status)}
      className={`min-h-10 rounded px-2 text-xs ${mark?.status === status ? tone : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300'} border border-slate-200 dark:border-slate-700`}
    >
      {text}
    </button>
  );
  return (
    <div className="w-full space-y-1 sm:w-60" role="group" aria-label={label}>
      <div className="flex items-center gap-1">
        <span className="w-12 text-xs text-slate-500">{direction === 'out' ? p.out : p.in}</span>
        {btn('ok', '✓', 'bg-emerald-600 text-white')}
        {btn('missing', p.missing, 'bg-red-600 text-white')}
        {btn('damaged', p.damaged, 'bg-amber-500 text-white')}
      </div>
      {mark && <div className="pl-12 text-[11px] text-slate-500">{mark.by}, {formatDateTime(mark.at)}</div>}
      {mark && mark.status !== 'ok' && (
        <div className="pl-12">
          <TextInput
            aria-label={`${label} – ${p.note}`}
            placeholder={p.note}
            value={note}
            disabled={!canCheck}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note !== (mark.note ?? '') && onCheck(item, direction, mark.status, note)}
            className="py-1 text-xs"
          />
        </div>
      )}
    </div>
  );
}
