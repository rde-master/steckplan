// Gegenüberstellung abweichender Vorlagen/Stammdaten (eigene ↔ fremde) mit Entscheidung pro Eintrag oder für alle.
import { useState } from 'react';
import {
  MASTER_KIND_LABELS,
  TEMPLATE_KIND_LABELS,
  type Conflict,
  type Library,
  type MasterEntry,
  type MasterKind,
  type Resolution,
  type Template,
} from '@steckplan/core';
import { masterName } from '../lib/library';
import { formatMeterList, formatMeters } from '../lib/units';
import { texts } from '../texts';
import { Banner, Button, Modal } from './ui';

const c = texts.library.conflicts;
const f = texts.library.fields;

const FIELD_LABELS: Record<string, string> = {
  name: f.name,
  manufacturer: f.manufacturer,
  categoryId: f.category,
  defaultColor: f.color,
  defaultOwnerId: f.owner,
  defaultTrailerId: f.trailer,
  defaultCaseId: f.case,
  usedByPerson: f.usedByPerson,
  stock: f.stock,
  stockByLength: f.stockByLength,
  tBarLengthMm: f.tBarLength,
  mixer: f.mixer,
  phantomPower: f.phantomPower,
  networkChannels: f.networkChannels,
  shape: `${f.form} / Maße`,
  ports: f.ports,
  dmxModes: f.dmxModes,
  powerW: f.power,
  maxMountedDevices: f.maxMounted,
  lengthMm: f.length,
  notes: f.notes,
  connectorA: f.connectorA,
  connectorB: f.connectorB,
  signal: f.signal,
  maxLengthMm: f.maxLength,
  availableLengthsMm: f.lengths,
  color: f.color,
  contact: texts.library.master.contact,
  channels: texts.library.multicore.channels,
  endALabel: texts.library.multicore.endALabel,
  endBLabel: texts.library.multicore.endBLabel,
};

function display(field: string, value: unknown, library: Library | null): string {
  if (value === undefined || value === null || value === '') return '–';
  switch (field) {
    case 'categoryId':
      return masterName(library, 'categories', value as string);
    case 'defaultOwnerId':
      return masterName(library, 'owners', value as string);
    case 'defaultTrailerId':
      return masterName(library, 'trailers', value as string);
    case 'defaultCaseId':
      return masterName(library, 'cases', value as string);
    case 'shape': {
      const s = value as NonNullable<Template['shape']>;
      return `${f.forms[s.form]} ${formatMeters(s.widthMm)} × ${formatMeters(s.depthMm)}${s.heightMm ? ` × ${formatMeters(s.heightMm)}` : ''} m`;
    }
    case 'ports':
      return (value as NonNullable<Template['ports']>).map((p) => `${p.label} (${p.connector}, ${f.directions[p.direction]})`).join('; ');
    case 'channels':
      return (value as NonNullable<Template['channels']>).map((c) => `${c.label} (${c.connectorA} ↔ ${c.connectorB})`).join('; ');
    case 'dmxModes':
      return (value as NonNullable<Template['dmxModes']>).map((d) => `${d.name}: ${d.channels}`).join('; ');
    case 'lengthMm':
    case 'maxLengthMm':
      return `${formatMeters(value as number)} m`;
    case 'availableLengthsMm':
      return `${formatMeterList(value as number[])} m`;
    default:
      return String(value);
  }
}

function kindLabel(conflict: Conflict): string {
  return conflict.kind === 'template'
    ? TEMPLATE_KIND_LABELS[(conflict.theirs as Template).kind].singular
    : MASTER_KIND_LABELS[conflict.kind as MasterKind].singular;
}

export function ConflictDialog({
  conflicts,
  additions,
  library,
  onSubmit,
  onClose,
}: {
  conflicts: Conflict[];
  additions?: number;
  library: Library | null;
  onSubmit: (resolutions: Record<string, Resolution>) => Promise<void>;
  onClose: () => void;
}) {
  const [choices, setChoices] = useState<Record<string, Resolution>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const complete = conflicts.every((x) => choices[x.key]);

  const setAll = (resolution: Resolution) => setChoices(Object.fromEntries(conflicts.map((x) => [x.key, resolution])));

  return (
    <Modal
      title={c.title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{texts.common.cancel}</Button>
          <Button
            variant="primary"
            disabled={!complete || busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onSubmit(choices);
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
                setBusy(false);
              }
            }}
          >
            {c.apply}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p>{c.intro}</p>
        {additions ? <p className="text-slate-500">{c.additions(additions)}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-500">{c.forAll}</span>
          <Button onClick={() => setAll('keep')}>{c.keep}</Button>
          <Button onClick={() => setAll('theirs')}>{c.take}</Button>
          <Button onClick={() => setAll('copy')}>{c.copy}</Button>
        </div>
        {error && <Banner tone="error">{error}</Banner>}
        <ul className="space-y-3">
          {conflicts.map((conflict) => {
            const ours = conflict.ours as Record<string, unknown>;
            const theirs = conflict.theirs as Record<string, unknown>;
            return (
              <li key={conflict.key} className="rounded-md border border-slate-200 p-3 dark:border-slate-700" data-testid="conflict">
                <div className="mb-2 font-medium">
                  {kindLabel(conflict)}: {(conflict.ours as Template | MasterEntry).name}
                </div>
                <table className="mb-2 w-full table-fixed text-xs">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="w-1/4 font-medium" />
                      <th className="font-medium">{c.ours}</th>
                      <th className="font-medium">{c.theirs}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conflict.fields.map((field) => (
                      <tr key={field} className="align-top">
                        <td className="pr-2 text-slate-500">{FIELD_LABELS[field] ?? field}</td>
                        <td className="pr-2 break-words">{display(field, ours[field], library)}</td>
                        <td className="break-words">{display(field, theirs[field], library)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex flex-wrap gap-3" role="radiogroup" aria-label={(conflict.ours as Template).name}>
                  {(
                    [
                      ['keep', c.keep, c.keepHint],
                      ['theirs', c.take, c.takeHint],
                      ['copy', c.copy, c.copyHint],
                    ] as const
                  ).map(([value, label, hint]) => (
                    <label key={value} className="flex items-center gap-1.5" title={hint}>
                      <input type="radio" name={conflict.key} checked={choices[conflict.key] === value} onChange={() => setChoices({ ...choices, [conflict.key]: value })} />
                      {label}
                    </label>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}
