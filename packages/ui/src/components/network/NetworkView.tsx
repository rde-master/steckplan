// Reiter „Netzwerk“: Subnetze, WLAN-Netze mit QR-Code, IP-Tabelle.
import { Eye, EyeOff, Plus, X } from 'lucide-react';
import { ICON } from '../icons';
import { useCallback, useState } from 'react';
import type * as Y from 'yjs';
import {
  addNetworkItem,
  networkPorts,
  parseCidr,
  removeNetworkItem,
  updateNetworkItem,
  type Issue,
  type Library,
  type Subnet,
  type WifiNetwork,
} from '@steckplan/core';
import { api, errorMessage } from '../../lib/api';
import { useLoader } from '../../lib/useLoader';
import type { ProjectData } from '../../lib/useProjectData';
import { texts } from '../../texts';
import { NetworkPortFields } from '../signalflow/DeviceTechSections';
import { Banner, Button, Field, TextInput } from '../ui';
import { selectClass } from '../library/fields';

const n = texts.networkView;

interface Props {
  projectId: string;
  doc: Y.Doc;
  origin: object;
  data: ProjectData;
  library: Library | null;
  issues: Issue[];
  editable: boolean;
  canSeeSecrets: boolean;
}

const NETWORK_ISSUE = /^(ip-|subnet-|gateway:)/;

export function NetworkView(allProps: Props) {
  // nur Netzwerk-Prüfungen anzeigen
  const props = { ...allProps, issues: allProps.issues.filter((i) => NETWORK_ISSUE.test(i.id)) };
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 overflow-y-auto p-4">
      <Subnets {...props} />
      <Wifi {...props} />
      <IpTable {...props} />
    </main>
  );
}

function IssueHints({ issues, id }: { issues: Issue[]; id: string }) {
  const mine = issues.filter((i) => i.objectIds.includes(id));
  return mine.length ? (
    <ul className="text-xs text-red-700 dark:text-red-400">
      {mine.map((i) => (
        <li key={i.id}>⚠ {i.message}</li>
      ))}
    </ul>
  ) : null;
}

function Subnets({ doc, origin, data, issues, editable }: Props) {
  const update = (s: Subnet, patch: Partial<Subnet>) => updateNetworkItem(doc, 'subnets', s.id, patch, origin);
  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900" aria-label={n.subnets}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{n.subnets}</h2>
        {editable && (
          <Button onClick={() => addNetworkItem<Subnet>(doc, 'subnets', { name: n.newSubnet, cidr: '192.168.1.0/24' }, origin)}><Plus {...ICON} /> {n.addSubnet}</Button>
        )}
      </div>
      {data.network.subnets.length === 0 && <p className="text-sm text-slate-500">{n.noSubnets}</p>}
      {data.network.subnets.map((s) => {
        const cidr = parseCidr(s.cidr);
        const used = data.devices.filter((d) => d.network?.some((e) => e.subnetId === s.id)).length;
        return (
          <div key={s.id} className="space-y-1 rounded-md border border-slate-100 p-2 dark:border-slate-800" data-testid="subnet">
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] sm:items-end">
              <Field label={n.name}>
                <TextInput value={s.name} disabled={!editable} onChange={(e) => update(s, { name: e.target.value })} />
              </Field>
              <Field label={n.cidr}>
                <TextInput value={s.cidr} disabled={!editable} aria-invalid={!cidr} onChange={(e) => update(s, { cidr: e.target.value.trim() })} />
              </Field>
              <Field label={n.gateway}>
                <TextInput value={s.gateway ?? ''} disabled={!editable} onChange={(e) => update(s, { gateway: e.target.value.trim() })} />
              </Field>
              <Field label={n.vlan}>
                <TextInput value={s.vlanNote ?? ''} disabled={!editable} onChange={(e) => update(s, { vlanNote: e.target.value })} />
              </Field>
              {editable && (
                <Button variant="ghost" aria-label={`${texts.common.delete}: ${s.name}`} disabled={used > 0} title={used > 0 ? n.subnetInUse : undefined} onClick={() => removeNetworkItem(doc, 'subnets', s.id, origin)}>
                  <X {...ICON} />
                </Button>
              )}
            </div>
            <div className="text-xs text-slate-500">
              {cidr ? n.subnetInfo(cidr.size, used) : n.invalidCidr}
            </div>
            <IssueHints issues={issues} id={s.id} />
          </div>
        );
      })}
    </section>
  );
}

function Wifi({ projectId, doc, origin, data, editable, canSeeSecrets }: Props) {
  const secrets = useLoader(
    useCallback(async () => {
      if (!canSeeSecrets) return {} as Record<string, string>;
      const s = await api.getSecrets(projectId);
      return Object.fromEntries(s.wifiPasswords.map((w) => [w.wifiId, w.password]));
    }, [projectId, canSeeSecrets]),
  );
  const [saved, setSaved] = useState<Record<string, string>>({});
  const passwords = { ...(secrets.data ?? {}), ...saved };
  const [version, setVersion] = useState(0);
  const [actionError, setError] = useState<string | null>(null);
  const error = actionError ?? secrets.error;

  const update = (w: WifiNetwork, patch: Partial<WifiNetwork>) => updateNetworkItem(doc, 'wifi', w.id, patch, origin);
  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900" aria-label={n.wifi}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{n.wifi}</h2>
        {editable && <Button onClick={() => addNetworkItem<WifiNetwork>(doc, 'wifi', { ssid: n.newSsid, security: 'WPA2', hidden: false }, origin)}><Plus {...ICON} /> {n.addWifi}</Button>}
      </div>
      {canSeeSecrets && data.network.wifi.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-400">{n.cleartextHint}</p>}
      {error && <Banner tone="error">{error}</Banner>}
      {data.network.wifi.length === 0 && <p className="text-sm text-slate-500">{n.noWifi}</p>}
      {data.network.wifi.map((w) => (
        <div key={w.id} className="flex flex-wrap gap-4 rounded-md border border-slate-100 p-3 dark:border-slate-800" data-testid="wifi">
          <img
            src={api.wifiQrUrl(projectId, w.id, `${w.ssid}|${w.security}|${w.hidden}|${version}`)}
            alt={n.qrAlt(w.ssid)}
            className="h-40 w-40 rounded bg-white p-1"
            data-testid="wifi-qr"
          />
          <div className="min-w-56 flex-1 space-y-2">
            <Field label="SSID">
              <TextInput value={w.ssid} disabled={!editable} onChange={(e) => update(w, { ssid: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={n.security}>
                <select className={selectClass} value={w.security} disabled={!editable} onChange={(e) => update(w, { security: e.target.value as WifiNetwork['security'] })}>
                  {(['WPA2', 'WPA3', 'WPA2/WPA3', 'open'] as const).map((sec) => (
                    <option key={sec} value={sec}>
                      {sec === 'open' ? n.open : sec}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={n.accessPoint}>
                <select className={selectClass} value={w.accessPointDeviceId ?? ''} disabled={!editable} onChange={(e) => update(w, { accessPointDeviceId: e.target.value || undefined })}>
                  <option value="">–</option>
                  {data.devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={w.hidden} disabled={!editable} onChange={(e) => update(w, { hidden: e.target.checked })} />
              {n.hidden}
            </label>
            {canSeeSecrets && w.security !== 'open' && (
              <PasswordField
                value={passwords[w.id] ?? ''}
                editable={editable}
                ssid={w.ssid}
                onSave={async (password) => {
                  setError(null);
                  try {
                    await api.setWifiPassword(projectId, w.id, password || null);
                    setSaved({ ...saved, [w.id]: password });
                    setVersion((v) => v + 1);
                  } catch (err) {
                    setError(errorMessage(err));
                  }
                }}
              />
            )}
            {!canSeeSecrets && <p className="text-xs text-slate-500">{n.passwordHidden}</p>}
            {editable && (
              <Button variant="ghost" onClick={() => removeNetworkItem(doc, 'wifi', w.id, origin)}>
                {texts.common.delete}
              </Button>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

function PasswordField({ value, editable, ssid, onSave }: { value: string; editable: boolean; ssid: string; onSave: (password: string) => void }) {
  const [text, setText] = useState(value);
  const [last, setLast] = useState(value);
  const [show, setShow] = useState(false);
  if (value !== last) {
    setLast(value);
    setText(value);
  }
  return (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <Field label={n.password}>
          <TextInput
            type={show ? 'text' : 'password'}
            aria-label={`${n.password} ${ssid}`}
            value={text}
            maxLength={63}
            disabled={!editable}
            autoComplete="off"
            onChange={(e) => setText(e.target.value)}
            onBlur={() => text !== value && onSave(text)}
          />
        </Field>
      </div>
      <Button variant="ghost" onClick={() => setShow(!show)} aria-label={show ? n.hidePassword : n.showPassword}>
        {show ? <EyeOff {...ICON} /> : <Eye {...ICON} />}
      </Button>
    </div>
  );
}

function IpTable({ doc, origin, data, library, issues, editable }: Props) {
  const templates = new Map((library?.templates ?? []).map((t) => [t.id, t]));
  const rows = data.devices.flatMap((device) => networkPorts(templates.get(device.templateId)).map((port) => ({ device, port })));
  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900" aria-label={n.ipTable}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{n.ipTable}</h2>
      {rows.length === 0 && <p className="text-sm text-slate-500">{n.noNetworkDevices}</p>}
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {rows.map(({ device, port }) => (
          <li key={`${device.id}-${port.id}`} className="space-y-1 py-2" data-testid="ip-row">
            <div className="text-sm font-medium">
              {device.label} <span className="font-normal text-slate-500">· {port.label}</span>
            </div>
            <NetworkPortFields doc={doc} origin={origin} data={data} device={device} portId={port.id} editable={editable} compact />
            <IssueHints issues={issues} id={device.id} />
          </li>
        ))}
      </ul>
    </section>
  );
}
