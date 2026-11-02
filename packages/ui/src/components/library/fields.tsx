// Eingabefelder für die Vorlagen-Editoren.
import { X } from 'lucide-react';
import { ICON } from '../icons';
import { useId, useState } from 'react';
import { MASTER_KIND_LABELS, type MasterEntry, type MasterKind } from '@steckplan/core';
import { api, errorMessage } from '../../lib/api';
import { useLibrary } from '../../lib/library';
import { formatMeters, parseMeters } from '../../lib/units';
import { texts } from '../../texts';
import { Button, Field, TextInput } from '../ui';

const selectClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 disabled:bg-slate-100 sm:text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';

/** Eingabe in Metern, gespeichert in Millimetern. Übernimmt den Wert beim Verlassen des Feldes. */
export function MeterField({
  label,
  value,
  onChange,
  disabled,
  required,
}: {
  label: string;
  value: number | undefined;
  onChange: (mm: number | undefined) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const [text, setText] = useState(formatMeters(value));
  const [invalid, setInvalid] = useState(false);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    // Wert wurde von außen geändert (z. B. andere Vorlage gewählt)
    setLastValue(value);
    setText(formatMeters(value));
    setInvalid(false);
  }
  return (
    <Field label={label} hint={invalid ? texts.library.fields.invalidNumber : undefined}>
      <TextInput
        inputMode="decimal"
        value={text}
        disabled={disabled}
        required={required}
        aria-invalid={invalid}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = parseMeters(e.target.value);
          setInvalid(parsed === null);
          if (parsed !== null) {
            setLastValue(parsed);
            onChange(parsed);
          }
        }}
        onBlur={() => !invalid && setText(formatMeters(value))}
      />
    </Field>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  disabled,
  min = 0,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  disabled?: boolean;
  min?: number;
}) {
  return (
    <Field label={label}>
      <TextInput
        type="number"
        min={min}
        step={1}
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Math.max(min, Math.round(Number(e.target.value))))}
      />
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <Field label={label}>
      <select className={selectClass} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

const NEW_ENTRY = '__neu';

/**
 * Auswahl aus Stammdaten; archivierte Einträge nur, wenn sie bereits gesetzt sind.
 * Mit `createKind` lässt sich direkt ein neuer Eintrag anlegen („+ Neu anlegen …“).
 */
export function MasterSelect({
  label,
  emptyLabel,
  entries,
  value,
  onChange,
  disabled,
  createKind,
}: {
  label: string;
  emptyLabel: string;
  entries: MasterEntry[];
  value: string | undefined;
  onChange: (id: string | undefined) => void;
  disabled?: boolean;
  createKind?: MasterKind;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<MasterEntry | null>(null);
  const all = created && !entries.some((e) => e.id === created.id) ? [...entries, created] : entries;
  const options = all.filter((e) => !e.archived || e.id === value);
  const known = !value || options.some((e) => e.id === value);

  async function create() {
    if (!createKind || !name.trim()) return;
    setError(null);
    try {
      const entry = await api.createMaster(createKind, { name: name.trim() });
      setCreated(entry);
      onChange(entry.id);
      setCreating(false);
      setName('');
      void useLibrary.getState().load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div>
      <Field label={label}>
        <select
          className={selectClass}
          value={value ?? ''}
          disabled={disabled}
          onChange={(e) => {
            if (e.target.value === NEW_ENTRY) setCreating(true);
            else onChange(e.target.value || undefined);
          }}
        >
          <option value="">{emptyLabel}</option>
          {options.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
              {e.archived ? ` (${texts.library.master.archived})` : ''}
            </option>
          ))}
          {!known && <option value={value}>(unbekannt)</option>}
          {createKind && <option value={NEW_ENTRY}>{texts.library.master.createInline(MASTER_KIND_LABELS[createKind].singular)}</option>}
        </select>
      </Field>
      {creating && createKind && (
        <div className="mt-1 flex gap-1">
          <TextInput
            aria-label={texts.library.master.newName(MASTER_KIND_LABELS[createKind].singular)}
            placeholder={texts.library.master.newName(MASTER_KIND_LABELS[createKind].singular)}
            value={name}
            autoFocus
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void create();
              }
              if (e.key === 'Escape') setCreating(false);
            }}
          />
          <Button variant="primary" disabled={!name.trim()} onClick={() => void create()}>
            {texts.library.master.create}
          </Button>
          <Button variant="ghost" onClick={() => setCreating(false)} aria-label={texts.common.cancel}>
            <X {...ICON} />
          </Button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export const PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#ec4899',
  '#78716c', '#64748b', '#1e293b', '#ffffff',
];

export function ColorField({ label, value, onChange, disabled }: { label: string; value: string | undefined; onChange: (color: string | undefined) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200" id={id}>
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-labelledby={id}>
        {PALETTE.map((color) => (
          <button
            key={color}
            type="button"
            disabled={disabled}
            title={color}
            aria-label={`Farbe ${color}`}
            aria-pressed={value === color}
            onClick={() => onChange(color)}
            className={`h-7 w-7 rounded-md border ${value === color ? 'ring-2 ring-sky-500 ring-offset-2 dark:ring-offset-slate-900' : ''} border-slate-300 dark:border-slate-600`}
            style={{ backgroundColor: color }}
          />
        ))}
        <input
          type="color"
          aria-label="Eigene Farbe"
          disabled={disabled}
          value={value ?? '#94a3b8'}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-10 cursor-pointer rounded-md border border-slate-300 bg-transparent dark:border-slate-600"
        />
        {value && !disabled && (
          <button type="button" className="text-xs text-slate-500 underline" onClick={() => onChange(undefined)}>
            {texts.library.fields.remove}
          </button>
        )}
      </div>
    </div>
  );
}

export { selectClass };
