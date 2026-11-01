// Formular „Mehrere Anschlüsse anlegen“ im Geräte-Editor.
import { useState } from 'react';
import type { PortDef } from '@steckplan/core';
import { bulkLabels, bulkPreview, createBulkPorts, MAX_BULK_PORTS, type BulkPortOptions } from '../../lib/ports';
import { texts } from '../../texts';
import { Button, Field, TextInput } from '../ui';
import { NumberField, SelectField } from './fields';

const t = texts.library.fields;
const b = texts.library.bulk;

export function BulkPortsForm({ existing, onAdd, onClose }: { existing: PortDef[]; onAdd: (ports: PortDef[]) => void; onClose: () => void }) {
  const [options, setOptions] = useState<BulkPortOptions>({
    pattern: 'In #',
    count: 16,
    start: 1,
    pad: false,
    connector: '',
    direction: 'in',
    signal: '',
    isNetwork: false,
  });
  const set = (patch: Partial<BulkPortOptions>) => setOptions((o) => ({ ...o, ...patch }));
  const labels = bulkLabels(options);
  const count = labels.length;

  return (
    <fieldset className="space-y-3 rounded-md border border-sky-200 bg-sky-50/50 p-3 dark:border-sky-800 dark:bg-sky-950/30" aria-label={b.title}>
      <legend className="px-1 text-sm font-semibold">{b.title}</legend>
      <div className="grid gap-3 sm:grid-cols-4">
        <NumberField label={b.count} min={1} value={options.count} onChange={(value) => set({ count: Math.min(MAX_BULK_PORTS, value ?? 1) })} />
        <div className="sm:col-span-2">
          <Field label={b.pattern} hint={b.patternHint}>
            <TextInput value={options.pattern} onChange={(e) => set({ pattern: e.target.value })} />
          </Field>
        </div>
        <NumberField label={b.start} min={0} value={options.start} onChange={(value) => set({ start: value ?? 1 })} />
        <Field label={t.portConnector}>
          <TextInput list="steckplan-connectors" value={options.connector} onChange={(e) => set({ connector: e.target.value })} />
        </Field>
        <SelectField
          label={t.portDirection}
          value={options.direction}
          options={(['in', 'out', 'bi'] as const).map((d) => ({ value: d, label: t.directions[d] }))}
          onChange={(direction) => set({ direction })}
        />
        <Field label={t.portSignal}>
          <TextInput list="steckplan-signals" value={options.signal} onChange={(e) => set({ signal: e.target.value })} />
        </Field>
        <div className="flex flex-col justify-end gap-1 pb-1 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={options.pad} onChange={(e) => set({ pad: e.target.checked })} />
            {b.pad}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={options.isNetwork} onChange={(e) => set({ isNetwork: e.target.checked })} />
            {t.portNetwork}
          </label>
        </div>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300" data-testid="bulk-preview">
        {b.preview} {count > 0 ? bulkPreview(labels) : '–'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={count === 0}
          onClick={() => {
            onAdd(createBulkPorts(options, existing));
            onClose();
          }}
        >
          {b.add(count)}
        </Button>
        <Button onClick={onClose}>{texts.common.cancel}</Button>
      </div>
    </fieldset>
  );
}
