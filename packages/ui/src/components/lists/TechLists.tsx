// DMX-Patchliste und Netzwerkliste.
import { useMemo } from 'react';
import { buildDmxPatch, buildNetworkList, checkDmx, checkNetwork, deviceMatches, formatDmx, type Library } from '@steckplan/core';
import { useEditor } from '../../lib/editor';
import type { ProjectData } from '../../lib/useProjectData';
import { texts } from '../../texts';

const d = texts.techLists;

function useTemplates(library: Library | null) {
  return useMemo(() => new Map((library?.templates ?? []).map((t) => [t.id, t])), [library]);
}

export function DmxPatchView({ data, library }: { data: ProjectData; library: Library | null }) {
  const filter = useEditor((s) => s.filter);
  const templates = useTemplates(library);
  const devices = data.devices.filter((x) => deviceMatches(filter, x, templates.get(x.templateId)));
  const rows = buildDmxPatch({ devices }, templates);
  const problems = new Set(checkDmx(data, templates).flatMap((i) => i.objectIds));
  if (rows.length === 0) return <p className="p-8 text-center text-sm text-slate-500">{d.noDmx}</p>;
  return (
    <div className="overflow-x-auto p-3">
      <table className="w-full min-w-[44rem] rounded-lg border border-slate-200 bg-white text-sm dark:border-slate-700 dark:bg-slate-900" data-testid="dmx-patch">
        <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-800">
          <tr>
            {d.dmxColumns.map((c) => (
              <th key={c} className="px-2 py-1.5 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((r) => (
            <tr key={r.id} className={problems.has(r.id) ? 'bg-red-50 dark:bg-red-950' : ''}>
              <td className="px-2 py-1 tabular-nums">{r.universe ?? '–'}</td>
              <td className="px-2 py-1 tabular-nums">{r.universe !== undefined && r.address !== undefined ? formatDmx(r.universe, r.address) : '–'}</td>
              <td className="px-2 py-1 tabular-nums">{r.end ?? '–'}</td>
              <td className="px-2 py-1 font-medium">{r.label}</td>
              <td className="px-2 py-1">{r.templateName}</td>
              <td className="px-2 py-1">
                {r.modeName || '–'}
                {r.channels ? ` (${r.channels})` : ''}
              </td>
              <td className="px-2 py-1">{r.carrier ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function NetworkListView({ data, library }: { data: ProjectData; library: Library | null }) {
  const filter = useEditor((s) => s.filter);
  const templates = useTemplates(library);
  const devices = data.devices.filter((x) => deviceMatches(filter, x, templates.get(x.templateId)));
  const rows = buildNetworkList({ devices, network: data.network }, templates);
  const problems = new Set(checkNetwork(data, templates).flatMap((i) => i.objectIds));
  if (rows.length === 0) return <p className="p-8 text-center text-sm text-slate-500">{d.noNetwork}</p>;
  return (
    <div className="overflow-x-auto p-3">
      <table className="w-full min-w-[40rem] rounded-lg border border-slate-200 bg-white text-sm dark:border-slate-700 dark:bg-slate-900" data-testid="network-list">
        <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-800">
          <tr>
            {d.networkColumns.map((c) => (
              <th key={c} className="px-2 py-1.5 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((r) => (
            <tr key={`${r.deviceId}-${r.port}`} className={problems.has(r.deviceId) ? 'bg-red-50 dark:bg-red-950' : ''}>
              <td className="px-2 py-1 font-medium">{r.device}</td>
              <td className="px-2 py-1">{r.port}</td>
              <td className="px-2 py-1 font-mono tabular-nums">{r.ip || '–'}</td>
              <td className="px-2 py-1">{r.subnet}</td>
              <td className="px-2 py-1">{r.hostname}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
