// Kabelliste mit berechneten Längen und Zusammenfassung je Kabeltyp und Länge.
import { useMemo } from 'react';
import { buildCableList, cableMatches, deviceMatches, formatCableLength, formatMeters, type Library } from '@steckplan/core';
import { useEditor } from '../../lib/editor';
import { masterName } from '../../lib/library';
import type { ProjectData } from '../../lib/useProjectData';
import { texts } from '../../texts';

const c = texts.cableList;

export function CableListView({ data, library }: { data: ProjectData; library: Library | null }) {
  const filter = useEditor((s) => s.filter);
  const rows = useMemo(() => {
    if (!library) return [];
    const templates = new Map(library.templates.map((t) => [t.id, t]));
    const settings = { gridMm: 500, snap: true, defaultReservePercent: 10, defaultReservePerEndMm: 500, ...data.settings };
    return buildCableList({ devices: data.devices, cables: data.cables, settings }, library).filter((row) => {
      const cable = data.cables.find((x) => x.id === row.id);
      if (cable) return cableMatches(filter, cable, templates.get(cable.templateId ?? ''));
      const device = data.devices.find((d) => d.id === row.id);
      return device ? deviceMatches(filter, device, templates.get(device.templateId)) : true;
    });
  }, [data, library, filter]);

  const summary = useMemo(() => {
    const map = new Map<string, { type: string; length: number | null | undefined; count: number }>();
    for (const r of rows) {
      const key = `${r.typeName}|${r.length.chosenMm ?? ''}`;
      const entry = map.get(key) ?? { type: r.typeName, length: r.length.chosenMm, count: 0 };
      entry.count++;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => a.type.localeCompare(b.type, 'de') || (a.length ?? 0) - (b.length ?? 0));
  }, [rows]);

  if (rows.length === 0) return <p className="p-8 text-center text-sm text-slate-500">{c.empty}</p>;
  return (
    <div className="space-y-4 p-3">
      <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900" data-testid="cable-summary">
        <h3 className="mb-2 text-sm font-semibold">{c.summary}</h3>
        <ul className="flex flex-wrap gap-2 text-sm">
          {summary.map((s) => (
            <li key={`${s.type}-${s.length}`} className="rounded-md bg-slate-100 px-2 py-1 dark:bg-slate-800">
              <strong>{s.count} ×</strong> {s.type} {s.length === null ? c.extension : s.length === undefined ? c.open : formatCableLength(s.length)}
            </li>
          ))}
        </ul>
      </section>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="w-full min-w-[60rem] text-sm" data-testid="cable-table">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-800">
            <tr>
              {c.columns.map((col) => (
                <th key={col} className="px-2 py-1.5 font-medium">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r) => {
              const len = r.length;
              const warn = len.needsExtension || len.exceedsMax;
              return (
                <tr key={r.id} className={warn ? 'bg-amber-50 dark:bg-amber-950' : ''}>
                  <td className="px-2 py-1">{r.typeName}</td>
                  <td className="px-2 py-1">{r.label}</td>
                  <td className="px-2 py-1">{r.from}</td>
                  <td className="px-2 py-1">{r.to}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{len.planMm !== undefined ? formatMeters(len.planMm) : '–'}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{len.heightMm !== undefined ? formatMeters(len.heightMm) : '–'}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{len.totalMm !== undefined ? formatMeters(len.totalMm) : '–'}</td>
                  <td className="px-2 py-1 text-right font-medium tabular-nums">
                    {len.status === 'open' ? c.open : len.chosenMm === null ? c.extension : formatCableLength(len.chosenMm)}
                    {len.status === 'manual' ? ' ✎' : ''}
                  </td>
                  <td className="px-2 py-1">{masterName(library, 'owners', r.ownerId)}</td>
                  <td className="px-2 py-1">{masterName(library, 'trailers', r.trailerId)}</td>
                  <td className="px-2 py-1">{r.inventoryNo}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
