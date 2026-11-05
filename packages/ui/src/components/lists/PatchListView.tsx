// Ton-Patch: Input- und Output-Liste je Mischpult (automatisch aus dem Signalfluss, Angaben bearbeitbar).
import { RotateCcw } from 'lucide-react';
import { ICON } from '../icons';
import { useMemo, useState, type CSSProperties } from 'react';
import type * as Y from 'yjs';
import { buildPatchLists, contrastText, updatePatchEntry, viaText, type Library, type PatchRow } from '@steckplan/core';
import type { ProjectData } from '../../lib/useProjectData';
import { texts } from '../../texts';
import { Button, TextInput } from '../ui';

const t = texts.patch;
const c = t.columns;
const ONLY_USED_KEY = 'steckplan.patchOnlyUsed';

/** belegt = Quelle/Ziel gesteckt oder von Hand etwas eingetragen */
const isUsed = (row: PatchRow) => !!row.device || row.edited.name || !!row.notes;

const GROUP_FALLBACK = '#64748b';

/** Rahmen um direkt aufeinanderfolgende Zeilen derselben Gruppe */
interface Frame {
  color: string;
  name: string;
  first: boolean;
  last: boolean;
}

function frames(rows: PatchRow[]): (Frame | undefined)[] {
  return rows.map((row, i) => {
    const g = row.group;
    if (!g) return undefined;
    return { color: g.color ?? GROUP_FALLBACK, name: g.name, first: rows[i - 1]?.group?.id !== g.id, last: rows[i + 1]?.group?.id !== g.id };
  });
}

function readOnlyUsed(): boolean {
  try {
    return localStorage.getItem(ONLY_USED_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function PatchListView({ doc, origin, data, library, editable }: { doc: Y.Doc; origin: object; data: ProjectData; library: Library | null; editable: boolean }) {
  const lists = useMemo(() => (library ? buildPatchLists(data, library) : []), [data, library]);
  const [direction, setDirection] = useState<'inputs' | 'outputs'>('inputs');
  const [onlyUsed, setOnlyUsedState] = useState(readOnlyUsed);
  const setOnlyUsed = (v: boolean) => {
    setOnlyUsedState(v);
    try {
      localStorage.setItem(ONLY_USED_KEY, String(v));
    } catch {
      // ohne Speicher gilt die Auswahl nur bis zum Neuladen
    }
  };
  if (!library) return null;
  if (lists.length === 0) return <p className="mx-auto max-w-2xl p-6 text-center text-sm text-slate-500">{t.noMixer}</p>;
  const set = (id: string, patch: Parameters<typeof updatePatchEntry>[2]) => updatePatchEntry(doc, id, patch, origin);

  return (
    <div className="space-y-3 p-3" data-testid="patch-lists">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-slate-300 dark:border-slate-600" role="radiogroup" aria-label={texts.lists.patch}>
          {(['inputs', 'outputs'] as const).map((d) => (
            <button key={d} type="button" role="radio" aria-checked={direction === d} onClick={() => setDirection(d)} className={`px-3 py-2 text-sm ${direction === d ? 'bg-sky-600 text-white' : ''}`}>
              {t[d]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={onlyUsed} onChange={(e) => setOnlyUsed(e.target.checked)} />
          {t.onlyUsed}
        </label>
        <p className="flex-1 text-xs text-slate-500">{t.hint}</p>
      </div>
      {lists.map((list) => {
        const network = direction === 'inputs' ? list.network : [];
        const analog = list[direction];
        const shownNetwork = onlyUsed ? network.filter(isUsed) : network;
        const shownAnalog = onlyUsed ? analog.filter(isUsed) : analog;
        const all = network.length + analog.length;
        const hidden = all - shownNetwork.length - shownAnalog.length;
        const groupHeader = (label: string) => (
          <tr>
            <th colSpan={6} scope="rowgroup" className="bg-slate-50 px-2 py-1 text-left text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {label}
            </th>
          </tr>
        );
        return (
        <section key={list.mixer.id} className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" aria-label={list.mixer.label}>
          <header className="border-b border-slate-100 px-3 py-2 dark:border-slate-800">
            <h3 className="font-semibold">
              {list.mixer.label} <span className="text-sm font-normal text-slate-500">{list.mixerTemplate.name}</span>
            </h3>
          </header>
          {shownNetwork.length + shownAnalog.length === 0 ? (
            <p className="px-3 py-4 text-sm text-slate-500" data-testid="patch-nothing">
              {t.nothingUsed(all)}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] text-sm" data-testid={`patch-${direction}`}>
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="px-2 py-1 font-medium">{c.channel}</th>
                    <th className="px-2 py-1 font-medium">{c.name}</th>
                    <th className="px-2 py-1 font-medium">{direction === 'inputs' ? c.source : c.target}</th>
                    <th className="px-2 py-1 font-medium">{c.via}</th>
                    {direction === 'inputs' && <th className="px-2 py-1 font-medium">{c.phantom}</th>}
                    <th className="px-2 py-1 font-medium">{c.notes}</th>
                  </tr>
                </thead>
                {shownNetwork.length > 0 && (
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800" data-testid="patch-network">
                    {groupHeader(`${texts.netChannels.section} (${network.filter((r) => r.device).length}/${network.length})`)}
                    {(() => {
                      const f = frames(shownNetwork);
                      return shownNetwork.map((row, i) => <Row key={row.id} row={row} frame={f[i]} inputs editable={editable} onChange={(patch) => set(row.id, patch)} />);
                    })()}
                  </tbody>
                )}
                {shownAnalog.length > 0 && (
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800" data-testid="patch-analog">
                    {network.length > 0 && groupHeader(`${t.analog} (${analog.filter((r) => r.device).length}/${analog.length})`)}
                    {(() => {
                      const f = frames(shownAnalog);
                      return shownAnalog.map((row, i) => <Row key={row.id} row={row} frame={f[i]} inputs={direction === 'inputs'} editable={editable} onChange={(patch) => set(row.id, patch)} />);
                    })()}
                  </tbody>
                )}
              </table>
              {hidden > 0 && <p className="px-3 py-1.5 text-xs text-slate-500">{t.hidden(hidden)}</p>}
            </div>
          )}
        </section>
        );
      })}
    </div>
  );
}

function Row({ row, frame, inputs, editable, onChange }: { row: PatchRow; frame?: Frame; inputs: boolean; editable: boolean; onChange: (patch: Parameters<typeof updatePatchEntry>[2]) => void }) {
  const suggested = (edited: boolean) => (edited ? '' : 'italic text-slate-500');
  const cells = inputs ? 6 : 5;
  // Gruppe: Zeile leicht eingefärbt; Rahmen links/rechts an jeder Zeile, oben an der ersten, unten an der letzten
  const edge = `2px solid ${frame?.color}`;
  const cell = (i: number): CSSProperties | undefined =>
    frame
      ? {
          // ganze Zeile leicht in der Gruppenfarbe
          backgroundColor: `color-mix(in srgb, ${frame.color} 12%, transparent)`,
          ...(i === 0 ? { borderLeft: edge } : {}),
          ...(i === cells - 1 ? { borderRight: edge } : {}),
          ...(frame.first ? { borderTop: edge } : {}),
          ...(frame.last ? { borderBottom: edge } : {}),
        }
      : undefined;
  return (
    <tr className="align-top" data-testid="patch-row" data-group={row.group?.name}>
      <td className="px-2 py-1.5 whitespace-nowrap" style={cell(0)}>
        <span className="font-semibold tabular-nums">{row.channel}</span> <span className="text-xs text-slate-500">{row.port}</span>
      </td>
      <td className="px-2 py-1 min-w-40" style={cell(1)}>
        <TextInput
          aria-label={`${c.name} ${row.port}`}
          className={suggested(row.edited.name)}
          title={row.edited.name ? undefined : t.suggestion}
          value={row.name}
          disabled={!editable}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        {row.edited.name && editable && (
          <button type="button" className="text-xs text-slate-500 underline" onClick={() => onChange({ name: undefined })}>
            {t.reset}
          </button>
        )}
      </td>
      <td className="px-2 py-1.5" style={cell(2)}>
        {frame?.first && (
          <span className="mb-0.5 inline-block rounded px-1.5 text-xs font-semibold" style={{ backgroundColor: frame.color, color: contrastText(frame.color) }} data-testid="patch-group">
            {frame.name}
          </span>
        )}
        {row.device ? (
          <>
            <div className="font-medium">
              {row.device.label}
              {row.devicePort ? <span className="font-normal text-slate-500"> · {row.devicePort}</span> : null}
            </div>
            <div className="text-xs text-slate-500">
              {row.deviceTemplate}
              {row.person ? (
                <span className="ml-1 font-medium text-sky-700 dark:text-sky-300">
                  👤 {row.person}
                  {row.personKind ? <span className="font-normal"> ({row.personKind})</span> : null}
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <span className="text-amber-700 dark:text-amber-300">{t.open}</span>
        )}
      </td>
      <td className="px-2 py-1.5 text-xs text-slate-600 dark:text-slate-300" style={cell(3)}>
        {viaText({ via: row.via }) || '–'}
        {row.defects.length > 0 && (
          <div className="mt-0.5 font-semibold text-red-700 dark:text-red-400" data-testid="patch-defect">
            ✕ {texts.defects.patch}: {row.defects.join(', ')}
          </div>
        )}
      </td>
      {inputs && (
        <td className="px-2 py-1.5 text-center" style={cell(4)}>
          <input
            type="checkbox"
            aria-label={`${c.phantom} ${row.port}`}
            checked={row.phantom}
            disabled={!editable}
            className={row.edited.phantom ? '' : 'opacity-60'}
            title={row.edited.phantom ? undefined : t.suggestion}
            onChange={(e) => onChange({ phantom: e.target.checked })}
          />
          {row.edited.phantom && editable && (
            <Button variant="ghost" className="min-h-6 px-1 text-xs" aria-label={`${t.reset}: ${c.phantom} ${row.port}`} onClick={() => onChange({ phantom: undefined })}>
              <RotateCcw {...ICON} />
            </Button>
          )}
        </td>
      )}
      <td className="px-2 py-1 min-w-40" style={cell(cells - 1)}>
        <TextInput aria-label={`${c.notes} ${row.port}`} value={row.notes} disabled={!editable} onChange={(e) => onChange({ notes: e.target.value || undefined })} />
      </td>
    </tr>
  );
}
