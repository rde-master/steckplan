// Längenaufschlüsselung für Kabel und Multicores (immer frisch berechnet).
import { RotateCcw } from 'lucide-react';
import { ICON } from '../icons';
import type * as Y from 'yjs';
import {
  computeCableLength,
  computeMulticoreLength,
  formatCableLength,
  formatMeters,
  lengthContext,
  updateCables,
  updateDevices,
  type Cable,
  type CableLength,
  type DeviceInstance,
  type Library,
} from '@steckplan/core';
import type { ProjectData } from '../../lib/useProjectData';
import { texts } from '../../texts';
import { Banner, Button, Field, TextInput } from '../ui';
import { MeterField, selectClass } from '../library/fields';

const l = texts.length;

function Breakdown({ length }: { length: CableLength }) {
  if (length.status === 'open') return <p className="text-sm text-amber-700">{l.open}</p>;
  if (length.status === 'direct') return null;
  return (
    <div className="space-y-1 text-sm" data-testid="cable-length">
      {length.status === 'computed' && (
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 text-slate-600 dark:text-slate-300">
          <dt>{l.plan}</dt>
          <dd className="text-right tabular-nums">{formatMeters(length.planMm ?? 0)}</dd>
          <dt>{l.height}</dt>
          <dd className="text-right tabular-nums">{formatMeters(length.heightMm ?? 0)}</dd>
          <dt>{l.reserve}</dt>
          <dd className="text-right tabular-nums">{formatMeters(length.reserveMm ?? 0)}</dd>
          <dt className="font-medium text-slate-900 dark:text-slate-100">{l.total}</dt>
          <dd className="text-right font-medium tabular-nums text-slate-900 dark:text-slate-100">{formatMeters(length.totalMm ?? 0)}</dd>
        </dl>
      )}
      <div className="flex items-baseline justify-between rounded-md bg-slate-100 px-2 py-1 dark:bg-slate-800">
        <span>{length.status === 'manual' ? l.manualChosen : l.chosen}</span>
        <strong className="tabular-nums" data-testid="chosen-length">
          {length.chosenMm === null ? l.extension : formatCableLength(length.chosenMm)}
        </strong>
      </div>
      {length.needsExtension && <Banner tone="warn">{l.extensionHint}</Banner>}
      {length.exceedsMax && <Banner tone="warn">{l.exceedsMax}</Banner>}
    </div>
  );
}

export function CableLengthSection({ doc, origin, library, data, cable, editable }: { doc: Y.Doc; origin: object; library: Library | null; data: ProjectData; cable: Cable; editable: boolean }) {
  const update = (patch: Partial<Cable>) => updateCables(doc, [{ id: cable.id, patch }], origin);
  const length = computeCableLength(cable, lengthContext(data.devices, library?.templates ?? [], data.settings));
  return (
    <section className="space-y-2 rounded-md border border-slate-200 p-2 dark:border-slate-700" aria-label={l.title}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{l.title}</div>
      <Breakdown length={length} />
      <Field label={l.heightRule}>
        <select className={selectClass} value={cable.heightRule ?? 'floor'} disabled={!editable} onChange={(e) => update({ heightRule: e.target.value === 'floor' ? undefined : 'direct' })}>
          <option value="floor">{l.floor}</option>
          <option value="direct">{l.direct}</option>
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={l.reservePercent}>
          <TextInput
            type="number"
            min={0}
            placeholder={String(data.settings.defaultReservePercent ?? 10)}
            value={cable.reservePercent ?? ''}
            disabled={!editable}
            onChange={(e) => update({ reservePercent: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })}
          />
        </Field>
        <MeterField label={l.reservePerEnd} value={cable.reservePerEndMm} disabled={!editable} onChange={(reservePerEndMm) => update({ reservePerEndMm })} />
      </div>
      <MeterField label={l.manual} value={cable.manualLengthMm} disabled={!editable} onChange={(manualLengthMm) => update({ manualLengthMm })} />
      {editable && cable.waypoints.length > 0 && (
        <Button variant="ghost" onClick={() => update({ waypoints: [] })}>
          <RotateCcw {...ICON} /> {l.clearWaypoints(cable.waypoints.length)}
        </Button>
      )}
    </section>
  );
}

export function MulticoreLengthSection({ doc, origin, library, data, device, editable }: { doc: Y.Doc; origin: object; library: Library | null; data: ProjectData; device: DeviceInstance; editable: boolean }) {
  const template = library?.templates.find((t) => t.id === device.templateId);
  const length = computeMulticoreLength(device, template, data.settings);
  const update = (patch: Partial<DeviceInstance>) => updateDevices(doc, [{ id: device.id, patch }], origin);
  const stage = device.stagePlan;
  return (
    <section className="space-y-2 rounded-md border border-slate-200 p-2 dark:border-slate-700" aria-label={l.title}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{l.title}</div>
      <Breakdown length={length} />
      {stage && !stage.endB && editable && (
        <Button onClick={() => update({ stagePlan: { ...stage, endB: { x: stage.position.x + 5000, y: stage.position.y } } })}>{l.setEndB}</Button>
      )}
      <MeterField label={l.manual} value={device.manualLengthMm} disabled={!editable} onChange={(manualLengthMm) => update({ manualLengthMm })} />
      {editable && stage?.waypoints && stage.waypoints.length > 0 && (
        <Button variant="ghost" onClick={() => update({ stagePlan: { ...stage, waypoints: [] } })}>
          <RotateCcw {...ICON} /> {l.clearWaypoints(stage.waypoints.length)}
        </Button>
      )}
    </section>
  );
}
