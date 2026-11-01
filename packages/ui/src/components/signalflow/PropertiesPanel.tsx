// Eigenschaften der Auswahl: Gerät, Kabel oder Mehrfachauswahl.
import type * as Y from 'yjs';
import {
  findPort,
  rankCableTypes,
  updateCables,
  updateDevices,
  type Cable,
  type DeviceInstance,
  type Issue,
  type Library,
  type Template,
} from '@steckplan/core';
import type { ProjectData } from '../../lib/useProjectData';
import { texts } from '../../texts';
import { Banner, Button, Field, TextArea, TextInput } from '../ui';
import { ColorField, MasterSelect, selectClass } from '../library/fields';
import { deviceColor } from './model';

const s = texts.signalflow;
const f = texts.library.fields;

interface Props {
  doc: Y.Doc;
  origin: object;
  library: Library | null;
  data: ProjectData;
  selection: { devices: string[]; cables: string[] };
  issues: Issue[];
  editable: boolean;
}

export function PropertiesPanel(props: Props) {
  const { data, selection } = props;
  const devices = data.devices.filter((d) => selection.devices.includes(d.id));
  const cables = data.cables.filter((c) => selection.cables.includes(c.id));
  return (
    <aside className="h-full overflow-y-auto p-3" aria-label={s.properties}>
      {devices.length === 1 && cables.length === 0 ? (
        <DeviceProperties {...props} device={devices[0]!} />
      ) : cables.length === 1 && devices.length === 0 ? (
        <CableProperties {...props} cable={cables[0]!} />
      ) : devices.length + cables.length > 1 ? (
        <MultiProperties {...props} devices={devices} cables={cables} />
      ) : (
        <div className="space-y-2 text-sm text-slate-500">
          <p>{s.nothingSelected}</p>
          <p>
            {s.counts(data.devices.length, data.cables.length)}
          </p>
          <ul className="list-disc space-y-1 pl-4 text-xs">
            {s.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}

function Logistics({
  library,
  value,
  editable,
  onChange,
}: {
  library: Library | null;
  value: { ownerId?: string; trailerId?: string; inventoryNo?: string; notes?: string };
  editable: boolean;
  onChange: (patch: { ownerId?: string; trailerId?: string; inventoryNo?: string; notes?: string }) => void;
}) {
  return (
    <>
      <MasterSelect label={s.owner} emptyLabel={f.none} entries={library?.masterData.owners ?? []} value={value.ownerId} onChange={(ownerId) => onChange({ ownerId })} disabled={!editable} />
      <MasterSelect label={s.trailer} emptyLabel={f.none} entries={library?.masterData.trailers ?? []} value={value.trailerId} onChange={(trailerId) => onChange({ trailerId })} disabled={!editable} />
      <Field label={s.inventoryNo}>
        <TextInput value={value.inventoryNo ?? ''} onChange={(e) => onChange({ inventoryNo: e.target.value || undefined })} disabled={!editable} />
      </Field>
      <Field label={f.notes}>
        <TextArea value={value.notes ?? ''} onChange={(e) => onChange({ notes: e.target.value || undefined })} disabled={!editable} />
      </Field>
    </>
  );
}

function IssueList({ issues, id }: { issues: Issue[]; id: string }) {
  const mine = issues.filter((i) => i.objectIds.includes(id));
  if (mine.length === 0) return null;
  return (
    <Banner tone="warn">
      <ul className="space-y-1">
        {mine.map((i) => (
          <li key={i.id}>{i.message}</li>
        ))}
      </ul>
    </Banner>
  );
}

function DeviceProperties({ doc, origin, library, data, device, editable, issues }: Props & { device: DeviceInstance }) {
  const template = library?.templates.find((t) => t.id === device.templateId);
  const update = (patch: Partial<DeviceInstance>) => updateDevices(doc, [{ id: device.id, patch }], origin);
  const category = device.categoryOverride ?? template?.categoryId;
  const connected = data.cables.filter((c) => c.from.deviceId === device.id || c.to.deviceId === device.id).length;
  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-500">{template ? s.kindOf(template) : s.missingTemplate}</div>
        <h2 className="text-base font-semibold">{device.label}</h2>
        <div className="text-xs text-slate-500">
          {template?.name ?? '–'} · {s.connections(connected)}
        </div>
      </div>
      <IssueList issues={issues} id={device.id} />
      <Field label={s.label}>
        <TextInput value={device.label} onChange={(e) => update({ label: e.target.value })} disabled={!editable} />
      </Field>
      <ColorField label={s.color} value={deviceColor(device, template)} onChange={(color) => update({ colorOverride: color && color !== template?.defaultColor ? color : undefined })} disabled={!editable} />
      {device.colorOverride && editable && (
        <Button variant="ghost" onClick={() => update({ colorOverride: undefined })}>
          ↺ {s.resetColor}
        </Button>
      )}
      <MasterSelect
        label={s.category}
        emptyLabel={f.noCategory}
        entries={library?.masterData.categories ?? []}
        value={category}
        onChange={(id) => update({ categoryOverride: id === template?.categoryId ? undefined : (id ?? '') || undefined })}
        disabled={!editable}
      />
      {device.categoryOverride !== undefined && editable && (
        <Button variant="ghost" onClick={() => update({ categoryOverride: undefined })}>
          ↺ {s.resetCategory}
        </Button>
      )}
      <Logistics library={library} value={device} editable={editable} onChange={update} />
    </div>
  );
}

function portName(data: ProjectData, library: Library | null, end: Cable['from']): string {
  const device = data.devices.find((d) => d.id === end.deviceId);
  const template = library?.templates.find((t) => t.id === device?.templateId);
  const port = findPort(template, end.portId);
  return `${device?.label ?? '?'} · ${port?.label ?? end.portId}`;
}

function CableProperties({ doc, origin, library, data, cable, editable, issues }: Props & { cable: Cable }) {
  const update = (patch: Partial<Cable>) => updateCables(doc, [{ id: cable.id, patch }], origin);
  const fromDevice = data.devices.find((d) => d.id === cable.from.deviceId);
  const toDevice = data.devices.find((d) => d.id === cable.to.deviceId);
  const fromPort = findPort(library?.templates.find((t) => t.id === fromDevice?.templateId), cable.from.portId);
  const toPort = findPort(library?.templates.find((t) => t.id === toDevice?.templateId), cable.to.portId);
  const ranked: { template: Template }[] = library && fromPort && toPort ? rankCableTypes(library, fromPort, toPort) : (library?.templates.filter((t) => t.kind === 'cableType' && !t.channels).map((template) => ({ template })) ?? []);
  const value = cable.direct ? '__direct' : (cable.templateId ?? '');
  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-500">{cable.direct ? s.direct : s.cable}</div>
        <div className="text-sm">
          <div>{portName(data, library, cable.from)}</div>
          <div className="text-slate-400">↓</div>
          <div>{portName(data, library, cable.to)}</div>
        </div>
      </div>
      <IssueList issues={issues} id={cable.id} />
      <Field label={s.cableType}>
        <select
          className={selectClass}
          value={value}
          disabled={!editable}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__direct') update({ direct: true, templateId: undefined });
            else update({ direct: undefined, templateId: v || undefined });
          }}
        >
          <option value="">{s.noType}</option>
          <option value="__direct">{s.direct}</option>
          {ranked.map(({ template }) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </Field>
      {!cable.direct && (
        <>
          <Field label={s.label}>
            <TextInput value={cable.label ?? ''} placeholder={s.cableLabelPlaceholder} onChange={(e) => update({ label: e.target.value || undefined })} disabled={!editable} />
          </Field>
          <Logistics library={library} value={cable} editable={editable} onChange={update} />
        </>
      )}
    </div>
  );
}

function MultiProperties({ doc, origin, library, devices, cables, editable }: Props & { devices: DeviceInstance[]; cables: Cable[] }) {
  const items = devices.length + cables.length;
  const setAll = (patch: { ownerId?: string; trailerId?: string }) => {
    updateDevices(doc, devices.map((d) => ({ id: d.id, patch })), origin);
    updateCables(doc, cables.filter((c) => !c.direct).map((c) => ({ id: c.id, patch })), origin);
  };
  const common = <K extends 'ownerId' | 'trailerId'>(key: K) => {
    const values = new Set([...devices, ...cables.filter((c) => !c.direct)].map((x) => x[key]));
    return values.size === 1 ? [...values][0] : undefined;
  };
  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">{s.multiSelected(items)}</h2>
      <p className="text-xs text-slate-500">{s.multiHint}</p>
      <MasterSelect label={s.owner} emptyLabel={f.none} entries={library?.masterData.owners ?? []} value={common('ownerId')} onChange={(ownerId) => setAll({ ownerId })} disabled={!editable} />
      <MasterSelect label={s.trailer} emptyLabel={f.none} entries={library?.masterData.trailers ?? []} value={common('trailerId')} onChange={(trailerId) => setAll({ trailerId })} disabled={!editable} />
      {devices.length > 0 && (
        <MasterSelect
          label={s.category}
          emptyLabel={f.noCategory}
          entries={library?.masterData.categories ?? []}
          value={undefined}
          onChange={(categoryOverride) => updateDevices(doc, devices.map((d) => ({ id: d.id, patch: { categoryOverride } })), origin)}
          disabled={!editable}
        />
      )}
    </div>
  );
}
