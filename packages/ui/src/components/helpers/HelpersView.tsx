// Tab „Helfer“: persönliche Seite je Person – wo sie ihre Geräte einsteckt (Verbindungen und Bühnenplan) und
// Anmeldung zu den Auftritten (Aufbau helfen, Anhänger hin bzw. weiter, Bemerkung). Der QR-Code auf dem Etikett
// eines Geräts führt direkt auf die Seite seiner Person. Wer bearbeiten darf, sieht zusätzlich die Übersicht.
import { ArrowRight, Check, Truck } from 'lucide-react';
import { useState } from 'react';
import type * as Y from 'yjs';
import { buildPeopleList, EMPTY_FILTER, formatGigDate, formatGigTimes, gigSummaries, personName, personSignup, type Gig, type HelperSignup, unreadHelperMessages, type Library, type Person, type PersonEntry } from '@steckplan/core';
import { api, errorMessage } from '../../lib/api';
import type { ProjectData } from '../../lib/useProjectData';
import { SIGNAL_COLORS } from '../../pdf/documents';
import { stageBounds, stagePlanSvg, type StageDrawing } from '../../pdf/svg';
import { texts } from '../../texts';
import { buildMulticoreRoutes, buildStageCables, buildStageItems } from '../stageplan/model';
import { Banner, Button } from '../ui';
import { CountBadge, MessagesInbox, PersonMessages } from './HelperMessages';

const t = texts.helpers;
const OVERVIEW = '__uebersicht';

function readParam(): string | null {
  return new URLSearchParams(window.location.search).get('person');
}

function writeParam(value: string | null): void {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set('person', value);
  else url.searchParams.delete('person');
  window.history.replaceState(null, '', url.pathname + url.search);
}

export function HelpersView({ projectId, doc, origin, userName, data, library, canSignup, isEditor, ownPersonId }: { projectId: string; doc: Y.Doc; origin: object; userName: string; data: ProjectData; library: Library | null; canSignup: boolean; isEditor: boolean; ownPersonId: string | undefined }) {
  // Helfer sehen und ändern nur ihre eigene Seite (Person aus dem QR-Code ihres Etiketts); Bearbeiten sieht alle
  if (!isEditor) {
    const own = data.people.find((p) => p.id === ownPersonId);
    return (
      <main className="min-h-0 flex-1 overflow-y-auto" data-testid="helpers-view">
        <div className="mx-auto w-full max-w-4xl space-y-4 p-4">{own ? <PersonPage key={own.id} projectId={projectId} person={own} data={data} library={library} canSignup={canSignup} own /> : <p className="text-sm text-slate-500">{t.scanHint}</p>}</div>
      </main>
    );
  }
  return <EditorHelpers projectId={projectId} doc={doc} origin={origin} userName={userName} data={data} library={library} canSignup={canSignup} />;
}

function EditorHelpers({ projectId, doc, origin, userName, data, library, canSignup }: { projectId: string; doc: Y.Doc; origin: object; userName: string; data: ProjectData; library: Library | null; canSignup: boolean }) {
  const unread = unreadHelperMessages(data.helperMessages);
  const [chosen, setChosenState] = useState<string | null>(() => readParam() ?? OVERVIEW);
  const setChosen = (value: string | null) => {
    setChosenState(value);
    writeParam(value === OVERVIEW ? null : value);
  };
  const person = data.people.find((p) => p.id === chosen);
  const showOverview = chosen === OVERVIEW || !person;

  return (
    <main className="min-h-0 flex-1 overflow-y-auto" data-testid="helpers-view">
      <div className="mx-auto w-full max-w-4xl space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
            <span className="text-slate-500">{t.choose}</span>
            <select
              aria-label={t.choose}
              className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm sm:max-w-xs dark:border-slate-600 dark:bg-slate-800"
              value={person?.id ?? ''}
              onChange={(e) => setChosen(e.target.value || OVERVIEW)}
            >
              <option value="">{t.choosePlaceholder}</option>
              {data.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {personName(p)}
                </option>
              ))}
            </select>
          </label>
          <Button variant={showOverview ? 'primary' : 'secondary'} onClick={() => setChosen(OVERVIEW)}>
            {t.overview}
            <CountBadge count={unread} label={t.unread(unread)} />
          </Button>
        </div>

        {showOverview ? (
          <>
            <MessagesInbox projectId={projectId} doc={doc} origin={origin} userName={userName} messages={data.helperMessages} people={data.people} onOpen={(id) => setChosen(id)} />
            <Overview data={data} onOpen={(id) => setChosen(id)} />
          </>
        ) : person ? (
          <PersonPage key={person.id} projectId={projectId} person={person} data={data} library={library} canSignup={canSignup} own={false} />
        ) : (
          <p className="text-sm text-slate-500">{data.people.length ? t.pickHint : t.noPeople}</p>
        )}
      </div>
    </main>
  );
}

// ---------- persönliche Seite ----------

/** own: die eigene Seite eines Helfers (schreibt der Technik); sonst Bearbeiten sieht die Seite einer Person */
function PersonPage({ projectId, person, data, library, canSignup, own }: { projectId: string; person: Person; data: ProjectData; library: Library | null; canSignup: boolean; own: boolean }) {
  const settings = { gridMm: 500, snap: true, defaultReservePercent: 10, defaultReservePerEndMm: 500, ...data.settings };
  const entry: PersonEntry = buildPeopleList({ devices: data.devices, cables: data.cables, settings, people: data.people }, { templates: library?.templates ?? [] }).find((e) => e.person?.id === person.id) ?? { person, devices: [] };
  return (
    <div className="space-y-4" data-testid="helper-page">
      <header>
        <h2 className="text-xl font-semibold">{t.welcome(person.firstName || personName(person))}</h2>
        {person.kind && <p className="text-sm text-slate-500">{person.kind}</p>}
      </header>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900" aria-label={t.devicesTitle}>
        <h3 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{t.devicesTitle}</h3>
        {entry.devices.length === 0 ? (
          <p className="text-sm text-slate-500">{t.noDevices}</p>
        ) : (
          <ul className="space-y-3">
            {entry.devices.map((d) => (
              <li key={d.device.id} className="space-y-2" data-testid="helper-device">
                <div>
                  <span className="font-semibold">{d.device.label}</span> <span className="text-xs text-slate-500">{d.templateName}</span>
                </div>
                {d.connections.length === 0 ? (
                  <p className="text-xs text-slate-500">{t.noConnections}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {d.connections.map((c, i) => (
                      <li key={i} className="flex items-stretch gap-0 text-sm" data-testid="helper-connection">
                        {/* eigenes Gerät · Anschluss ── Kabel ──▶ Gegenstelle */}
                        <span className="flex shrink-0 items-center rounded-l-md border-2 px-2 py-1 font-medium" style={{ borderColor: SIGNAL_COLORS[c.signal] }}>
                          {c.port}
                        </span>
                        <span className="relative flex min-w-16 flex-1 items-center justify-center px-1">
                          <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded" style={{ background: SIGNAL_COLORS[c.signal] }} />
                          <span className="relative z-[1] max-w-full truncate rounded bg-white px-1.5 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                            {c.cable}
                            {c.cableLabel ? ` · ${c.cableLabel}` : ''}
                          </span>
                          <ArrowRight size={16} className="relative z-[1] -mr-1 shrink-0" style={{ color: SIGNAL_COLORS[c.signal] }} aria-hidden />
                        </span>
                        <span className="flex min-w-0 shrink items-center rounded-r-md px-2 py-1 font-semibold text-white" style={{ background: SIGNAL_COLORS[c.signal] }}>
                          <span className="truncate">{c.target}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
        <StageExcerpt data={data} library={library} deviceIds={entry.devices.map((d) => d.device.id)} />
      </section>

      <PersonMessages projectId={projectId} person={person} messages={data.helperMessages} canWrite={own && canSignup} canEdit={canSignup} />

      <section className="space-y-3" aria-label={t.gigsTitle}>
        <h3 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{t.gigsTitle}</h3>
        {!canSignup && data.gigs.length > 0 && <Banner tone="warn">{t.readOnly}</Banner>}
        {data.gigs.length === 0 ? (
          <p className="text-sm text-slate-500">{t.noGigs}</p>
        ) : (
          <ul className="space-y-3">
            {data.gigs.map((gig) => (
              <GigCard key={gig.id} projectId={projectId} gig={gig} person={person} signup={personSignup(data.helperSignups, gig.id, person.id)} count={data.helperSignups.filter((s) => s.gigId === gig.id && s.helps).length} canSignup={canSignup} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Bühnenplan mit den eigenen Geräten (rot umrandet) und wohin sie gehen; alles andere blass */
function StageExcerpt({ data, library, deviceIds }: { data: ProjectData; library: Library | null; deviceIds: string[] }) {
  const own = new Set(deviceIds);
  if (own.size === 0) return null;
  const ownCables = data.cables.filter((c) => own.has(c.from.deviceId) || own.has(c.to.deviceId));
  const related = new Set([...own, ...ownCables.flatMap((c) => [c.from.deviceId, c.to.deviceId])]);
  const items = buildStageItems(data.devices, library, data.layers, { colorMode: 'device', filter: EMPTY_FILTER, people: data.people }).map((i) => ({
    ...i,
    // Bühnenelemente bleiben zur Orientierung sichtbar
    dimmed: !related.has(i.device.id) && i.kind !== 'stageElement',
  }));
  if (!items.some((i) => own.has(i.device.id))) return null;
  const ownIds = new Set(ownCables.map((c) => c.id));
  const drawing: StageDrawing = {
    items,
    shapes: data.shapes,
    cables: buildStageCables(data.cables, data.devices, library, data.layers, EMPTY_FILTER, []).map((c) => ({ ...c, dimmed: !ownIds.has(c.cable.id) })),
    multicores: buildMulticoreRoutes(data.devices, library, data.layers, EMPTY_FILTER).map((m) => ({ ...m, dimmed: !related.has(m.device.id) })),
    ...(data.background ? { background: data.background } : {}),
    showCables: true,
    highlightIds: [...own],
  };
  const bounds = stageBounds(drawing, false);
  if (!bounds) return null;
  const fontMm = Math.max(bounds.width, bounds.height) / 30;
  const svg = stagePlanSvg(drawing, bounds, 800, (800 * bounds.height) / bounds.width, fontMm, true);
  return (
    <figure className="space-y-1">
      <figcaption className="text-xs text-slate-500">
        <span className="font-semibold tracking-wide uppercase">{t.stageTitle}</span> – {t.stageHint}
      </figcaption>
      {/* SVG aus den Projektdaten (Texte maskiert) */}
      <div className="overflow-hidden rounded-md border border-slate-200 bg-white p-1 dark:border-slate-700 [&>svg]:h-auto [&>svg]:w-full" data-testid="helper-stage" dangerouslySetInnerHTML={{ __html: svg }} />
    </figure>
  );
}

type SignupFlags = { helps?: boolean; trailerThere?: boolean; trailerNext?: boolean };

function GigCard({ projectId, gig, person, signup, count, canSignup }: { projectId: string; gig: Gig; person: Person; signup: HelperSignup | undefined; count: number; canSignup: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // sofort anzeigen, was getippt wurde – bis der Stand vom Server da ist (dann ändert sich „at“) oder ein Fehler kommt
  const [optimistic, setOptimistic] = useState<{ base: string | undefined; patch: SignupFlags } | null>(null);
  const shown = { helps: !!signup?.helps, trailerThere: !!signup?.trailerThere, trailerNext: !!signup?.trailerNext, ...(optimistic && optimistic.base === signup?.at ? optimistic.patch : {}) };
  const helps = shown.helps;
  const send = async (patch: SignupFlags & { note?: string }) => {
    const { note: _note, ...flags } = patch;
    // nur beim An-/Abmelden sperren (Doppelklick); die Bemerkung speichert im Hintergrund
    if (Object.keys(flags).length) setBusy(true);
    setError(null);
    if (Object.keys(flags).length) setOptimistic({ base: signup?.at, patch: { ...(optimistic?.base === signup?.at ? optimistic?.patch : {}), ...flags } });
    try {
      await api.helper(projectId, { gigId: gig.id, personId: person.id, ...patch });
    } catch (e) {
      setOptimistic(null);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const name = gig.title || texts.gigs.untitled;
  const when = [formatGigDate(gig.date), formatGigTimes(gig)].filter(Boolean).join(' · ');
  return (
    <li className={`space-y-3 rounded-lg border bg-white p-4 dark:bg-slate-900 ${helps ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-slate-200 dark:border-slate-700'}`} aria-label={name} data-testid="helper-gig">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{name}</div>
          {when && <div className="text-sm">{when}</div>}
          {gig.location && <div className="text-sm text-slate-500">{gig.location}</div>}
          {gig.notes && <div className="mt-1 text-xs text-slate-500">{gig.notes}</div>}
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{t.helpersCount(count)}</span>
      </div>
      <Button variant={helps ? 'primary' : 'secondary'} className={`w-full ${helps ? 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/60' : ''}`} disabled={!canSignup || busy} aria-pressed={helps} onClick={() => void send({ helps: !helps })}>
        {helps ? (
          <>
            <Check size={18} aria-hidden /> {t.signedUp}
          </>
        ) : (
          t.signUp
        )}
      </Button>
      {helps && canSignup && <p className="-mt-2 text-center text-xs text-slate-500">{t.signOffHint}</p>}
      <div className="flex flex-col gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4" checked={shown.trailerThere} disabled={!canSignup || busy} onChange={(e) => void send({ trailerThere: e.target.checked })} />
          <Truck size={16} className="text-slate-500" aria-hidden /> {t.trailerThere}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4" checked={shown.trailerNext} disabled={!canSignup || busy} onChange={(e) => void send({ trailerNext: e.target.checked })} />
          <Truck size={16} className="text-slate-500" aria-hidden /> {t.trailerNext}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">{t.note}</span>
          <textarea
            aria-label={`${t.note}: ${name}`}
            rows={2}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
            placeholder={t.notePlaceholder}
            disabled={!canSignup}
            value={note ?? signup?.note ?? ''}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => {
              if (note !== null && note.trim() !== (signup?.note ?? '')) void send({ note }).then(() => setNote(null));
              else setNote(null);
            }}
          />
        </label>
      </div>
      {error && <Banner tone="error">{error}</Banner>}
    </li>
  );
}

// ---------- Übersicht (Bearbeiten) ----------

function Overview({ data, onOpen }: { data: ProjectData; onOpen: (personId: string) => void }) {
  const summaries = gigSummaries(data.gigs, data.helperSignups, data.people);
  const names = (people: Person[]) => (people.length ? people.map(personName).join(', ') : t.nobody);
  if (summaries.length === 0) return <p className="text-sm text-slate-500">{t.overviewEmpty}</p>;
  return (
    <div className="space-y-6" data-testid="helpers-overview">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{t.overviewTitle}</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <table className="w-full text-left text-sm" data-testid="helpers-overview-table">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase dark:bg-slate-800">
              <tr>
                <th className="px-3 py-2">{t.colGig}</th>
                <th className="px-3 py-2">{t.colHelpers}</th>
                <th className="px-3 py-2">{t.colTrailerThere}</th>
                <th className="px-3 py-2">{t.colTrailerNext}</th>
                <th className="px-3 py-2">{t.colNotes}</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => (
                <tr key={s.gig.id} className="border-t border-slate-100 align-top dark:border-slate-800">
                  <td className="px-3 py-2">
                    <div className="font-medium">{s.gig.title || texts.gigs.untitled}</div>
                    <div className="text-xs whitespace-nowrap text-slate-500">{[formatGigDate(s.gig.date), formatGigTimes(s.gig)].filter(Boolean).join(' · ')}</div>
                    {s.gig.location && <div className="text-xs text-slate-500">{s.gig.location}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <span className="mr-1 rounded-full bg-emerald-100 px-1.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100">{s.helpers.length}</span>
                    {names(s.helpers)}
                  </td>
                  <td className="px-3 py-2">{names(s.trailerThere)}</td>
                  <td className="px-3 py-2">{names(s.trailerNext)}</td>
                  <td className="px-3 py-2 text-xs">
                    {s.notes.length === 0
                      ? t.nobody
                      : s.notes.map((n) => (
                          <div key={n.person.id}>
                            <span className="font-medium">{personName(n.person)}:</span> {n.note}
                          </div>
                        ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {data.people.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{t.matrixTitle}</h2>
          <p className="text-xs text-slate-500">{t.legend}</p>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <table className="w-full text-left text-sm" data-testid="helpers-matrix">
              <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800">
                <tr>
                  <th className="px-3 py-2" />
                  {summaries.map((s) => (
                    <th key={s.gig.id} className="px-2 py-2 text-center font-medium">
                      <div className="mx-auto max-w-32 truncate">{s.gig.title || texts.gigs.untitled}</div>
                      <div className="font-normal whitespace-nowrap">{formatGigDate(s.gig.date)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.people.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800">
                    <th className="px-3 py-1.5 text-left font-normal">
                      <button type="button" className="cursor-pointer text-sky-700 hover:underline dark:text-sky-400" title={t.openPerson(personName(p))} onClick={() => onOpen(p.id)}>
                        {personName(p)}
                      </button>
                    </th>
                    {summaries.map((s) => {
                      const su = personSignup(data.helperSignups, s.gig.id, p.id);
                      return (
                        <td key={s.gig.id} className={`px-2 py-1.5 text-center whitespace-nowrap ${su?.helps ? 'bg-emerald-50 dark:bg-emerald-950' : ''}`} title={su?.note}>
                          {su?.helps && <span className="font-semibold text-emerald-700 dark:text-emerald-300" aria-label={t.matrixHelps}>✓</span>}
                          {su?.trailerThere && <span className="ml-1 text-xs font-semibold" aria-label={t.colTrailerThere}>H</span>}
                          {su?.trailerNext && <span className="ml-1 text-xs font-semibold" aria-label={t.colTrailerNext}>W</span>}
                          {su?.note && <span className="ml-1 text-xs" aria-label={t.note}>✎</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
