// Geräteliste mit Suche, nach Kategorien gruppiert, je Gerät Person, Besitzer und Gegenstellen („→ Stagebox · In 3“).
// Benutzt für „Nicht platziert“ und „Im Plan“ (Bühnenplan) sowie „Im Plan“ (Signalfluss).
import { useState, type ReactNode } from 'react';
import { User, Warehouse } from 'lucide-react';
import { devicePerson, personName, templatePorts, type Cable, type DeviceInstance, type Library, type Person, type Template } from '@steckplan/core';
import { texts } from '../texts';
import { TextInput } from './ui';

const s = texts.stageplan;

export interface DeviceListProps {
  /** alle Geräte des Projekts (für Gegenstellen) */
  devices: DeviceInstance[];
  /** welche davon in die Liste kommen */
  include: (device: DeviceInstance, template: Template | undefined) => boolean;
  cables?: Cable[];
  people?: Person[];
  library: Library | null;
  /** Präfix der Test-IDs (z. B. „unplaced“ → unplaced-list, unplaced-person …) */
  testId: string;
  /** Hinweis über der Liste */
  hint?: ReactNode;
  /** wenn die Liste ganz leer ist */
  empty: ReactNode;
  /** zusätzliche Angabe je Gerät, z. B. Ebene oder Seite */
  detail?: (device: DeviceInstance) => string | undefined;
  /** Klick auf einen Eintrag (z. B. auswählen und hinspringen) */
  onOpen?: (id: string) => void;
  /** ausgewählte Geräte hervorheben */
  selected?: Set<string>;
  /** Eintrag ziehbar (Daten-Typ für Drag & Drop) */
  dragType?: string;
  /** Knopf rechts je Eintrag */
  action?: { label: (device: DeviceInstance) => string; icon: ReactNode; onClick: (id: string) => void };
}

export function DeviceList({ devices, include, cables = [], people = [], library, testId, hint, empty, detail, onOpen, selected, dragType, action }: DeviceListProps) {
  const [query, setQuery] = useState('');
  const templates = new Map((library?.templates ?? []).map((t) => [t.id, t]));
  const byId = new Map(devices.map((d) => [d.id, d]));
  const owners = new Map((library?.masterData.owners ?? []).map((o) => [o.id, o.name]));
  const categories = [...(library?.masterData.categories ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const portLabel = (device: DeviceInstance, portId: string) => templatePorts(templates.get(device.templateId)).find((p) => p.id === portId)?.label ?? portId;
  /** Gegenstellen: „→ Stagebox · In 3“ (Signal geht hin) bzw. „← Pult · Aux 1“ */
  const connections = (d: DeviceInstance) =>
    cables.flatMap((c) => {
      const mine = c.from.deviceId === d.id ? 'from' : c.to.deviceId === d.id ? 'to' : null;
      if (!mine) return [];
      const other = mine === 'from' ? c.to : c.from;
      const device = byId.get(other.deviceId);
      return device ? [`${mine === 'from' ? '→' : '←'} ${device.label} · ${portLabel(device, other.portId)}`] : [];
    });
  const all = devices.filter((d) => include(d, templates.get(d.templateId)));
  const q = query.trim().toLocaleLowerCase('de');
  const rows = all
    .map((d) => {
      const t = templates.get(d.templateId);
      const person = personName(devicePerson(d, t, people));
      const owner = d.ownerId ? owners.get(d.ownerId) : undefined;
      return { d, t, person, owner, links: connections(d), info: detail?.(d), categoryId: d.categoryOverride ?? t?.categoryId };
    })
    .filter((r) => !q || [r.d.label, r.t?.name, r.person, r.owner, r.info, ...r.links].some((x) => x?.toLocaleLowerCase('de').includes(q)))
    .sort((a, b) => a.d.label.localeCompare(b.d.label, 'de', { numeric: true }));
  const groups = [
    ...categories.map((c) => ({ key: c.id, label: c.name, color: c.color, rows: rows.filter((r) => r.categoryId === c.id) })),
    { key: '', label: s.noCategory, color: undefined, rows: rows.filter((r) => !r.categoryId || !categories.some((c) => c.id === r.categoryId)) },
  ].filter((g) => g.rows.length > 0);
  return (
    <div className="h-full overflow-y-auto p-2">
      {hint && <p className="px-1 pb-2 text-xs text-slate-500">{hint}</p>}
      {all.length === 0 ? (
        empty
      ) : (
        <>
          <TextInput type="search" aria-label={s.unplacedSearch} placeholder={s.unplacedSearch} value={query} onChange={(e) => setQuery(e.target.value)} />
          {rows.length === 0 && <p className="px-1 pt-2 text-sm text-slate-500">{s.unplacedNoMatch}</p>}
          <div className="mt-2" data-testid={`${testId}-list`}>
            {groups.map((group) => (
              <details key={group.key || 'none'} open className="mb-2" data-testid={`${testId}-group-${group.key || 'none'}`}>
                <summary className="flex cursor-pointer list-none items-center gap-1.5 px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {group.color && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: group.color }} />}
                  {group.label} <span className="font-normal">({group.rows.length})</span>
                </summary>
                <ul className="space-y-1">
                  {group.rows.map(({ d, t, person, owner, links, info }) => (
                    <li
                      key={d.id}
                      draggable={!!dragType}
                      onDragStart={(e) => {
                        if (!dragType) return;
                        e.dataTransfer.setData(dragType, d.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${selected?.has(d.id) ? 'border-sky-400 bg-sky-50 dark:border-sky-600 dark:bg-sky-950' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'} ${dragType ? 'cursor-grab' : ''}`}
                    >
                      <span className="h-3.5 w-3.5 shrink-0 rounded border border-slate-300" style={{ backgroundColor: d.colorOverride ?? t?.defaultColor ?? '#cbd5e1' }} />
                      <button type="button" className={`min-w-0 flex-1 text-left ${onOpen ? 'cursor-pointer' : 'cursor-default'}`} onClick={() => onOpen?.(d.id)} aria-label={onOpen ? `${s.showInPlan}: ${d.label}` : undefined} tabIndex={onOpen ? 0 : -1}>
                        <span className="block truncate">{d.label}</span>
                        {info && <span className="block truncate text-xs text-slate-500">{info}</span>}
                        {(person || owner) && (
                          <span className="flex flex-wrap gap-x-2 text-xs text-slate-500 dark:text-slate-400">
                            {person && (
                              <span className="inline-flex min-w-0 items-center gap-0.5 text-sky-700 dark:text-sky-300" data-testid={`${testId}-person`} title={s.unplacedPerson}>
                                <User size={12} aria-hidden /> <span className="truncate">{person}</span>
                              </span>
                            )}
                            {owner && (
                              <span className="inline-flex min-w-0 items-center gap-0.5" data-testid={`${testId}-owner`} title={s.unplacedOwner}>
                                <Warehouse size={12} aria-hidden /> <span className="truncate">{owner}</span>
                              </span>
                            )}
                          </span>
                        )}
                        {links.length > 0 && (
                          <span className="block text-xs text-slate-500 dark:text-slate-400" data-testid={`${testId}-links`} title={links.join('\n')}>
                            {links.slice(0, 2).map((l) => (
                              <span key={l} className="block truncate">
                                {l}
                              </span>
                            ))}
                            {links.length > 2 && <span className="block">{s.connectedMore(links.length - 2)}</span>}
                          </span>
                        )}
                      </button>
                      {action && (
                        <button type="button" className="rounded px-1.5 text-base leading-none text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700" aria-label={`${action.label(d)}: ${d.label}`} onClick={() => action.onClick(d.id)}>
                          {action.icon}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
