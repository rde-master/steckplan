// Persönliche Seite: die eigenen Anhänger-Fahrten (nur ansehen) – welcher Anhänger, wann, von wo nach wo.
import { Truck } from 'lucide-react';
import { formatGigDate, personTrips, type Library, type Person } from '@steckplan/core';
import type { ProjectData } from '../../lib/useProjectData';
import { texts } from '../../texts';
import { ICON } from '../icons';

const t = texts.helpers.trailers;

export function MyTrips({ person, data, library }: { person: Person; data: ProjectData; library: Library | null }) {
  const trips = personTrips(data.trailerTrips, data.gigs, person.id);
  if (trips.length === 0) return null;
  const trailerName = (id: string | undefined) => (id ? (library?.masterData.trailers.find((x) => x.id === id)?.name ?? '?') : t.noTrailer);
  return (
    <section className="space-y-2 rounded-lg border border-sky-200 bg-sky-50 p-4 dark:border-sky-900 dark:bg-sky-950/40" aria-label={t.mine} data-testid="my-trips">
      <h3 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-sky-800 uppercase dark:text-sky-200">
        <Truck {...ICON} /> {t.mine}
      </h3>
      <ul className="space-y-1.5">
        {trips.map(({ trip, gig }) => (
          <li key={trip.id} className="text-sm" data-testid="my-trip">
            <span className="font-semibold">{formatGigDate(gig.date) || t.noDate}</span>
            {trip.time && <span className="tabular-nums"> · {t.departure(trip.time)}</span>}
            <span> · {trailerName(trip.trailerId)}</span>
            <div className="text-slate-600 dark:text-slate-300">
              {trip.from || t.fromUnknown} → {trip.to || gig.location || t.toUnknown}
              {gig.title ? ` (${gig.title})` : ''}
            </div>
            {trip.note && <div className="text-xs text-slate-500">{trip.note}</div>}
          </li>
        ))}
      </ul>
    </section>
  );
}
