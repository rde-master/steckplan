// Dialog „Exportieren“: Dokumentart, Format, Optionen → PDF oder CSV.
import { ArrowDownAZ, ArrowDownZA, Download } from 'lucide-react';
import { ICON } from './icons';
import { useState } from 'react';
import { ExportPreview } from './ExportPreview';
import { can, formatAppTitle, isFilterActive, sortPages, VERSION, type GroupBy, type Issue, type Library, type ProjectMeta } from '@steckplan/core';
import { api, errorMessage } from '../lib/api';
import { useEditor } from '../lib/editor';
import { useSession } from '../lib/session';
import type { ProjectData } from '../lib/useProjectData';
import { LABEL_FORMATS } from '../pdf/documents';
import { buildCsv, buildExportDoc, CSV_KINDS, DEFAULT_OPTIONS, EXPORT_TITLES, exportFileName, MAX_SORT_LEVELS, SORT_COLUMNS, type ExportKind, type ExportOptions } from '../pdf/export';
import type { SortKey } from '../pdf/sorting';
import { texts } from '../texts';
import { Banner, Button, Modal } from './ui';
import { selectClass } from './library/fields';

const e = texts.exportDialog;

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const DEFAULT_ORIENTATION: Record<ExportKind, 'portrait' | 'landscape'> = {
  stageplan: 'landscape',
  signalflow: 'landscape',
  packing: 'landscape',
  cases: 'portrait',
  patch: 'landscape',
  power: 'landscape',
  cables: 'landscape',
  bom: 'portrait',
  dmx: 'portrait',
  devices: 'landscape',
  network: 'portrait',
  people: 'landscape',
  labels: 'portrait',
  wifi: 'portrait',
};

export function ExportDialog({
  projectId,
  data,
  library,
  meta,
  issues,
  onClose,
}: {
  projectId: string;
  data: ProjectData;
  library: Library;
  meta: Partial<ProjectMeta>;
  issues: Issue[];
  onClose: () => void;
}) {
  const [opts, setOpts] = useState<ExportOptions>({ ...DEFAULT_OPTIONS, wifiIds: data.network.wifi.map((w) => w.id) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filter = useEditor((s) => s.filter);
  const colorMode = useEditor((s) => s.colorMode);
  const session = useSession((s) => s.session);
  const canSeeSecrets = !!session && can(session.access, 'viewSecrets');
  const set = (patch: Partial<ExportOptions>) => setOpts((o) => ({ ...o, ...patch }));

  /** PDF-Definition wie beim Herunterladen (auch für die Vorschau) */
  async function makeDoc() {
    const passwords = opts.kind === 'wifi' && canSeeSecrets && opts.printPassword ? Object.fromEntries((await api.getSecrets(projectId)).wifiPasswords.map((w) => [w.wifiId, w.password])) : undefined;
    return buildExportDoc(opts, {
      data,
      library,
      meta,
      filter,
      colorMode,
      issues,
      appTitle: formatAppTitle(VERSION),
      by: session?.name ?? '',
      fetchQr: async (wifiId) => (await fetch(api.wifiQrUrl(projectId, wifiId, String(Date.now())))).text(),
      ...(passwords ? { passwords } : {}),
    });
  }

  async function createPdf() {
    setBusy(true);
    setError(null);
    try {
      const doc = await makeDoc();
      const { createPdfBlob } = await import('../pdf/generate');
      download(await createPdfBlob(doc), exportFileName(meta, opts.kind, 'pdf'));
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function createCsv() {
    const csv = buildCsv(opts.kind, data, library, filter, opts.sort);
    download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), exportFileName(meta, opts.kind, 'csv'));
  }

  const kinds = Object.keys(EXPORT_TITLES) as ExportKind[];
  const field = (label: string, child: React.ReactNode) => (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      {child}
    </label>
  );

  return (
    <Modal
      title={e.title}
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>{texts.common.cancel}</Button>
          {CSV_KINDS.includes(opts.kind) && <Button onClick={createCsv}><Download {...ICON} /> CSV</Button>}
          <Button variant="primary" onClick={() => void createPdf()} disabled={busy || (opts.kind === 'wifi' && opts.wifiIds.length === 0)}>
            {busy ? e.busy : <><Download {...ICON} /> PDF</>}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <div className="space-y-3">
        {field(
          e.document,
          <select className={selectClass} aria-label={e.document} value={opts.kind} onChange={(ev) => set({ kind: ev.target.value as ExportKind, orientation: DEFAULT_ORIENTATION[ev.target.value as ExportKind], sort: [] })}>
            {kinds.map((k) => (
              <option key={k} value={k} disabled={k === 'wifi' && data.network.wifi.length === 0}>
                {EXPORT_TITLES[k]}
              </option>
            ))}
          </select>,
        )}
        <div className="grid grid-cols-2 gap-2">
          {field(
            e.format,
            <select className={selectClass} aria-label={e.format} value={opts.format} onChange={(ev) => set({ format: ev.target.value as 'A4' | 'A3' })}>
              <option value="A4">A4</option>
              <option value="A3">A3</option>
            </select>,
          )}
          {field(
            e.orientation,
            <select className={selectClass} aria-label={e.orientation} value={opts.orientation} onChange={(ev) => set({ orientation: ev.target.value as 'portrait' | 'landscape' })}>
              <option value="portrait">{e.portrait}</option>
              <option value="landscape">{e.landscape}</option>
            </select>,
          )}
        </div>

        {opts.kind === 'stageplan' && (
          <div className="space-y-2">
            {field(
              e.scale,
              <select className={selectClass} aria-label={e.scale} value={String(opts.scale)} onChange={(ev) => set({ scale: ev.target.value === 'fill' ? 'fill' : (Number(ev.target.value) as 50 | 100) })}>
                <option value="50">1:50</option>
                <option value="100">1:100</option>
                <option value="fill">{e.fill}</option>
              </select>,
            )}
            <p className="text-xs text-slate-500">{e.tilesHint}</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={opts.includeBackground} onChange={(ev) => set({ includeBackground: ev.target.checked })} />
              {e.background}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={opts.showCables} onChange={(ev) => set({ showCables: ev.target.checked })} />
              {e.cables}
            </label>
            {data.groups.length > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={opts.showGroups} onChange={(ev) => set({ showGroups: ev.target.checked })} />
                {e.groups}
              </label>
            )}
          </div>
        )}

        {opts.kind === 'packing' && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {field(
                e.groupBy,
                <select className={selectClass} aria-label={e.groupBy} value={opts.groupBy} onChange={(ev) => set({ groupBy: ev.target.value as GroupBy, thenBy: opts.thenBy === ev.target.value ? '' : opts.thenBy })}>
                  {(['category', 'trailer', 'case', 'owner'] as const).map((g) => (
                    <option key={g} value={g}>
                      {texts.packing.groups[g]}
                    </option>
                  ))}
                </select>,
              )}
              {field(
                e.thenBy,
                <select className={selectClass} aria-label={e.thenBy} value={opts.thenBy} onChange={(ev) => set({ thenBy: ev.target.value as GroupBy | '' })}>
                  <option value="">–</option>
                  {(['category', 'trailer', 'case', 'owner'] as const)
                    .filter((g) => g !== opts.groupBy)
                    .map((g) => (
                      <option key={g} value={g}>
                        {texts.packing.groups[g]}
                      </option>
                    ))}
                </select>,
              )}
            </div>
            <div className="flex gap-4 text-sm" role="radiogroup" aria-label={e.mode}>
              {(['aggregated', 'single'] as const).map((m) => (
                <label key={m} className="flex items-center gap-1.5">
                  <input type="radio" name="pack-mode" checked={opts.mode === m} onChange={() => set({ mode: m })} />
                  {m === 'aggregated' ? e.aggregated : e.single}
                </label>
              ))}
            </div>
            {field(
              texts.packing.sortBy,
              <select className={selectClass} aria-label={texts.packing.sortBy} value={opts.sortBy} onChange={(ev) => set({ sortBy: ev.target.value as 'name' | 'case' })}>
                <option value="name">{texts.packing.sort.name}</option>
                <option value="case">{texts.packing.sort.case}</option>
              </select>,
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={opts.showChecks} onChange={(ev) => set({ showChecks: ev.target.checked })} />
              {e.showChecks}
            </label>
          </div>
        )}

        {opts.kind === 'cases' && (
          <div className="space-y-2">
            <div className="flex gap-4 text-sm" role="radiogroup" aria-label={e.mode}>
              {(['aggregated', 'single'] as const).map((m) => (
                <label key={m} className="flex items-center gap-1.5">
                  <input type="radio" name="case-mode" checked={opts.mode === m} onChange={() => set({ mode: m })} />
                  {m === 'aggregated' ? e.aggregated : e.single}
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={opts.showChecks} onChange={(ev) => set({ showChecks: ev.target.checked })} />
              {e.showChecks}
            </label>
            <p className="text-xs text-slate-500">{e.casesHint}</p>
          </div>
        )}

        {opts.kind === 'labels' && (
          <div className="space-y-2">
            {field(
              e.labelFormat,
              <select className={selectClass} aria-label={e.labelFormat} value={opts.labelFormat} onChange={(ev) => set({ labelFormat: ev.target.value })}>
                {LABEL_FORMATS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>,
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={opts.cutLines} onChange={(ev) => set({ cutLines: ev.target.checked })} />
              {e.cutLines}
            </label>
            <p className="text-xs text-slate-500">{e.labelsHint}</p>
          </div>
        )}

        {opts.kind === 'wifi' && (
          <div className="space-y-2">
            <div className="text-xs text-slate-500">{e.wifiNetworks}</div>
            {data.network.wifi.map((w) => (
              <label key={w.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={opts.wifiIds.includes(w.id)} onChange={(ev) => set({ wifiIds: ev.target.checked ? [...opts.wifiIds, w.id] : opts.wifiIds.filter((x) => x !== w.id) })} />
                {w.ssid}
              </label>
            ))}
            {canSeeSecrets ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={opts.printPassword} onChange={(ev) => set({ printPassword: ev.target.checked })} />
                {e.printPassword}
              </label>
            ) : (
              <p className="text-xs text-slate-500">{e.noPassword}</p>
            )}
          </div>
        )}

        {opts.kind === 'signalflow' && data.flowPages.length > 1 && (
          <div className="space-y-1" role="group" aria-label={e.flowPages}>
            <div className="text-xs text-slate-500">{e.flowPages}</div>
            {sortPages(data.flowPages).map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={opts.flowPageIds.length === 0 || opts.flowPageIds.includes(p.id)}
                  onChange={(ev) => {
                    const all = sortPages(data.flowPages).map((x) => x.id);
                    const current = opts.flowPageIds.length === 0 ? all : opts.flowPageIds;
                    const next = ev.target.checked ? [...current, p.id] : current.filter((x) => x !== p.id);
                    set({ flowPageIds: next.length === all.length ? [] : next.length === 0 ? current : all.filter((x) => next.includes(x)) });
                  }}
                />
                {p.name}
              </label>
            ))}
          </div>
        )}

        {SORT_COLUMNS[opts.kind] && <SortFields columns={SORT_COLUMNS[opts.kind]!} value={opts.sort} onChange={(sort) => set({ sort })} />}

        {isFilterActive(filter) && opts.kind !== 'wifi' && <Banner tone="info">{e.filterActive}</Banner>}
        {error && <Banner tone="error">{error}</Banner>}
      </div>
      <ExportPreview
        makeDoc={makeDoc}
        {...(CSV_KINDS.includes(opts.kind) ? { makeCsv: () => buildCsv(opts.kind, data, library, filter, opts.sort) } : {})}
        version={JSON.stringify({ opts, filter, colorMode, n: data.devices.length + data.cables.length })}
      />
      </div>
    </Modal>
  );
}

/** Sortierung: bis zu drei Spalten, je auf- oder absteigend („Standard“ = bisherige Reihenfolge) */
function SortFields({ columns, value, onChange }: { columns: string[]; value: SortKey[]; onChange: (sort: SortKey[]) => void }) {
  const levels = Math.min(MAX_SORT_LEVELS, value.length + 1);
  const setLevel = (index: number, key: SortKey | null) => {
    const next = value.slice(0, index);
    if (key) next.push(key, ...value.slice(index + 1).filter((k) => k.column !== key.column));
    onChange(next);
  };
  return (
    <div className="space-y-1.5" role="group" aria-label={e.sortTitle}>
      <div className="text-xs text-slate-500">{e.sortTitle}</div>
      {Array.from({ length: levels }, (_, i) => {
        const key = value[i];
        const used = new Set(value.filter((_, j) => j !== i).map((k) => k.column));
        const label = i === 0 ? e.sortBy : e.thenBy;
        return (
          <div key={i} className="flex items-center gap-1">
            <select
              className={selectClass}
              aria-label={`${label} (${i + 1})`}
              value={key?.column ?? ''}
              onChange={(ev) => setLevel(i, ev.target.value ? { column: ev.target.value, ...(key?.desc ? { desc: true } : {}) } : null)}
            >
              <option value="">{i === 0 ? e.sortDefault : '–'}</option>
              {columns
                .filter((c) => !used.has(c))
                .map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
            </select>
            <Button
              variant="ghost"
              className="px-2"
              disabled={!key}
              aria-label={key?.desc ? `${e.descending} (${i + 1})` : `${e.ascending} (${i + 1})`}
              title={key?.desc ? e.descending : e.ascending}
              onClick={() => key && setLevel(i, { column: key.column, ...(key.desc ? {} : { desc: true }) })}
            >
              {key?.desc ? <ArrowDownZA {...ICON} /> : <ArrowDownAZ {...ICON} />}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
