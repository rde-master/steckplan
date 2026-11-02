// Personen importieren: CSV-Datei wählen oder Zellen aus Excel einfügen, Vorschau, übernehmen.
import { useMemo, useState } from 'react';
import type * as Y from 'yjs';
import { applyPeopleImport, parsePeopleTable, planPeopleImport, type ImportStatus, type Person } from '@steckplan/core';
import { texts } from '../../texts';
import { Banner, Button, Modal, TextArea } from '../ui';

const t = texts.peopleImport;

const STATUS_CLASS: Record<ImportStatus, string> = {
  new: 'text-emerald-700 dark:text-emerald-400',
  completeKind: 'text-sky-700 dark:text-sky-300',
  existing: 'text-slate-500',
  duplicate: 'text-slate-500',
};

export function PeopleImportDialog({ doc, origin, people, onClose }: { doc: Y.Doc; origin: object; people: Person[]; onClose: () => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const plan = useMemo(() => planPeopleImport(parsePeopleTable(text), people), [text, people]);
  const changes = plan.toAdd.length + plan.toComplete.length;

  async function readFile(file: File) {
    setError(null);
    if (file.size > 2_000_000) {
      setError(t.tooLarge);
      return;
    }
    const buffer = await file.arrayBuffer();
    // Excel speichert CSV oft als Windows-1252 statt UTF-8
    let content = new TextDecoder('utf-8').decode(buffer);
    if (content.includes('�')) content = new TextDecoder('windows-1252').decode(buffer);
    setText(content);
  }

  return (
    <Modal title={t.title} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">{t.intro}</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800">
            {t.chooseFile}
            <input
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="sr-only"
              aria-label={t.chooseFile}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void readFile(file);
                e.target.value = '';
              }}
            />
          </label>
          <span className="text-xs text-slate-500">{t.orPaste}</span>
        </div>
        <TextArea aria-label={t.pasteLabel} placeholder={t.placeholder} value={text} onChange={(e) => setText(e.target.value)} className="min-h-28 font-mono text-xs" />
        {error && <Banner tone="error">{error}</Banner>}
        {plan.rows.length > 0 && (
          <div className="max-h-64 overflow-auto rounded-md border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm" data-testid="import-preview">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
                <tr className="text-left text-xs text-slate-500">
                  <th className="px-2 py-1 font-medium">{texts.people.lastName}</th>
                  <th className="px-2 py-1 font-medium">{texts.people.firstName}</th>
                  <th className="px-2 py-1 font-medium">{texts.people.kind}</th>
                  <th className="px-2 py-1 font-medium">{t.status}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {plan.rows.map((row, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1">{row.person.lastName}</td>
                    <td className="px-2 py-1">{row.person.firstName}</td>
                    <td className="px-2 py-1">{row.person.kind}</td>
                    <td className={`px-2 py-1 text-xs ${STATUS_CLASS[row.status]}`}>{t.statuses[row.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {text.trim() && plan.rows.length === 0 && <Banner tone="warn">{t.nothing}</Banner>}
        {done !== null && <Banner tone="success">{t.done(done)}</Banner>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{done !== null ? texts.common.close : texts.common.cancel}</Button>
          <Button
            variant="primary"
            disabled={changes === 0}
            onClick={() => {
              setDone(applyPeopleImport(doc, plan, origin));
              setText('');
            }}
          >
            {t.apply(plan.toAdd.length, plan.toComplete.length)}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
