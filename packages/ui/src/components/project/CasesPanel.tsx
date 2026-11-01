// Cases im Projekt: in welchen Anhänger kommt welches Case (Standard aus der Bibliothek oder abweichend).
import type * as Y from 'yjs';
import { caseTrailerId, setCaseTrailer, type Library } from '@steckplan/core';
import type { ProjectData } from '../../lib/useProjectData';
import { texts } from '../../texts';
import { selectClass } from '../library/fields';

const t = texts.cases;
const NONE = '__ohne';

export function CasesPanel({ doc, origin, data, library, editable }: { doc: Y.Doc; origin: object; data: ProjectData; library: Library | null; editable: boolean }) {
  if (!library) return null;
  const used = new Set([...data.devices, ...data.cables].map((x) => x.caseId).filter(Boolean));
  const cases = library.masterData.cases
    .filter((c) => !c.archived || used.has(c.id))
    .sort((a, b) => Number(used.has(b.id)) - Number(used.has(a.id)) || a.name.localeCompare(b.name, 'de'));
  const trailerName = (id?: string) => library.masterData.trailers.find((x) => x.id === id)?.name;
  const content = (caseId: string) => [...data.devices, ...data.cables].filter((x) => x.caseId === caseId).length;

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900" aria-label={t.title}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t.title}</h2>
      <p className="text-xs text-slate-500">{t.hint}</p>
      {cases.length === 0 ? (
        <p className="text-sm text-slate-500">{t.empty}</p>
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-slate-700">
          {cases.map((c) => {
            const override = data.caseTrailers.find((x) => x.id === c.id);
            const value = !override ? '' : (override.trailerId ?? NONE);
            const effective = caseTrailerId(c.id, data.caseTrailers, library.masterData.cases);
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
                <div className="min-w-40 flex-1">
                  <div className="text-sm font-medium">{c.name}</div>
                  <div className="text-xs text-slate-500">
                    {t.content(content(c.id))} · {effective ? `→ ${trailerName(effective) ?? '?'}` : t.noTrailer}
                  </div>
                </div>
                <select
                  className={`${selectClass} w-auto`}
                  aria-label={`${t.trailer}: ${c.name}`}
                  value={value}
                  disabled={!editable}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCaseTrailer(doc, c.id, v === NONE || v === '' ? undefined : v, v === '', origin);
                  }}
                >
                  <option value="">{t.standard(trailerName(c.defaultTrailerId) ?? t.none)}</option>
                  {library.masterData.trailers
                    .filter((x) => !x.archived || x.id === override?.trailerId)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  <option value={NONE}>{t.noTrailer}</option>
                </select>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
