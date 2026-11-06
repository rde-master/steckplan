// Auftritte im Projekt (Titel, Ort, Datum, Aufbau ab, Beginn, Notiz) – Grundlage für die Helfer-Anmeldung.
import { Plus, Trash2 } from 'lucide-react';
import type * as Y from 'yjs';
import { addGig, removeGig, updateGig, type Gig } from '@steckplan/core';
import type { ProjectData } from '../../lib/useProjectData';
import { texts } from '../../texts';
import { ICON } from '../icons';
import { Button, TextInput } from '../ui';

const t = texts.gigs;

export function GigsPanel({ doc, origin, data, editable }: { doc: Y.Doc; origin: object; data: ProjectData; editable: boolean }) {
  const set = (gig: Gig, patch: Partial<Omit<Gig, 'id'>>) => updateGig(doc, gig.id, patch, origin);
  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900" aria-label={t.title} data-testid="gigs-panel">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold tracking-wide text-slate-500 uppercase">{t.title}</h2>
        {editable && (
          <Button variant="ghost" onClick={() => addGig(doc, {}, origin)}>
            <Plus {...ICON} /> {t.add}
          </Button>
        )}
      </div>
      <p className="text-xs text-slate-500">{t.hint}</p>
      {data.gigs.length === 0 ? (
        <p className="text-sm text-slate-500">{t.empty}</p>
      ) : (
        <ul className="space-y-3">
          {data.gigs.map((gig) => {
            const name = gig.title || t.untitled;
            const signups = data.helperSignups.filter((s) => s.gigId === gig.id).length;
            return (
              <li key={gig.id} className="space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-700" data-testid="gig-row">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="min-w-48 flex-[2] text-xs text-slate-500">
                    {t.titleLabel}
                    <TextInput aria-label={t.titleLabel} placeholder={t.titlePlaceholder} value={gig.title} disabled={!editable} onChange={(e) => set(gig, { title: e.target.value })} />
                  </label>
                  <label className="min-w-40 flex-1 text-xs text-slate-500">
                    {t.location}
                    <TextInput aria-label={t.location} placeholder={t.locationPlaceholder} value={gig.location} disabled={!editable} onChange={(e) => set(gig, { location: e.target.value })} />
                  </label>
                  {editable && (
                    <Button
                      variant="ghost"
                      aria-label={`${t.remove}: ${name}`}
                      title={t.remove}
                      onClick={() => {
                        if (window.confirm(t.removeConfirm(name, signups))) removeGig(doc, gig.id, origin);
                      }}
                    >
                      <Trash2 {...ICON} />
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs text-slate-500">
                    {t.date}
                    <TextInput type="date" aria-label={t.date} value={gig.date ?? ''} disabled={!editable} onChange={(e) => set(gig, { date: e.target.value || undefined })} />
                  </label>
                  <label className="text-xs text-slate-500">
                    {t.setupTime}
                    <TextInput type="time" aria-label={t.setupTime} value={gig.setupTime ?? ''} disabled={!editable} onChange={(e) => set(gig, { setupTime: e.target.value || undefined })} />
                  </label>
                  <label className="text-xs text-slate-500">
                    {t.startTime}
                    <TextInput type="time" aria-label={t.startTime} value={gig.startTime ?? ''} disabled={!editable} onChange={(e) => set(gig, { startTime: e.target.value || undefined })} />
                  </label>
                  <label className="min-w-48 flex-1 text-xs text-slate-500">
                    {t.notes}
                    <TextInput aria-label={t.notes} value={gig.notes ?? ''} disabled={!editable} onChange={(e) => set(gig, { notes: e.target.value || undefined })} />
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
