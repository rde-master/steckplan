// Personen im Projekt (Name, Vorname, Art) – Geräte „benutzt von Mensch“ werden ihnen zugeordnet.
import { Plus, Trash2, Upload } from 'lucide-react';
import { ICON } from '../icons';
import { useState, type FormEvent } from 'react';
import type * as Y from 'yjs';
import { addPerson, personKinds, removePerson, updatePerson, usesPerson, type Library, type Person } from '@steckplan/core';
import type { ProjectData } from '../../lib/useProjectData';
import { texts } from '../../texts';
import { Button, TextInput } from '../ui';
import { PeopleImportDialog } from './PeopleImportDialog';

const t = texts.people;

export function PeoplePanel({ doc, origin, data, library, editable }: { doc: Y.Doc; origin: object; data: ProjectData; library: Library | null; editable: boolean }) {
  const kinds = personKinds(data.people);
  const templates = new Map((library?.templates ?? []).map((x) => [x.id, x]));
  const [importing, setImporting] = useState(false);
  const deviceCount = (person: Person) => data.devices.filter((d) => d.personId === person.id && usesPerson(d, templates.get(d.templateId))).length;

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900" aria-label={t.title}>
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold uppercase tracking-wide text-slate-500">{t.title}</h2>
        {editable && (
          <Button variant="ghost" onClick={() => setImporting(true)}>
            <Upload {...ICON} /> {texts.peopleImport.open}
          </Button>
        )}
      </div>
      <p className="text-xs text-slate-500">{t.hint}</p>
      {importing && <PeopleImportDialog doc={doc} origin={origin} people={data.people} onClose={() => setImporting(false)} />}
      <datalist id="steckplan-person-kinds">
        {kinds.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>
      {data.people.length === 0 ? (
        <p className="text-sm text-slate-500">{t.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm" data-testid="people-table">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="pb-1 font-medium">{t.lastName}</th>
                <th className="pb-1 font-medium">{t.firstName}</th>
                <th className="pb-1 font-medium">{t.kind}</th>
                <th className="pb-1 font-medium">{t.devices}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.people.map((person) => (
                <tr key={person.id}>
                  <td className="pr-2 pb-2">
                    <TextInput aria-label={`${t.lastName}: ${person.lastName}`} value={person.lastName} disabled={!editable} onChange={(e) => updatePerson(doc, person.id, { lastName: e.target.value }, origin)} />
                  </td>
                  <td className="pr-2 pb-2">
                    <TextInput aria-label={`${t.firstName}: ${person.lastName}`} value={person.firstName} disabled={!editable} onChange={(e) => updatePerson(doc, person.id, { firstName: e.target.value }, origin)} />
                  </td>
                  <td className="pr-2 pb-2">
                    <TextInput aria-label={`${t.kind}: ${person.lastName}`} list="steckplan-person-kinds" value={person.kind} disabled={!editable} onChange={(e) => updatePerson(doc, person.id, { kind: e.target.value }, origin)} />
                  </td>
                  <td className={`pr-2 pb-2 text-center tabular-nums ${deviceCount(person) === 0 ? 'font-semibold text-amber-700 dark:text-amber-300' : ''}`} title={deviceCount(person) === 0 ? t.noDevice : undefined}>
                    {deviceCount(person)}
                  </td>
                  <td className="pb-2">
                    {editable && (
                      <Button variant="ghost" aria-label={`${texts.common.delete}: ${person.firstName} ${person.lastName}`} onClick={() => removePerson(doc, person.id, origin)}>
                        <Trash2 {...ICON} />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editable && <AddPerson onAdd={(p) => addPerson(doc, p, origin)} />}
    </section>
  );
}

/** Neue Person: Name, Vorname, Art (Art mit Vorschlägen). */
export function AddPerson({ onAdd, compact = false }: { onAdd: (person: Omit<Person, 'id'>) => void; compact?: boolean }) {
  const [person, setPerson] = useState({ lastName: '', firstName: '', kind: '' });
  const valid = person.lastName.trim() || person.firstName.trim();
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    onAdd(person);
    setPerson({ lastName: '', firstName: '', kind: '' });
  }
  return (
    <form onSubmit={submit} className={`grid gap-2 ${compact ? '' : 'sm:grid-cols-[1fr_1fr_1fr_auto]'}`} aria-label={t.add}>
      <TextInput aria-label={t.newLastName} placeholder={t.lastName} value={person.lastName} onChange={(e) => setPerson({ ...person, lastName: e.target.value })} />
      <TextInput aria-label={t.newFirstName} placeholder={t.firstName} value={person.firstName} onChange={(e) => setPerson({ ...person, firstName: e.target.value })} />
      <TextInput aria-label={t.newKind} placeholder={t.kind} list="steckplan-person-kinds" value={person.kind} onChange={(e) => setPerson({ ...person, kind: e.target.value })} />
      <Button type="submit" variant="primary" disabled={!valid}>
        <Plus {...ICON} /> {t.add}
      </Button>
    </form>
  );
}
