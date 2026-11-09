// Anhänger-Planung (Bearbeiten): je Auftritt die Fahrten – welcher Anhänger, wer fährt, von wo nach wo, Abfahrt,
// Notiz. „Alle Anhänger einplanen“ legt für jeden im Projekt genutzten Anhänger eine Fahrt zum Auftrittsort an.
// Wer sich beim Auftritt für „Anhänger hin“ bzw. „weiter“ gemeldet hat, steht in der Fahrerauswahl oben.
import { Plus, Trash2, Truck } from 'lucide-react';
import type * as Y from 'yjs';
import {
  addTrailerTrip,
  effectiveTrailerId,
  formatGigDate,
  formatGigTimes,
  personName,
  personSignup,
  planTrailerTrips,
  removeTrailerTrip,
  tripGaps,
  updateTrailerTrip,
  type Gig,
  type Library,
  type TrailerTrip,
} from '@steckplan/core';
import type { ProjectData } from '../../lib/useProjectData';
import { texts } from '../../texts';
import { ICON } from '../icons';
import { Button } from '../ui';

const t = texts.helpers.trailers;
const inputClass = 'w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800';

/** Anhänger, die im Projekt genutzt werden (Geräte, Kabel, Cases) */
export function usedTrailerIds(data: ProjectData, library: Library | null): string[] {
  const cases = library?.masterData.cases;
  const ids = new Set<string>();
  for (const item of [...data.devices, ...data.cables]) {
    const id = effectiveTrailerId(item as { caseId?: string; trailerId?: string }, data.caseTrailers, cases);
    if (id) ids.add(id);
  }
  return [...ids];
}

export function TrailerPlanning({ doc, origin, data, library }: { doc: Y.Doc; origin: object; data: ProjectData; library: Library | null }) {
  const trailers = (library?.masterData.trailers ?? []).filter((x) => !x.archived);
  const used = usedTrailerIds(data, library);
  const toPlan = used.length ? used : trailers.map((x) => x.id);
  if (data.gigs.length === 0) return <p className="text-sm text-slate-500" data-testid="trailer-planning">{t.noGigs}</p>;
  return (
    <section className="space-y-4" aria-label={t.title} data-testid="trailer-planning">
      <div className="flex items-center gap-2">
        <Truck {...ICON} className="text-slate-500" />
        <h2 className="text-lg font-semibold">{t.title}</h2>
      </div>
      <p className="text-sm text-slate-500">{t.hint}</p>
      {data.gigs.map((gig) => (
        <GigTrips key={gig.id} doc={doc} origin={origin} gig={gig} data={data} trailers={trailers} toPlan={toPlan} />
      ))}
    </section>
  );
}

function GigTrips({ doc, origin, gig, data, trailers, toPlan }: { doc: Y.Doc; origin: object; gig: Gig; data: ProjectData; trailers: { id: string; name: string }[]; toPlan: string[] }) {
  const trips = data.trailerTrips.filter((x) => x.gigId === gig.id);
  const gaps = tripGaps(trips);
  // gemeldet für Anhänger hin bzw. weiter
  const volunteers = data.people.flatMap((p) => {
    const s = personSignup(data.helperSignups, gig.id, p.id);
    return s && (s.trailerThere || s.trailerNext) ? [{ person: p, there: s.trailerThere, next: s.trailerNext }] : [];
  });
  const volunteerIds = new Set(volunteers.map((v) => v.person.id));
  const people = [...data.people].sort((a, b) => Number(volunteerIds.has(b.id)) - Number(volunteerIds.has(a.id)));
  const set = (trip: TrailerTrip, patch: Partial<Omit<TrailerTrip, 'id' | 'gigId'>>) => updateTrailerTrip(doc, trip.id, patch, origin);
  const times = formatGigTimes(gig);
  return (
    <article className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900" aria-label={gig.title || formatGigDate(gig.date)} data-testid="trailer-gig">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-semibold">{formatGigDate(gig.date) || t.noDate}</span>
        <span>{gig.title}</span>
        {gig.location && <span className="text-sm text-slate-500">📍 {gig.location}</span>}
        {times && <span className="text-sm text-slate-500">{times}</span>}
        <span className="flex-1" />
        {gaps.withoutDriver > 0 && (
          <span className="rounded-full bg-amber-100 px-2 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200" data-testid="trailer-gap">
            {t.withoutDriver(gaps.withoutDriver)}
          </span>
        )}
      </header>
      {volunteers.length > 0 && (
        <p className="text-xs text-slate-500" data-testid="trailer-volunteers">
          {t.volunteers}: {volunteers.map((v) => `${personName(v.person)} (${[v.there ? t.there : '', v.next ? t.next : ''].filter(Boolean).join(', ')})`).join(' · ')}
        </p>
      )}
      {trips.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="px-1 py-1 font-medium">{t.trailer}</th>
                <th className="px-1 py-1 font-medium">{t.driver}</th>
                <th className="px-1 py-1 font-medium">{t.from}</th>
                <th className="px-1 py-1 font-medium">{t.to}</th>
                <th className="px-1 py-1 font-medium">{t.time}</th>
                <th className="px-1 py-1 font-medium">{t.note}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {trips.map((trip) => (
                <tr key={trip.id} className="align-top" data-testid="trailer-trip">
                  <td className="w-40 px-1 py-1">
                    <select className={inputClass} aria-label={t.trailer} value={trip.trailerId ?? ''} onChange={(e) => set(trip, { trailerId: e.target.value || undefined })}>
                      <option value="">{t.noTrailer}</option>
                      {trailers.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="w-44 px-1 py-1">
                    <select className={`${inputClass} ${trip.personId ? '' : 'border-amber-400'}`} aria-label={t.driver} value={trip.personId ?? ''} onChange={(e) => set(trip, { personId: e.target.value || undefined })}>
                      <option value="">{t.noDriver}</option>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {volunteerIds.has(p.id) ? '🚚 ' : ''}
                          {personName(p)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <input key={`f${trip.from ?? ''}`} className={inputClass} aria-label={t.from} placeholder={t.fromPlaceholder} defaultValue={trip.from ?? ''} onBlur={(e) => e.target.value.trim() !== (trip.from ?? '') && set(trip, { from: e.target.value.trim() || undefined })} />
                  </td>
                  <td className="px-1 py-1">
                    <input key={`t${trip.to ?? ''}`} className={inputClass} aria-label={t.to} placeholder={gig.location || t.toPlaceholder} defaultValue={trip.to ?? ''} onBlur={(e) => e.target.value.trim() !== (trip.to ?? '') && set(trip, { to: e.target.value.trim() || undefined })} />
                  </td>
                  <td className="w-28 px-1 py-1">
                    <input type="time" className={inputClass} aria-label={t.time} value={trip.time ?? ''} onChange={(e) => set(trip, { time: e.target.value || undefined })} />
                  </td>
                  <td className="px-1 py-1">
                    <input key={`n${trip.note ?? ''}`} className={inputClass} aria-label={t.note} defaultValue={trip.note ?? ''} onBlur={(e) => e.target.value.trim() !== (trip.note ?? '') && set(trip, { note: e.target.value.trim() || undefined })} />
                  </td>
                  <td className="px-1 py-1">
                    <Button variant="ghost" className="min-h-8 px-1.5" aria-label={t.remove} title={t.remove} onClick={() => removeTrailerTrip(doc, trip.id, origin)}>
                      <Trash2 {...ICON} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" className="text-xs" onClick={() => addTrailerTrip(doc, gig.id, gig.location ? { to: gig.location } : {}, origin)}>
          <Plus {...ICON} /> {t.add}
        </Button>
        {toPlan.some((id) => !trips.some((x) => x.trailerId === id)) && (
          <Button variant="ghost" className="text-xs" title={t.planAllHint} onClick={() => planTrailerTrips(doc, gig, toPlan, origin)}>
            <Truck {...ICON} /> {t.planAll}
          </Button>
        )}
      </div>
    </article>
  );
}
