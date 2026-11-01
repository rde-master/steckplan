// Eigenschaften: DMX (Modus, Universum, Adresse, Auto-Adressierung) und Netzwerk (pro Netzwerk-Anschluss).
import { useState } from 'react';
import type * as Y from 'yjs';
import {
  autoAddress,
  channelsOf,
  dmxChain,
  formatDmx,
  isDmxDevice,
  networkPorts,
  suggestIp,
  updateDevices,
  withNetworkEntry,
  type DeviceInstance,
  type Library,
} from '@steckplan/core';
import type { ProjectData } from '../../lib/useProjectData';
import { texts } from '../../texts';
import { Banner, Button, Field, TextInput } from '../ui';
import { selectClass } from '../library/fields';

const t = texts.tech;

export function DmxSection({ doc, origin, library, data, device, editable }: { doc: Y.Doc; origin: object; library: Library | null; data: ProjectData; device: DeviceInstance; editable: boolean }) {
  const templates = new Map((library?.templates ?? []).map((x) => [x.id, x]));
  const template = templates.get(device.templateId);
  const [message, setMessage] = useState<string | null>(null);
  if (!isDmxDevice(template)) return null;
  const modes = template!.dmxModes!;
  const dmx = device.dmx;
  const update = (patch: Partial<NonNullable<DeviceInstance['dmx']>> | null) =>
    updateDevices(doc, [{ id: device.id, patch: { dmx: patch === null ? undefined : { modeName: modes[0]!.name, universe: 1, address: 1, ...dmx, ...patch } } }], origin);
  const channels = channelsOf(device, template);

  function autoFromHere() {
    const start = dmx ?? { universe: 1, address: 1 };
    const chain = dmxChain(device.id, data, templates);
    const result = autoAddress(chain, { universe: start.universe, address: start.address }, data, templates);
    updateDevices(doc, result.patches.map((p) => ({ id: p.id, patch: { dmx: p.dmx } })), origin);
    setMessage(t.autoDone(result.patches.length, result.wrapped.length));
  }

  return (
    <section className="space-y-2 rounded-md border border-slate-200 p-2 dark:border-slate-700" aria-label="DMX">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">DMX</span>
        {dmx && channels !== undefined && (
          <span className="text-xs tabular-nums text-slate-600 dark:text-slate-300" data-testid="dmx-range">
            {formatDmx(dmx.universe, dmx.address)} – {formatDmx(dmx.universe, dmx.address + channels - 1)}
          </span>
        )}
      </div>
      <Field label={t.mode}>
        <select className={selectClass} value={dmx?.modeName ?? ''} disabled={!editable} onChange={(e) => update(e.target.value ? { modeName: e.target.value } : null)}>
          <option value="">{t.noDmx}</option>
          {modes.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name} ({m.channels} {t.channels})
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t.universe}>
          <TextInput type="number" min={1} value={dmx?.universe ?? ''} disabled={!editable} onChange={(e) => update({ universe: Math.max(1, Math.round(Number(e.target.value) || 1)) })} />
        </Field>
        <Field label={t.address}>
          <TextInput type="number" min={1} max={512} value={dmx?.address ?? ''} disabled={!editable} onChange={(e) => update({ address: Math.min(512, Math.max(1, Math.round(Number(e.target.value) || 1))) })} />
        </Field>
      </div>
      {editable && (
        <Button onClick={autoFromHere} title={t.autoHint}>
          ⇢ {t.auto}
        </Button>
      )}
      {message && <Banner tone="info">{message}</Banner>}
    </section>
  );
}

export function NetworkSection({ doc, origin, library, data, device, editable }: { doc: Y.Doc; origin: object; library: Library | null; data: ProjectData; device: DeviceInstance; editable: boolean }) {
  const template = library?.templates.find((x) => x.id === device.templateId);
  const ports = networkPorts(template);
  if (ports.length === 0) return null;
  return (
    <section className="space-y-3 rounded-md border border-slate-200 p-2 dark:border-slate-700" aria-label={t.network}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.network}</div>
      {ports.map((port) => (
        <NetworkPortFields key={port.id} doc={doc} origin={origin} data={data} device={device} portId={port.id} portLabel={ports.length > 1 ? port.label : undefined} editable={editable} />
      ))}
    </section>
  );
}

export function NetworkPortFields({
  doc,
  origin,
  data,
  device,
  portId,
  portLabel,
  editable,
  compact = false,
}: {
  doc: Y.Doc;
  origin: object;
  data: ProjectData;
  device: DeviceInstance;
  portId: string;
  portLabel?: string;
  editable: boolean;
  compact?: boolean;
}) {
  const entry = device.network?.find((n) => n.portId === portId) ?? { portId, mode: 'static' as const };
  const set = (patch: Partial<typeof entry>) => updateDevices(doc, [{ id: device.id, patch: { network: withNetworkEntry(device, { ...entry, ...patch }) } }], origin);
  const subnet = data.network.subnets.find((s) => s.id === entry.subnetId);
  const suggestion = subnet && entry.mode === 'static' && !entry.ip ? suggestIp(data, subnet) : null;
  return (
    <div className={compact ? 'flex flex-wrap items-end gap-2' : 'space-y-2'}>
      {portLabel && !compact && <div className="text-sm font-medium">{portLabel}</div>}
      <div className={compact ? 'w-28' : 'grid grid-cols-2 gap-2'}>
        <Field label={t.ipMode}>
          <select className={selectClass} aria-label={`${t.ipMode} ${device.label}`} value={entry.mode} disabled={!editable} onChange={(e) => set({ mode: e.target.value as 'static' | 'dhcp' })}>
            <option value="static">{t.static}</option>
            <option value="dhcp">DHCP</option>
          </select>
        </Field>
        {!compact && (
          <Field label={t.subnet}>
            <select className={selectClass} value={entry.subnetId ?? ''} disabled={!editable} onChange={(e) => set({ subnetId: e.target.value || undefined })}>
              <option value="">–</option>
              {data.network.subnets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.cidr})
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      {compact && (
        <div className="w-40">
          <Field label={t.subnet}>
            <select className={selectClass} aria-label={`${t.subnet} ${device.label}`} value={entry.subnetId ?? ''} disabled={!editable} onChange={(e) => set({ subnetId: e.target.value || undefined })}>
              <option value="">–</option>
              {data.network.subnets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {entry.mode === 'static' && (
        <div className={compact ? 'w-36' : ''}>
          <Field label={t.ip}>
            <TextInput aria-label={`${t.ip} ${device.label}`} value={entry.ip ?? ''} placeholder={suggestion ?? '192.168.1.10'} disabled={!editable} inputMode="decimal" onChange={(e) => set({ ip: e.target.value.trim() || undefined })} />
          </Field>
        </div>
      )}
      {suggestion && editable && (
        <Button variant="ghost" className={compact ? 'min-h-9' : ''} onClick={() => set({ ip: suggestion })} aria-label={`${t.useFree} ${device.label}`}>
          ⤶ {t.useFree} {suggestion}
        </Button>
      )}
      <div className={compact ? 'w-36' : ''}>
        <Field label={t.hostname}>
          <TextInput aria-label={`${t.hostname} ${device.label}`} value={entry.hostname ?? ''} disabled={!editable} onChange={(e) => set({ hostname: e.target.value || undefined })} />
        </Field>
      </div>
    </div>
  );
}
