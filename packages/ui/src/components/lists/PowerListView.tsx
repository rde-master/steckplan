// Stromliste: je Verteiler Zuleitung, Phasen und Abgänge mit Last und Auslastung (aus den Stromkabeln im Signalfluss).
import { useMemo } from 'react';
import { buildPowerReport, formatAmps, formatWatts, totalW, WARN_RATIO, type DistributorReport, type Library, type Phase } from '@steckplan/core';
import type { ProjectData } from '../../lib/useProjectData';
import { texts } from '../../texts';

const t = texts.power;
const PHASES: Phase[] = ['L1', 'L2', 'L3'];

function usageClass(usage: number | undefined): string {
  if (usage === undefined) return 'text-slate-500';
  if (usage >= 1) return 'font-semibold text-red-700 dark:text-red-400';
  if (usage >= WARN_RATIO) return 'font-semibold text-amber-700 dark:text-amber-300';
  return 'text-emerald-700 dark:text-emerald-400';
}

function barClass(usage: number): string {
  return usage >= 1 ? 'bg-red-500' : usage >= WARN_RATIO ? 'bg-amber-500' : 'bg-emerald-500';
}

export function PowerListView({ data, library }: { data: ProjectData; library: Library | null }) {
  const report = useMemo(() => (library ? buildPowerReport(data, library) : null), [data, library]);
  if (!report) return null;
  if (report.distributors.length === 0 && report.unconnected.length === 0) return <p className="mx-auto max-w-2xl p-6 text-center text-sm text-slate-500">{t.empty}</p>;
  return (
    <div className="mx-auto w-full max-w-5xl space-y-3 p-3" data-testid="power-list">
      <div className="flex flex-wrap items-center gap-3 text-sm" data-testid="power-total">
        <span className="font-semibold">{t.total}:</span>
        <span>{formatWatts(totalW(report.total))}</span>
        {PHASES.map((p) => (
          <span key={p} className="tabular-nums text-slate-600 dark:text-slate-300">
            {p} {formatAmps(report.total[p] / 230)}
          </span>
        ))}
        <span className="flex-1 text-right text-xs text-slate-500">{t.hint}</span>
      </div>
      {report.distributors.map((d) => (
        <Distributor key={d.device.id} report={d} />
      ))}
      {report.unconnected.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950" aria-label={t.unconnected}>
          <h3 className="mb-1 font-semibold">{t.unconnected}</h3>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {report.unconnected.map((u) => (
              <li key={u.device.id}>
                {u.device.label} <span className="text-slate-500">{formatWatts(u.powerW)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Distributor({ report: d }: { report: DistributorReport }) {
  const phases: Phase[] = d.feed === '3P' ? PHASES : [d.feed];
  return (
    <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" style={{ marginLeft: `${d.depth * 1.25}rem` }} aria-label={d.device.label}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
        <h3 className="font-semibold">{d.device.label}</h3>
        <span className="text-xs text-slate-500">
          {d.template?.name}
          {' · '}
          {d.fedFrom ? t.fedFrom(d.fedFrom) : t.mainFeed}
          {' · '}
          {d.feed === '3P' ? t.threePhase : d.feed}
          {d.inputFuseA ? ` ${d.inputFuseA} A` : ''}
        </span>
        <span className="ml-auto text-sm tabular-nums">{formatWatts(totalW(d.load))}</span>
        {d.usage !== undefined && (
          <span className={`text-sm tabular-nums ${usageClass(d.usage)}`} data-testid="feed-usage">
            {Math.round(d.usage * 100)} %
          </span>
        )}
      </header>
      {/* Phasenbalken */}
      <div className="grid gap-1 px-3 py-2 sm:grid-cols-3">
        {phases.map((p) => {
          const usage = d.inputFuseA ? d.currentA[p] / d.inputFuseA : 0;
          return (
            <div key={p} className="text-xs">
              <div className="flex justify-between">
                <span className="font-medium">{p}</span>
                <span className="tabular-nums">
                  {formatAmps(d.currentA[p])}
                  {d.inputFuseA ? ` / ${d.inputFuseA} A` : ''}
                </span>
              </div>
              <div className="mt-0.5 h-2 overflow-hidden rounded bg-slate-200 dark:bg-slate-700">
                <div className={`h-full ${barClass(usage)}`} style={{ width: `${Math.min(100, usage * 100)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {d.imbalance && <p className="px-3 pb-2 text-xs font-medium text-amber-700 dark:text-amber-300">⚠ {t.imbalance}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              {t.columns.map((c) => (
                <th key={c} className="px-3 py-1 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {d.outlets.map((o) => (
              <tr key={o.portId} data-testid="outlet-row">
                <td className="px-3 py-1.5 font-medium">{o.label}</td>
                <td className="px-3 py-1.5">{o.phase === '3P' ? t.threePhase : o.phase}</td>
                <td className="px-3 py-1.5 tabular-nums">{o.fuseA ? `${o.fuseA} A` : '–'}</td>
                <td className="px-3 py-1.5">{o.devices.map((x) => x.label).join(', ') || <span className="text-slate-400">{t.free}</span>}</td>
                <td className="px-3 py-1.5 tabular-nums">{totalW(o.load) > 0 ? formatWatts(totalW(o.load)) : '–'}</td>
                <td className="px-3 py-1.5 tabular-nums">{o.currentA > 0 ? formatAmps(o.currentA) : '–'}</td>
                <td className={`px-3 py-1.5 tabular-nums ${usageClass(o.usage)}`}>{o.usage !== undefined && o.currentA > 0 ? `${Math.round(o.usage * 100)} %` : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
