// Eigenschaften (seit Format 4): benutzt von Mensch + Person, Gruppe, T-Bar am Stativ.
import { RotateCcw } from 'lucide-react';
import { ICON } from '../icons';
import { useState } from 'react';
import type * as Y from 'yjs';
import {
  addPerson,
  assignGroup,
  networkChannelCount,
  networkRoutes,
  defectTargets,
  setDefect,
  entryForPort,
  routeForEntry,
  setPortChannel,
  createGroup,
  personName,
  removeGroup,
  standLayout,
  tBarLength,
  updateDevices,
  updateGroup,
  usesPerson,
  type DeviceInstance,
  type Library,
  type Template,
} from '@steckplan/core';
import type { ProjectData } from '../../lib/useProjectData';
import { texts } from '../../texts';
import { Button, Field, TextInput } from '../ui';
import { ColorField, MeterField, selectClass } from '../library/fields';
import { AddPerson } from '../project/PeoplePanel';

const p = texts.people;
const g = texts.groups;
const st = texts.stand;
const NEW = '__neu';

interface SectionProps {
  doc: Y.Doc;
  origin: object;
  library: Library | null;
  data: ProjectData;
  device: DeviceInstance;
  editable: boolean;
}

/** „Benutzt von Mensch“ (Vorgabe aus der Vorlage, je Gerät änderbar) und Person zuordnen. */
export function PersonSection({ doc, origin, library, data, device, editable }: SectionProps) {
  const template = library?.templates.find((t) => t.id === device.templateId);
  const [adding, setAdding] = useState(false);
  if (template && template.kind !== 'device') return null;
  const active = usesPerson(device, template);
  const update = (patch: Partial<DeviceInstance>) => updateDevices(doc, [{ id: device.id, patch }], origin);
  return (
    <div className="space-y-2 rounded-md border border-slate-200 p-2 dark:border-slate-700" data-testid="person-section">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={active} disabled={!editable} onChange={(e) => update({ usedByPerson: e.target.checked === (template?.usedByPerson ?? false) ? undefined : e.target.checked })} />
        {p.usedByPerson}
      </label>
      {device.usedByPerson !== undefined && (
        <div className="flex items-center gap-2 pl-6 text-xs text-slate-500">
          {p.fromTemplate(template?.usedByPerson ?? false)}
          {editable && (
            <button type="button" className="underline" onClick={() => update({ usedByPerson: undefined })}>
              {p.resetToTemplate}
            </button>
          )}
        </div>
      )}
      {active && (
        <>
          <Field label={p.person}>
            <select
              className={selectClass}
              value={device.personId ?? ''}
              disabled={!editable}
              onChange={(e) => {
                if (e.target.value === NEW) setAdding(true);
                else update({ personId: e.target.value || undefined });
              }}
            >
              <option value="">{p.noPerson}</option>
              {data.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {personName(person)}
                  {person.kind ? ` (${person.kind})` : ''}
                </option>
              ))}
              {editable && <option value={NEW}>{p.newPerson}</option>}
            </select>
          </Field>
          {adding && (
            <AddPerson
              compact
              onAdd={(person) => {
                const created = addPerson(doc, person, origin);
                update({ personId: created.id });
                setAdding(false);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

/** Gruppe des Geräts: wählen, neu aus Auswahl, umbenennen, Farbe, auflösen. */
export function GroupSection({ doc, origin, data, devices, editable }: { doc: Y.Doc; origin: object; data: ProjectData; devices: DeviceInstance[]; editable: boolean }) {
  const ids = devices.map((d) => d.id);
  const groupIds = new Set(devices.map((d) => d.groupId ?? ''));
  const current = groupIds.size === 1 ? data.groups.find((x) => x.id === [...groupIds][0]) : undefined;
  return (
    <div className="space-y-2" data-testid="group-section">
      <Field label={g.group}>
        <select
          className={selectClass}
          value={groupIds.size === 1 ? ([...groupIds][0] ?? '') : ''}
          disabled={!editable}
          onChange={(e) => {
            const v = e.target.value;
            if (v === NEW) createGroup(doc, ids, origin);
            else assignGroup(doc, ids, v || undefined, origin);
          }}
        >
          <option value="">{g.noGroup}</option>
          {data.groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
          {editable && <option value={NEW}>{g.newGroup}</option>}
        </select>
      </Field>
      {current && (
        <div className="space-y-2 pl-2">
          <Field label={g.name}>
            <TextInput value={current.name} disabled={!editable} onChange={(e) => updateGroup(doc, current.id, { name: e.target.value }, origin)} />
          </Field>
          <ColorField label={g.color} value={current.color} disabled={!editable} onChange={(color) => updateGroup(doc, current.id, { color }, origin)} />
          {editable && (
            <Button variant="ghost" onClick={() => removeGroup(doc, current.id, origin)}>
              {g.dissolve}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Stativ: Länge der T-Bar; angedockte Geräte werden neu nebeneinander verteilt. */
export function TBarSection({ doc, origin, library, data, device, editable }: SectionProps) {
  const template = library?.templates.find((t) => t.id === device.templateId);
  if (template?.kind !== 'stand') return null;
  const templates = new Map((library?.templates ?? []).map((t) => [t.id, t]));
  const apply = (tBarLengthMm: number | undefined) => {
    const stand = { ...device, tBarLengthMm };
    const devices = data.devices.map((d) => (d.id === device.id ? stand : d));
    updateDevices(
      doc,
      [
        { id: device.id, patch: { tBarLengthMm } },
        ...standLayout(stand, devices, templates).map((pl) => ({
          id: pl.id,
          patch: { stagePlan: { ...data.devices.find((d) => d.id === pl.id)!.stagePlan!, position: pl.position, rotationDeg: pl.rotationDeg ?? 0 } },
        })),
      ],
      origin,
    );
  };
  return (
    <div className="space-y-1">
      <MeterField label={st.tBarLength} value={tBarLength(device, template)} onChange={apply} disabled={!editable} />
      {device.tBarLengthMm !== undefined && editable && (
        <Button variant="ghost" onClick={() => apply(undefined)}>
          <RotateCcw {...ICON} /> {st.resetTBar}
        </Button>
      )}
    </div>
  );
}

/** Gerät an einem Stativ: hängt unten oder steht oben auf der T-Bar. */
export function MountSideSection({ doc, origin, library, data, device, editable }: SectionProps) {
  const carrier = device.mountedOnId ? data.devices.find((d) => d.id === device.mountedOnId) : undefined;
  const carrierTemplate: Template | undefined = carrier ? library?.templates.find((t) => t.id === carrier.templateId) : undefined;
  if (carrierTemplate?.kind !== 'stand') return null;
  const side = device.mountSide ?? 'bottom';
  return (
    <div className="space-y-1" role="radiogroup" aria-label={st.mountSide}>
      <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
        {st.mountSide} „{carrier!.label}“
      </div>
      <div className="flex gap-4 text-sm">
        {(['bottom', 'top'] as const).map((value) => (
          <label key={value} className="flex items-center gap-1.5">
            <input
              type="radio"
              name={`mount-${device.id}`}
              checked={side === value}
              disabled={!editable}
              onChange={() => updateDevices(doc, [{ id: device.id, patch: { mountSide: value === 'bottom' ? undefined : value } }], origin)}
            />
            {value === 'bottom' ? st.bottom : st.top}
          </label>
        ))}
      </div>
    </div>
  );
}

/** Defekte Anschlüsse (bei Multicores: Adern) dieses Geräts – nur im Projekt, nicht in der Bibliothek. */
export function DefectSection({ doc, origin, library, device, editable }: SectionProps) {
  const t = texts.defects;
  const template = library?.templates.find((x) => x.id === device.templateId);
  const targets = defectTargets(template);
  const marked = new Map((device.defectivePorts ?? []).map((d) => [d.portId, d]));
  const [open, setOpen] = useState(marked.size > 0);
  if (targets.length === 0) return null;
  const save = (defectivePorts: DeviceInstance['defectivePorts']) => updateDevices(doc, [{ id: device.id, patch: { defectivePorts } }], origin);
  return (
    <details className="rounded-md border border-slate-200 p-2 dark:border-slate-700" open={open} onToggle={(e) => setOpen(e.currentTarget.open)} data-testid="defect-section">
      <summary className="cursor-pointer text-sm font-medium">
        {template && template.kind === 'cableType' ? t.titleCores : t.title}
        {marked.size > 0 && <span className="ml-1 font-semibold text-red-700 dark:text-red-400">({marked.size})</span>}
      </summary>
      <p className="mt-1 text-xs text-slate-500">{t.hint}</p>
      <ul className="mt-2 space-y-1">
        {targets.map((target) => {
          const defect = marked.get(target.key);
          return (
            <li key={target.key} className="space-y-1">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!defect}
                  disabled={!editable}
                  aria-label={t.mark(target.label)}
                  onChange={(e) => save(setDefect(device, target.key, e.target.checked ? {} : false))}
                />
                <span className={defect ? 'font-medium text-red-700 dark:text-red-400' : ''}>{target.label}</span>
              </label>
              {defect && (
                <div className="pl-6">
                  <TextInput
                    aria-label={t.note(target.label)}
                    placeholder={t.notePlaceholder}
                    value={defect.note ?? ''}
                    maxLength={500}
                    disabled={!editable}
                    onChange={(e) => save(setDefect(device, target.key, { note: e.target.value }))}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/** Quelle → Kanal eines Mischpults über eine digitale Stagebox, je Ausgang (nur bei durchgehender Kette). */
export function MixerChannelSection({ doc, origin, library, data, device, editable }: SectionProps) {
  const t = texts.netChannels;
  if (!library) return null;
  const routes = networkRoutes(device, data, library);
  const entries = device.mixerChannels ?? [];
  if (routes.length === 0 && entries.length === 0) return null;
  const templates = new Map(library.templates.map((x) => [x.id, x]));
  const ports = [...new Map(routes.map((r) => [r.sourcePortId, r.sourcePort])).entries()];
  const broken = entries.filter((e) => !routeForEntry(routes, e));
  const save = (mixerChannels: DeviceInstance['mixerChannels']) => updateDevices(doc, [{ id: device.id, patch: { mixerChannels } }], origin);
  const occupiedBy = (portId: string, mixerId: string, channel: number) =>
    data.devices
      .flatMap((d) => (d.mixerChannels ?? []).filter((e) => e.mixerId === mixerId && e.channel === channel).map((e) => ({ d, e })))
      .find(({ d, e }) => d.id !== device.id || (e.portId ?? routeForEntry(routes, e)?.sourcePortId) !== portId)?.d.label;
  return (
    <div className="space-y-2 rounded-md border border-slate-200 p-2 dark:border-slate-700" data-testid="mixer-channel-section">
      {ports.map(([portId, portLabel]) => {
        const current = entryForPort(routes, entries, portId);
        const portRoutes = routes.filter((r) => r.sourcePortId === portId);
        return (
          <Field key={portId} label={ports.length > 1 ? t.labelPort(portLabel) : t.label}>
            <select
              className={selectClass}
              value={current ? `${current.mixerId}:${current.channel}` : ''}
              disabled={!editable}
              onChange={(e) => {
                const v = e.target.value;
                const target = v ? { mixerId: v.slice(0, v.lastIndexOf(':')), channel: Number(v.slice(v.lastIndexOf(':') + 1)) } : undefined;
                save(setPortChannel(routes, entries, portId, target));
              }}
            >
              <option value="">{t.none}</option>
              {portRoutes.map((r) => (
                <optgroup key={`${r.mixer.id}/${r.stagebox.id}/${r.stageboxPortId}`} label={t.group(r.mixer.label, r.stagebox.label, r.stageboxPort)}>
                  {Array.from({ length: networkChannelCount(r.mixer, templates.get(r.mixer.templateId)) }, (_, i) => i + 1).map((ch) => {
                    const busy = occupiedBy(portId, r.mixer.id, ch);
                    return (
                      <option key={ch} value={`${r.mixer.id}:${ch}`}>
                        {t.option(r.mixer.label, ch)}
                        {busy ? ` (${t.busy(busy)})` : ''}
                      </option>
                    );
                  })}
                </optgroup>
              ))}
            </select>
          </Field>
        );
      })}
      {routes.length > 0 && <p className="text-xs text-slate-500">{t.hint}</p>}
      {broken.map((e) => (
        <div key={`${e.portId ?? ''}:${e.mixerId}:${e.channel}`} className="flex flex-wrap items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-300">
          {t.broken(data.devices.find((d) => d.id === e.mixerId)?.label ?? '?', e.channel)}
          {editable && (
            <Button
              variant="ghost"
              className="min-h-7 px-2 text-xs"
              onClick={() => {
                const rest = entries.filter((x) => x !== e);
                save(rest.length ? rest : undefined);
              }}
            >
              {t.remove}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
