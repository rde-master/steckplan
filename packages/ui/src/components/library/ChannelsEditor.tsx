// Multicore: Adern/Kanäle mit Stecker an Ende A und B, optisch getrennt nach Signalrichtung.
import { ListPlus, X } from 'lucide-react';
import { ICON } from '../icons';
import { useState } from 'react';
import type { CableChannel } from '@steckplan/core';
import { bulkLabels, bulkPreview, createBulkChannels, MAX_BULK_PORTS, type BulkChannelOptions } from '../../lib/ports';
import { texts } from '../../texts';
import { Button, Field, TextInput } from '../ui';
import { NumberField, selectClass, SelectField } from './fields';

const t = texts.library.fields;
const mc = texts.library.multicore;

function endNames(endALabel?: string, endBLabel?: string): { a: string; b: string } {
  return { a: endALabel?.trim() || mc.endA, b: endBLabel?.trim() || mc.endB };
}

export function directionLabel(direction: CableChannel['direction'], ends: { a: string; b: string }): string {
  if (direction === 'aToB') return `${ends.a} → ${ends.b}`;
  if (direction === 'bToA') return `${ends.b} → ${ends.a}`;
  return `${ends.a} ↔ ${ends.b}`;
}

const GROUPS = [
  { direction: 'aToB', accent: 'border-sky-400 dark:border-sky-600', badge: 'bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100' },
  { direction: 'bToA', accent: 'border-orange-400 dark:border-orange-600', badge: 'bg-orange-100 text-orange-900 dark:bg-orange-900 dark:text-orange-100' },
  { direction: 'bi', accent: 'border-violet-400 dark:border-violet-600', badge: 'bg-violet-100 text-violet-900 dark:bg-violet-900 dark:text-violet-100' },
] as const;

export function ChannelsEditor({
  channels,
  endALabel,
  endBLabel,
  disabled,
  onChange,
}: {
  channels: CableChannel[];
  endALabel?: string;
  endBLabel?: string;
  disabled: boolean;
  onChange: (channels: CableChannel[]) => void;
}) {
  const [showBulk, setShowBulk] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const ends = endNames(endALabel, endBLabel);
  const setChannel = (index: number, patch: Partial<CableChannel>) => onChange(channels.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  const directionOptions = (['aToB', 'bToA', 'bi'] as const).map((d) => ({ value: d, label: directionLabel(d, ends) }));

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">
        {mc.channels} ({channels.length})
      </h3>
      {channels.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="pb-1 font-medium">{t.portLabel}</th>
                <th className="pb-1 font-medium">{mc.connectorAt(ends.a)}</th>
                <th className="pb-1 font-medium">{mc.connectorAt(ends.b)}</th>
                <th className="pb-1 font-medium">{t.portDirection}</th>
                <th className="pb-1 font-medium">{t.portSignal}</th>
                <th />
              </tr>
            </thead>
            {GROUPS.map(({ direction, accent, badge }) => {
              const rows = channels.map((channel, index) => ({ channel, index })).filter(({ channel }) => channel.direction === direction);
              if (rows.length === 0) return null;
              return (
                <tbody key={direction} data-testid={`channels-${direction}`}>
                  <tr>
                    <th colSpan={6} scope="rowgroup" className="pt-3 pb-1 text-left">
                      <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge}`}>
                        {directionLabel(direction, ends)} <span className="font-normal opacity-80">({rows.length})</span>
                      </span>
                    </th>
                  </tr>
                  {rows.map(({ channel, index }) => (
                    <tr key={channel.id} className="align-top">
                      <td className={`border-l-4 pr-2 pb-2 pl-2 ${accent}`}>
                        <TextInput aria-label={`${mc.channel} ${index + 1}`} value={channel.label} required onChange={(e) => setChannel(index, { label: e.target.value })} disabled={disabled} />
                      </td>
                      <td className="pr-2 pb-2">
                        <TextInput aria-label={`${mc.connectorA} ${index + 1}`} list="steckplan-connectors" value={channel.connectorA} onChange={(e) => setChannel(index, { connectorA: e.target.value })} disabled={disabled} />
                      </td>
                      <td className="pr-2 pb-2">
                        <TextInput aria-label={`${mc.connectorB} ${index + 1}`} list="steckplan-connectors" value={channel.connectorB} onChange={(e) => setChannel(index, { connectorB: e.target.value })} disabled={disabled} />
                      </td>
                      <td className="pr-2 pb-2">
                        <select
                          aria-label={`${mc.direction} ${index + 1}`}
                          className={`${selectClass} min-w-[9rem]`}
                          value={channel.direction}
                          onChange={(e) => setChannel(index, { direction: e.target.value as CableChannel['direction'] })}
                          disabled={disabled}
                        >
                          {directionOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="pr-2 pb-2">
                        <TextInput aria-label={`${mc.signal} ${index + 1}`} list="steckplan-signals" value={channel.signal} onChange={(e) => setChannel(index, { signal: e.target.value })} disabled={disabled} />
                      </td>
                      <td className="whitespace-nowrap pb-2">
                        {!disabled && (
                          <Button variant="ghost" title={t.remove} aria-label={`${t.remove} ${mc.channel} ${index + 1}`} onClick={() => onChange(channels.filter((_, i) => i !== index))}>
                            <X {...ICON} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              );
            })}
          </table>
        </div>
      )}
      {!disabled && (
        <div className="flex flex-wrap items-center gap-2">
          {!showBulk && <Button onClick={() => setShowBulk(true)}><ListPlus {...ICON} /> {mc.bulkOpen}</Button>}
          <div className="flex-1" />
          {channels.length > 1 &&
            (confirmClear ? (
              <span className="flex items-center gap-2 text-sm">
                {mc.removeAllConfirm(channels.length)}
                <Button
                  variant="danger"
                  onClick={() => {
                    onChange([]);
                    setConfirmClear(false);
                  }}
                >
                  {t.remove}
                </Button>
                <Button onClick={() => setConfirmClear(false)}>{texts.common.cancel}</Button>
              </span>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmClear(true)}>
                {mc.removeAll}
              </Button>
            ))}
        </div>
      )}
      {!disabled && showBulk && (
        <BulkChannelsForm ends={ends} directionOptions={directionOptions} onAdd={(added) => onChange([...channels, ...createBulkChannels(added, channels)])} onClose={() => setShowBulk(false)} />
      )}
    </section>
  );
}

function BulkChannelsForm({
  ends,
  directionOptions,
  onAdd,
  onClose,
}: {
  ends: { a: string; b: string };
  directionOptions: { value: CableChannel['direction']; label: string }[];
  onAdd: (options: BulkChannelOptions) => void;
  onClose: () => void;
}) {
  const b = texts.library.bulk;
  const [options, setOptions] = useState<BulkChannelOptions>({
    pattern: 'Send #',
    count: 8,
    start: 1,
    pad: false,
    connectorA: '',
    connectorB: '',
    direction: 'aToB',
    signal: '',
  });
  const set = (patch: Partial<BulkChannelOptions>) => setOptions((o) => ({ ...o, ...patch }));
  const labels = bulkLabels(options);

  return (
    <fieldset className="space-y-3 rounded-md border border-sky-200 bg-sky-50/50 p-3 dark:border-sky-800 dark:bg-sky-950/30" aria-label={mc.bulkTitle}>
      <legend className="px-1 text-sm font-semibold">{mc.bulkTitle}</legend>
      <div className="grid gap-3 sm:grid-cols-4">
        <NumberField label={b.count} min={1} value={options.count} onChange={(value) => set({ count: Math.min(MAX_BULK_PORTS, value ?? 1) })} />
        <div className="sm:col-span-2">
          <Field label={b.pattern} hint={b.patternHint}>
            <TextInput value={options.pattern} onChange={(e) => set({ pattern: e.target.value })} />
          </Field>
        </div>
        <NumberField label={b.start} min={0} value={options.start} onChange={(value) => set({ start: value ?? 1 })} />
        <Field label={mc.connectorAt(ends.a)}>
          <TextInput list="steckplan-connectors" value={options.connectorA} onChange={(e) => set({ connectorA: e.target.value })} />
        </Field>
        <Field label={mc.connectorAt(ends.b)}>
          <TextInput list="steckplan-connectors" value={options.connectorB} onChange={(e) => set({ connectorB: e.target.value })} />
        </Field>
        <SelectField label={t.portDirection} value={options.direction} options={directionOptions} onChange={(direction) => set({ direction })} />
        <Field label={t.portSignal}>
          <TextInput list="steckplan-signals" value={options.signal} onChange={(e) => set({ signal: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-4">
          <input type="checkbox" checked={options.pad} onChange={(e) => set({ pad: e.target.checked })} />
          {b.pad}
        </label>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300" data-testid="bulk-channels-preview">
        {b.preview} {labels.length > 0 ? bulkPreview(labels) : '–'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={labels.length === 0}
          onClick={() => {
            onAdd(options);
            onClose();
          }}
        >
          {mc.bulkAdd(labels.length)}
        </Button>
        <Button onClick={onClose}>{texts.common.cancel}</Button>
      </div>
    </fieldset>
  );
}
