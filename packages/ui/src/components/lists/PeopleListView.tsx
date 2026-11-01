// Personenliste: Geräte „benutzt von Mensch“ je Person, mit Anschlüssen und Kabeln (wo einstecken).
import { useMemo } from 'react';
import { buildPeopleList, personName, type Library } from '@steckplan/core';
import type { ProjectData } from '../../lib/useProjectData';
import { texts } from '../../texts';

const t = texts.people;

export function PeopleListView({ data, library }: { data: ProjectData; library: Library | null }) {
  const entries = useMemo(() => {
    if (!library) return [];
    const settings = { gridMm: 500, snap: true, defaultReservePercent: 10, defaultReservePerEndMm: 500, ...data.settings };
    return buildPeopleList({ devices: data.devices, cables: data.cables, settings, people: data.people }, library).filter((e) => e.devices.length > 0 || e.person);
  }, [data, library]);

  if (entries.every((e) => e.devices.length === 0)) return <p className="p-6 text-center text-sm text-slate-500">{t.listEmpty}</p>;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-3 p-3" data-testid="people-list">
      {entries.map((entry) => (
        <section key={entry.person?.id ?? 'unassigned'} className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" aria-label={entry.person ? personName(entry.person) : t.unassigned}>
          <header className="flex flex-wrap items-baseline gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
            <h3 className={`font-semibold ${entry.person ? '' : 'italic text-amber-700 dark:text-amber-300'}`}>{entry.person ? personName(entry.person) : t.unassigned}</h3>
            {entry.person?.kind && <span className="text-sm text-slate-500">{entry.person.kind}</span>}
            <span className="ml-auto text-xs text-slate-500">
              {entry.devices.length} {t.devices}
            </span>
          </header>
          {entry.devices.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-500">–</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {entry.devices.map((d) => (
                <li key={d.device.id} className="px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium">{d.device.label}</span> <span className="text-xs text-slate-500">{d.templateName}</span>
                  </div>
                  {d.connections.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                      {d.connections.map((c, i) => (
                        <li key={i}>
                          {c.port} → <span className="font-medium">{c.target}</span> <span className="text-slate-500">({c.cable}{c.cableLabel ? `, ${c.cableLabel}` : ''})</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
