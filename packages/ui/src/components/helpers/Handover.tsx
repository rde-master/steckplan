// Technik-Übergabe: beim Scannen fragt ein Fenster, das sich nur mit „Ich habe die Technik erhalten“ schließen lässt;
// danach „Technik zurückgeben“ mit kurzer Rückfrage. Bearbeiten sieht und bestätigt beides in der Übersicht.
import { Check, PackageCheck, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { handoverState, personHandover, personName, type Handover, type Person, type PersonDevice } from '@steckplan/core';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { texts } from '../../texts';
import { ICON } from '../icons';
import { Banner, Button } from '../ui';

const t = texts.helpers;

function useAction(projectId: string, personId: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: 'receive' | 'return' | 'reset') => {
    setBusy(true);
    setError(null);
    try {
      await api.handover(projectId, personId, action);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

/** Fenster beim Scannen: bleibt, bis der Empfang bestätigt ist */
export function ReceiptPrompt({ projectId, person, devices }: { projectId: string; person: Person; devices: PersonDevice[] }) {
  const { busy, error, run } = useAction(projectId, person.id);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4" role="dialog" aria-modal="true" aria-labelledby="receipt-title" data-testid="receipt-prompt">
      <div className="w-full max-w-md space-y-4 rounded-xl bg-white p-5 shadow-2xl dark:bg-slate-900">
        <h2 id="receipt-title" className="flex items-center gap-2 text-xl font-semibold">
          <PackageCheck size={26} className="text-sky-600" aria-hidden /> {t.receiptTitle}
        </h2>
        <p className="text-sm">{t.receiptIntro(person.firstName || personName(person))}</p>
        <ul className="space-y-1 rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-800">
          {devices.map((d) => (
            <li key={d.device.id}>
              <span className="font-semibold">{d.device.label}</span> <span className="text-xs text-slate-500">{d.templateName}</span>
            </li>
          ))}
        </ul>
        <Button variant="primary" className="min-h-14 w-full text-base" disabled={busy} onClick={() => void run('receive')}>
          <Check size={20} aria-hidden /> {t.receiptConfirm}
        </Button>
        {error && <Banner tone="error">{error}</Banner>}
      </div>
    </div>
  );
}

/** Auf der eigenen Seite: erhalten am …, „Technik zurückgeben“ mit Rückfrage, zurückgegeben am … */
export function HandoverCard({ projectId, person, handover, canAct }: { projectId: string; person: Person; handover: Handover | undefined; canAct: boolean }) {
  const { busy, error, run } = useAction(projectId, person.id);
  const [asking, setAsking] = useState(false);
  const state = handoverState(handover);
  if (state === 'open') return null;
  return (
    <section className={`space-y-2 rounded-lg border p-4 ${state === 'returned' ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950' : 'border-sky-200 bg-sky-50 dark:border-sky-800 dark:bg-sky-950'}`} aria-label={t.handoverTitle} data-testid="handover-card">
      <p className="text-sm">
        <Check size={16} className="mr-1 inline text-emerald-600" aria-hidden />
        {t.receivedAt(formatDateTime(handover!.receivedAt!))}
      </p>
      {state === 'returned' ? (
        <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
          <Check size={16} className="mr-1 inline" aria-hidden />
          {t.returnedAt(formatDateTime(handover!.returnedAt!))}
        </p>
      ) : !canAct ? null : asking ? (
        <div className="space-y-2 rounded-md bg-white p-3 dark:bg-slate-900" data-testid="return-confirm">
          <p className="font-semibold">{t.returnQuestion}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={busy} onClick={() => void run('return').then((ok) => ok && setAsking(false))}>
              <Check {...ICON} /> {t.returnConfirm}
            </Button>
            <Button variant="ghost" onClick={() => setAsking(false)}>
              {t.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" className="w-full" onClick={() => setAsking(true)}>
          <Undo2 {...ICON} /> {t.returnButton}
        </Button>
      )}
      {error && <Banner tone="error">{error}</Banner>}
    </section>
  );
}

/** Übersicht für Bearbeiten: je Person mit Geräten Empfang und Rückgabe, beides auch selbst bestätigen */
export function HandoverOverview({ projectId, entries, handovers }: { projectId: string; entries: { person: Person; devices: PersonDevice[] }[]; handovers: Handover[] }) {
  if (entries.length === 0) return null;
  const states = entries.map((e) => handoverState(personHandover(handovers, e.person.id)));
  const received = states.filter((s) => s !== 'open').length;
  const returned = states.filter((s) => s === 'returned').length;
  return (
    <section className="space-y-2" data-testid="handover-overview">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{t.handoverTitle}</h2>
        <span className="text-xs text-slate-500">{t.handoverSummary(received, returned, entries.length)}</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="w-full text-left text-sm" data-testid="handover-table">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase dark:bg-slate-800">
            <tr>
              <th className="px-3 py-2">{t.colPerson}</th>
              <th className="px-3 py-2">{t.colDevices}</th>
              <th className="px-3 py-2">{t.colReceived}</th>
              <th className="px-3 py-2">{t.colReturned}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <HandoverRow key={e.person.id} projectId={projectId} person={e.person} devices={e.devices} handover={personHandover(handovers, e.person.id)} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function HandoverRow({ projectId, person, devices, handover }: { projectId: string; person: Person; devices: PersonDevice[]; handover: Handover | undefined }) {
  const { busy, error, run } = useAction(projectId, person.id);
  const state = handoverState(handover);
  const stamp = (at: string | undefined, by: string | undefined) =>
    at ? (
      <span className="text-emerald-700 dark:text-emerald-400">
        ✓ {formatDateTime(at)}
        {by && <span className="block text-xs text-slate-500">{t.by(by)}</span>}
      </span>
    ) : (
      <span className="text-amber-700 dark:text-amber-400">{t.open}</span>
    );
  return (
    <tr className={`border-t border-slate-100 align-top dark:border-slate-800 ${state === 'returned' ? 'bg-emerald-50/60 dark:bg-emerald-950/40' : ''}`} aria-label={personName(person)}>
      <td className="px-3 py-2 font-medium">{personName(person)}</td>
      <td className="px-3 py-2 text-xs">{devices.map((d) => d.device.label).join(', ')}</td>
      <td className="px-3 py-2">{stamp(handover?.receivedAt, handover?.receivedBy)}</td>
      <td className="px-3 py-2">{state === 'open' ? '–' : stamp(handover?.returnedAt, handover?.returnedBy)}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        {state !== 'received' && (
          <Button variant="secondary" className="min-h-8 px-2 text-xs" disabled={busy} onClick={() => void run('receive')}>
            {t.confirmReceipt}
          </Button>
        )}
        {state === 'received' && (
          <Button variant="secondary" className="min-h-8 px-2 text-xs" disabled={busy} onClick={() => void run('return')}>
            {t.confirmReturn}
          </Button>
        )}
        {state !== 'open' && (
          <Button
            variant="ghost"
            className="min-h-8 px-2 text-xs"
            disabled={busy}
            onClick={() => {
              if (window.confirm(t.resetHandoverConfirm(personName(person)))) void run('reset');
            }}
          >
            {t.resetHandover}
          </Button>
        )}
        {error && <div className="mt-1 text-xs text-red-700">{error}</div>}
      </td>
    </tr>
  );
}
