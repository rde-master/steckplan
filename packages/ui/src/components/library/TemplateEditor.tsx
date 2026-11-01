// Editor für eine Vorlage (Gerät, Kabeltyp, Bühnenelement, Traverse, Stativ).
import { useState } from 'react';
import { TEMPLATE_KIND_LABELS, type Library, type PortDef, type Template, type TemplateKind } from '@steckplan/core';
import { api, ApiError, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { suggestions } from '../../lib/library';
import { formatMeterList, parseMeterList } from '../../lib/units';
import { texts } from '../../texts';
import { Banner, Button, Field, TextArea, TextInput } from '../ui';
import { BulkPortsForm } from './BulkPortsForm';
import { ColorField, MasterSelect, MeterField, NumberField, selectClass, SelectField } from './fields';

const t = texts.library.fields;

export type Draft = Omit<Template, 'id' | 'version' | 'updatedAt'> & Partial<Pick<Template, 'id' | 'version' | 'updatedAt'>>;

export function newDraft(kind: TemplateKind): Draft {
  switch (kind) {
    case 'device':
      return { kind, name: '', shape: { form: 'rect', widthMm: 500, depthMm: 500 }, ports: [] };
    case 'cableType':
      return { kind, name: '', availableLengthsMm: [] };
    case 'stageElement':
      return { kind, name: '', shape: { form: 'rect', widthMm: 2000, depthMm: 1000, heightMm: 400 } };
    case 'truss':
      return { kind, name: '', lengthMm: 3000, shape: { form: 'rect', widthMm: 3000, depthMm: 290, heightMm: 4000 } };
    case 'stand':
      return { kind, name: '', shape: { form: 'circle', widthMm: 1200, depthMm: 1200, heightMm: 2500 }, maxMountedDevices: 2 };
  }
}

/** Optische Trennung der Anschlüsse nach Richtung */
const PORT_GROUPS = [
  { direction: 'in', label: texts.library.fields.portGroups.in, accent: 'border-sky-400 dark:border-sky-600', badge: 'bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100' },
  { direction: 'out', label: texts.library.fields.portGroups.out, accent: 'border-orange-400 dark:border-orange-600', badge: 'bg-orange-100 text-orange-900 dark:bg-orange-900 dark:text-orange-100' },
  { direction: 'bi', label: texts.library.fields.portGroups.bi, accent: 'border-violet-400 dark:border-violet-600', badge: 'bg-violet-100 text-violet-900 dark:bg-violet-900 dark:text-violet-100' },
] as const satisfies readonly { direction: PortDef['direction']; label: string; accent: string; badge: string }[];

function portId(): string {
  return `p-${Math.random().toString(36).slice(2, 8)}`;
}

export function TemplateEditor({
  library,
  draft: initial,
  canEdit,
  onSaved,
  onDeleted,
  onCancel,
}: {
  library: Library;
  draft: Draft;
  canEdit: boolean;
  onSaved: (template: Template) => void;
  onDeleted: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [usedIn, setUsedIn] = useState<string[] | null>(null);
  const [stale, setStale] = useState<Template | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [confirmClearPorts, setConfirmClearPorts] = useState(false);
  const isNew = !draft.id;
  const kind = draft.kind;
  const disabled = !canEdit;
  const { connectors, signals } = suggestions(library);
  const current = draft.id ? library.templates.find((x) => x.id === draft.id) : undefined;
  const changedElsewhere = current && draft.version !== undefined && current.version > draft.version && !stale;

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const setShape = (patch: Partial<NonNullable<Draft['shape']>>) =>
    setDraft((d) => ({ ...d, shape: { form: 'rect', widthMm: 0, depthMm: 0, ...d.shape, ...patch } }));

  async function save(force = false) {
    setBusy(true);
    setError(null);
    setUsedIn(null);
    try {
      const saved = isNew ? await api.createTemplate(draft) : await api.updateTemplate(draft as Template, { force });
      setStale(null);
      setDraft(saved);
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.details.current) setStale(err.details.current as Template);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft.id) return;
    setConfirmDelete(false);
    try {
      await api.deleteTemplate(draft.id);
      onDeleted();
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && Array.isArray(err.details.projects)) setUsedIn(err.details.projects as string[]);
    }
  }

  const ports = draft.ports ?? [];
  const setPort = (index: number, patch: Partial<PortDef>) => set({ ports: ports.map((p, i) => (i === index ? { ...p, ...patch } : p)) });
  const dmxModes = draft.dmxModes ?? [];
  const [lengthsText, setLengthsText] = useState(formatMeterList(initial.availableLengthsMm));
  const lengthsInvalid = parseMeterList(lengthsText) === null;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (canEdit) void save();
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {isNew ? texts.library.new(TEMPLATE_KIND_LABELS[kind].singular) : draft.name || TEMPLATE_KIND_LABELS[kind].singular}
        </h2>
        {current && (
          <span className="text-xs text-slate-500">
            Version {current.version}
            {current.updatedBy ? ` · ${current.updatedBy}` : ''} · {formatDateTime(current.updatedAt)}
          </span>
        )}
      </div>

      {!canEdit && <Banner tone="info">{texts.library.readOnly}</Banner>}
      {changedElsewhere && <Banner tone="warn">{texts.library.changedElsewhere(current.updatedBy ?? 'Jemand')}</Banner>}
      {stale && (
        <Banner tone="warn">
          <div className="space-y-2">
            <strong>{texts.library.staleInfo(stale.updatedBy ?? 'jemand anderem')}</strong>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  setDraft(stale);
                  setLengthsText(formatMeterList(stale.availableLengthsMm));
                  setStale(null);
                }}
              >
                {texts.library.reload}
              </Button>
              <Button variant="danger" onClick={() => void save(true)}>
                {texts.library.overwrite}
              </Button>
            </div>
          </div>
        </Banner>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label={t.name}>
            <TextInput value={draft.name} onChange={(e) => set({ name: e.target.value })} required maxLength={120} disabled={disabled} autoFocus={isNew} />
          </Field>
        </div>
        <Field label={t.manufacturer}>
          <TextInput value={draft.manufacturer ?? ''} onChange={(e) => set({ manufacturer: e.target.value })} disabled={disabled} />
        </Field>
        <MasterSelect label={t.category} emptyLabel={t.noCategory} entries={library.masterData.categories} value={draft.categoryId} onChange={(categoryId) => set({ categoryId })} disabled={disabled} />
        <MasterSelect label={t.owner} emptyLabel={t.none} entries={library.masterData.owners} value={draft.defaultOwnerId} onChange={(defaultOwnerId) => set({ defaultOwnerId })} disabled={disabled} />
        <MasterSelect label={t.trailer} emptyLabel={t.none} entries={library.masterData.trailers} value={draft.defaultTrailerId} onChange={(defaultTrailerId) => set({ defaultTrailerId })} disabled={disabled} />
        <div className="sm:col-span-2">
          <ColorField label={t.color} value={draft.defaultColor} onChange={(defaultColor) => set({ defaultColor })} disabled={disabled} />
        </div>
      </div>

      {/* Form und Maße */}
      {(kind === 'device' || kind === 'stageElement' || kind === 'stand') && (
        <fieldset className="grid gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-4 dark:border-slate-700">
          <SelectField
            label={t.form}
            value={draft.shape?.form ?? 'rect'}
            options={(['rect', 'rounded', 'circle'] as const).map((f) => ({ value: f, label: t.forms[f] }))}
            onChange={(form) => setShape({ form })}
            disabled={disabled}
          />
          <MeterField label={kind === 'stand' ? t.footprintWidth : t.width} value={draft.shape?.widthMm} onChange={(widthMm) => setShape({ widthMm: widthMm ?? 0 })} disabled={disabled} required />
          <MeterField label={kind === 'stand' ? t.footprintDepth : t.depth} value={draft.shape?.depthMm} onChange={(depthMm) => setShape({ depthMm: depthMm ?? 0 })} disabled={disabled} required />
          <MeterField label={kind === 'device' ? t.height : t.defaultHeight} value={draft.shape?.heightMm} onChange={(heightMm) => setShape({ heightMm })} disabled={disabled} />
        </fieldset>
      )}
      {kind === 'truss' && (
        <fieldset className="grid gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-3 dark:border-slate-700">
          <MeterField
            label={t.length}
            value={draft.lengthMm}
            onChange={(lengthMm) => setDraft((d) => ({ ...d, lengthMm, shape: { form: 'rect', depthMm: 290, ...d.shape, widthMm: lengthMm ?? 0 } }))}
            disabled={disabled}
            required
          />
          <MeterField label={t.crossSection} value={draft.shape?.depthMm} onChange={(depthMm) => setShape({ depthMm: depthMm ?? 0 })} disabled={disabled} />
          <MeterField label={t.defaultHeight} value={draft.shape?.heightMm} onChange={(heightMm) => setShape({ heightMm })} disabled={disabled} />
        </fieldset>
      )}
      {(kind === 'truss' || kind === 'stand') && (
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberField label={t.maxMounted} value={draft.maxMountedDevices} onChange={(maxMountedDevices) => set({ maxMountedDevices })} disabled={disabled} />
        </div>
      )}

      {/* Kabeltyp */}
      {kind === 'cableType' && (
        <fieldset className="grid gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-3 dark:border-slate-700">
          <Field label={t.connectorA}>
            <TextInput list="steckplan-connectors" value={draft.connectorA ?? ''} onChange={(e) => set({ connectorA: e.target.value })} disabled={disabled} />
          </Field>
          <Field label={t.connectorB}>
            <TextInput list="steckplan-connectors" value={draft.connectorB ?? ''} onChange={(e) => set({ connectorB: e.target.value })} disabled={disabled} />
          </Field>
          <Field label={t.signal}>
            <TextInput list="steckplan-signals" value={draft.signal ?? ''} onChange={(e) => set({ signal: e.target.value })} disabled={disabled} />
          </Field>
          <MeterField label={t.maxLength} value={draft.maxLengthMm} onChange={(maxLengthMm) => set({ maxLengthMm })} disabled={disabled} />
          <div className="sm:col-span-2">
            <Field label={t.lengths} hint={lengthsInvalid ? t.invalidNumber : t.lengthsHint}>
              <TextInput
                value={lengthsText}
                aria-invalid={lengthsInvalid}
                disabled={disabled}
                onChange={(e) => {
                  setLengthsText(e.target.value);
                  const parsed = parseMeterList(e.target.value);
                  if (parsed) set({ availableLengthsMm: parsed });
                }}
              />
            </Field>
          </div>
        </fieldset>
      )}

      {/* Gerät: Anschlüsse, DMX, Leistung */}
      {kind === 'device' && (
        <>
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">{t.ports}</h3>
            {ports.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[44rem] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500">
                      <th className="pb-1 font-medium">{t.portLabel}</th>
                      <th className="pb-1 font-medium">{t.portConnector}</th>
                      <th className="pb-1 font-medium">{t.portDirection}</th>
                      <th className="pb-1 font-medium">{t.portSignal}</th>
                      <th className="pb-1 font-medium">{t.portNetwork}</th>
                      <th />
                    </tr>
                  </thead>
                  {PORT_GROUPS.map(({ direction, label, accent, badge }) => {
                    const rows = ports.map((port, index) => ({ port, index })).filter(({ port }) => port.direction === direction);
                    if (rows.length === 0) return null;
                    return (
                      <tbody key={direction} data-testid={`ports-${direction}`}>
                        <tr>
                          <th colSpan={6} scope="rowgroup" className="pt-3 pb-1 text-left">
                            <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge}`}>
                              {label} <span className="font-normal opacity-80">({rows.length})</span>
                            </span>
                          </th>
                        </tr>
                        {rows.map(({ port, index }) => (
                          <tr key={port.id} className="align-top">
                            <td className={`border-l-4 pr-2 pb-2 pl-2 ${accent}`}>
                              <TextInput aria-label={`${t.portLabel} ${index + 1}`} value={port.label} required onChange={(e) => setPort(index, { label: e.target.value })} disabled={disabled} />
                            </td>
                            <td className="pr-2 pb-2">
                              <TextInput aria-label={`${t.portConnector} ${index + 1}`} list="steckplan-connectors" value={port.connector} onChange={(e) => setPort(index, { connector: e.target.value })} disabled={disabled} />
                            </td>
                            <td className="pr-2 pb-2">
                              <select aria-label={`${t.portDirection} ${index + 1}`} className={`${selectClass} min-w-[7.5rem]`} value={port.direction} onChange={(e) => setPort(index, { direction: e.target.value as PortDef['direction'] })} disabled={disabled}>
                                {(['in', 'out', 'bi'] as const).map((d) => (
                                  <option key={d} value={d}>
                                    {t.directions[d]}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="pr-2 pb-2">
                              <TextInput aria-label={`${t.portSignal} ${index + 1}`} list="steckplan-signals" value={port.signal} onChange={(e) => setPort(index, { signal: e.target.value })} disabled={disabled} />
                            </td>
                            <td className="pr-2 pb-2 text-center">
                              <input
                                type="checkbox"
                                aria-label={`${t.portNetwork} ${index + 1}`}
                                className="mt-3 h-4 w-4"
                                checked={port.isNetwork ?? false}
                                onChange={(e) => setPort(index, { isNetwork: e.target.checked || undefined })}
                                disabled={disabled}
                              />
                            </td>
                            <td className="whitespace-nowrap pb-2">
                              {!disabled && (
                                <>
                                  <Button variant="ghost" title={t.duplicatePort} aria-label={`${t.duplicatePort} ${index + 1}`} onClick={() => set({ ports: [...ports.slice(0, index + 1), { ...port, id: portId(), label: port.label }, ...ports.slice(index + 1)] })}>
                                    ⧉
                                  </Button>
                                  <Button variant="ghost" title={t.remove} aria-label={`${t.remove} ${index + 1}`} onClick={() => set({ ports: ports.filter((_, i) => i !== index) })}>
                                    ✕
                                  </Button>
                                </>
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
                <Button onClick={() => set({ ports: [...ports, { id: portId(), label: '', connector: '', direction: 'in', signal: '' }] })}>＋ {t.addPort}</Button>
                {!showBulk && <Button onClick={() => setShowBulk(true)}>⊞ {texts.library.bulk.open}</Button>}
                <div className="flex-1" />
                {ports.length > 1 &&
                  (confirmClearPorts ? (
                    <span className="flex items-center gap-2 text-sm">
                      {texts.library.bulk.removeAllConfirm(ports.length)}
                      <Button
                        variant="danger"
                        onClick={() => {
                          set({ ports: [] });
                          setConfirmClearPorts(false);
                        }}
                      >
                        {t.remove}
                      </Button>
                      <Button onClick={() => setConfirmClearPorts(false)}>{texts.common.cancel}</Button>
                    </span>
                  ) : (
                    <Button variant="ghost" onClick={() => setConfirmClearPorts(true)}>
                      {texts.library.bulk.removeAll}
                    </Button>
                  ))}
              </div>
            )}
            {!disabled && showBulk && (
              <BulkPortsForm existing={ports} onAdd={(added) => set({ ports: [...ports, ...added] })} onClose={() => setShowBulk(false)} />
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">{t.dmxModes}</h3>
            {dmxModes.map((mode, index) => (
              <div key={index} className="flex items-end gap-2">
                <div className="flex-1">
                  <Field label={`${t.dmxName} ${index + 1}`}>
                    <TextInput value={mode.name} required onChange={(e) => set({ dmxModes: dmxModes.map((m, i) => (i === index ? { ...m, name: e.target.value } : m)) })} disabled={disabled} />
                  </Field>
                </div>
                <div className="w-28">
                  <NumberField label={t.dmxChannels} min={1} value={mode.channels} onChange={(channels) => set({ dmxModes: dmxModes.map((m, i) => (i === index ? { ...m, channels: channels ?? 1 } : m)) })} disabled={disabled} />
                </div>
                {!disabled && (
                  <Button variant="ghost" aria-label={`${t.remove} ${t.dmxName} ${index + 1}`} onClick={() => set({ dmxModes: dmxModes.filter((_, i) => i !== index) })}>
                    ✕
                  </Button>
                )}
              </div>
            ))}
            {!disabled && <Button onClick={() => set({ dmxModes: [...dmxModes, { name: '', channels: 1 }] })}>＋ {t.addDmxMode}</Button>}
          </section>

          <div className="grid gap-3 sm:grid-cols-3">
            <NumberField label={t.power} value={draft.powerW} onChange={(powerW) => set({ powerW })} disabled={disabled} />
          </div>
        </>
      )}

      <Field label={kind === 'truss' ? t.trussNotes : t.notes}>
        <TextArea value={draft.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} disabled={disabled} />
      </Field>

      <datalist id="steckplan-connectors">
        {connectors.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="steckplan-signals">
        {signals.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {error && <Banner tone="error">{error}</Banner>}
      {usedIn && (
        <Banner tone="warn">
          {texts.library.inUse} {usedIn.join(', ')}
        </Banner>
      )}

      {canEdit && (
        <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
          <Button type="submit" variant="primary" disabled={busy || lengthsInvalid}>
            {texts.common.save}
          </Button>
          <Button onClick={onCancel}>{texts.common.cancel}</Button>
          <div className="flex-1" />
          {!isNew &&
            (confirmDelete ? (
              <span className="flex items-center gap-2 text-sm">
                {texts.library.deleteConfirm(draft.name)}
                <Button variant="danger" onClick={() => void remove()}>
                  {texts.common.delete}
                </Button>
                <Button onClick={() => setConfirmDelete(false)}>{texts.common.cancel}</Button>
              </span>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
                {texts.common.delete}
              </Button>
            ))}
        </div>
      )}
    </form>
  );
}
