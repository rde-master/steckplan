// Werte der gewählten Geräte in einer Lichtszene. Angeboten wird, was mindestens eines der Geräte kann
// (laut Vorlage); weichen die Werte der gewählten Geräte voneinander ab, steht „unterschiedlich“ da.
import { Eraser } from 'lucide-react';
import type { ReactNode } from 'react';
import type * as Y from 'yjs';
import {
  clearFixtureValues,
  EFFECT_KINDS,
  EFFECT_SPEEDS,
  setFixtureValues,
  type DeviceInstance,
  type FixtureState,
  type FixtureValues,
  type LightCaps,
  type LightTarget,
  type Template,
} from '@steckplan/core';
import { texts } from '../../texts';
import { ICON } from '../icons';
import { Button } from '../ui';

const t = texts.light.fixture;
const control = 'w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:disabled:bg-slate-900';

function common<T>(values: (T | undefined)[]): { value: T | undefined; mixed: boolean } {
  const first = JSON.stringify(values[0]);
  const mixed = values.some((v) => JSON.stringify(v) !== first);
  return { value: mixed ? undefined : values[0], mixed };
}

export function FixturePanel({
  doc,
  origin,
  sceneId,
  devices,
  templates,
  states,
  targets,
  editable,
}: {
  doc: Y.Doc;
  origin: object;
  sceneId: string;
  devices: DeviceInstance[];
  templates: Map<string, Template>;
  states: Map<string, FixtureState>;
  targets: LightTarget[];
  editable: boolean;
}) {
  if (devices.length === 0) return <p className="text-sm text-slate-500">{t.nothing}</p>;
  const ids = devices.map((d) => d.id);
  const caps = devices.map((d) => templates.get(d.templateId)?.light).filter((c): c is LightCaps => !!c);
  const any = (test: (c: LightCaps) => boolean) => caps.some(test);
  const get = <K extends keyof FixtureValues>(key: K) => common(devices.map((d) => states.get(d.id)?.[key]));
  const set = (patch: Partial<Record<keyof FixtureValues, unknown>>) => setFixtureValues(doc, sceneId, ids, patch, origin);
  const disabled = !editable;

  const dimmer = get('dimmer');
  const color = get('color');
  const gobo = get('gobo');
  const target = get('targetId');
  const effect = get('effect');
  const wheelColors = caps.flatMap((c) => c.colorWheels.flatMap((w) => w.colors));
  const uniqueColors = [...new Map(wheelColors.map((c) => [`${c.name}|${c.hex}`, c])).values()];
  const goboOptions = [...new Map(caps.flatMap((c) => c.goboWheels.flatMap((w, wheel) => w.gobos.map((name) => [`${wheel}|${name}`, { wheel, name, wheelName: w.name, rotating: w.rotating }] as const)))).values()];
  const goboRotating = gobo.value ? goboOptions.find((g) => g.wheel === gobo.value!.wheel && g.name === gobo.value!.name)?.rotating : false;

  const row = (label: string, mixed: boolean, children: ReactNode) => (
    <div className="block space-y-0.5">
      <span className="flex items-baseline justify-between text-xs font-medium text-slate-600 dark:text-slate-300">
        {label}
        {mixed && <span className="font-normal text-amber-700 dark:text-amber-400">{t.mixed}</span>}
      </span>
      {children}
    </div>
  );
  const percent = (key: 'focus' | 'iris' | 'frost', label: string) => {
    const v = get(key);
    return row(
      label,
      v.mixed,
      <input type="number" aria-label={label} min={0} max={100} className={control} disabled={disabled} value={v.value ?? ''} placeholder={v.mixed ? t.mixed : ''} onChange={(e) => set({ [key]: e.target.value === '' ? undefined : Math.min(100, Math.max(0, Number(e.target.value))) })} />,
    );
  };

  return (
    <div className="space-y-3" data-testid="fixture-panel">
      {any((c) => c.dimmer) &&
        row(
          t.dimmer,
          dimmer.mixed,
          <div className="flex items-center gap-2">
            <input type="range" aria-label={t.dimmer} min={0} max={100} step={5} className="min-w-0 flex-1 accent-sky-600" disabled={disabled} value={dimmer.value ?? 0} onChange={(e) => set({ dimmer: Number(e.target.value) })} />
            <input type="number" aria-label={`${t.dimmer} (%)`} min={0} max={100} className="w-16 rounded-md border border-slate-300 bg-white px-1.5 py-1 text-sm dark:border-slate-600 dark:bg-slate-800" disabled={disabled} value={dimmer.value ?? ''} placeholder={dimmer.mixed ? '…' : '–'} onChange={(e) => set({ dimmer: e.target.value === '' ? undefined : Math.min(100, Math.max(0, Number(e.target.value))) })} />
            <Button variant="ghost" className="min-h-7 px-1.5 text-xs" disabled={disabled} onClick={() => set({ dimmer: 0 })}>
              {t.off}
            </Button>
            <Button variant="ghost" className="min-h-7 px-1.5 text-xs" disabled={disabled} onClick={() => set({ dimmer: 100 })}>
              {t.full}
            </Button>
          </div>,
        )}

      {(uniqueColors.length > 0 || any((c) => c.colorMixing !== 'none')) &&
        row(
          t.color,
          color.mixed,
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t.color}>
            {uniqueColors.map((c) => {
              const on = color.value?.hex === c.hex && color.value?.name === c.name;
              return (
                <button
                  key={`${c.name}|${c.hex}`}
                  type="button"
                  aria-label={`${t.color} ${c.name}`}
                  aria-pressed={on}
                  title={c.name}
                  disabled={disabled}
                  onClick={(e) => {
                    e.preventDefault();
                    set({ color: { hex: c.hex, name: c.name } });
                  }}
                  className={`flex items-center gap-1 rounded-full border py-0.5 pr-2 pl-0.5 text-xs ${on ? 'border-sky-600 ring-1 ring-sky-600' : 'border-slate-300 dark:border-slate-600'}`}
                >
                  <span className="h-4 w-4 rounded-full border border-black/10" style={{ background: c.hex }} />
                  {c.name}
                </button>
              );
            })}
            {any((c) => c.colorMixing !== 'none') && (
              <input type="color" aria-label={t.colorFree} title={t.colorFree} disabled={disabled} className="h-7 w-9 cursor-pointer rounded border border-slate-300 bg-transparent p-0.5 dark:border-slate-600" value={color.value?.hex ?? '#ffffff'} onChange={(e) => set({ color: { hex: e.target.value } })} />
            )}
            {color.value && (
              <Button variant="ghost" className="min-h-7 px-1.5 text-xs" disabled={disabled} onClick={() => set({ color: undefined })}>
                {t.unset}
              </Button>
            )}
          </div>,
        )}

      {goboOptions.length > 0 && (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          {row(
            t.gobo,
            gobo.mixed,
            <select
              aria-label={t.gobo}
              className={control}
              disabled={disabled}
              value={gobo.value ? `${gobo.value.wheel}|${gobo.value.name}` : ''}
              onChange={(e) => {
                const g = goboOptions.find((o) => `${o.wheel}|${o.name}` === e.target.value);
                set({ gobo: g ? { wheel: g.wheel, name: g.name } : undefined });
              }}
            >
              <option value="">{gobo.mixed ? t.mixed : t.unset}</option>
              {goboOptions.map((g) => (
                <option key={`${g.wheel}|${g.name}`} value={`${g.wheel}|${g.name}`}>
                  {g.wheelName ? `${g.wheelName}: ${g.name}` : g.name}
                </option>
              ))}
            </select>,
          )}
          {goboRotating &&
            row(
              t.rotate,
              false,
              <select aria-label={t.rotate} className={control} disabled={disabled} value={gobo.value?.rotate ?? ''} onChange={(e) => gobo.value && set({ gobo: { ...gobo.value, rotate: (e.target.value || undefined) as 'cw' | 'ccw' | undefined } })}>
                <option value="">{t.rotations.none}</option>
                <option value="cw">{t.rotations.cw}</option>
                <option value="ccw">{t.rotations.ccw}</option>
              </select>,
            )}
        </div>
      )}

      {any((c) => !!c.moving) && (
        <>
          {row(
            t.target,
            target.mixed,
            <select aria-label={t.target} className={control} disabled={disabled} value={target.value ?? ''} onChange={(e) => set({ targetId: e.target.value || undefined })}>
              <option value="">{target.mixed ? t.mixed : t.unset}</option>
              {targets.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>,
          )}
          <div className="grid grid-cols-2 gap-2">
            {row(
              t.effect,
              effect.mixed,
              <select aria-label={t.effect} className={control} disabled={disabled} value={effect.value?.kind ?? ''} onChange={(e) => set({ effect: e.target.value ? { ...effect.value, kind: e.target.value as (typeof EFFECT_KINDS)[number] } : undefined })}>
                <option value="">{effect.mixed ? t.mixed : t.unset}</option>
                {EFFECT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t.effects[k]}
                  </option>
                ))}
              </select>,
            )}
            {effect.value &&
              row(
                t.speed,
                false,
                <select aria-label={t.speed} className={control} disabled={disabled} value={effect.value.speed ?? ''} onChange={(e) => set({ effect: { ...effect.value!, speed: (e.target.value || undefined) as (typeof EFFECT_SPEEDS)[number] | undefined } })}>
                  <option value="">{t.unset}</option>
                  {EFFECT_SPEEDS.map((s) => (
                    <option key={s} value={s}>
                      {t.speeds[s]}
                    </option>
                  ))}
                </select>,
              )}
          </div>
          {effect.value?.kind === 'other' &&
            row(t.effectText, false, <input aria-label={t.effectText} className={control} disabled={disabled} value={effect.value.text ?? ''} onChange={(e) => set({ effect: { ...effect.value!, text: e.target.value || undefined } })} />)}
        </>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {any((c) => !!c.prism) && (
          <label className="flex items-center gap-2 self-end pb-1 text-sm">
            <input type="checkbox" disabled={disabled} checked={get('prism').value ?? false} onChange={(e) => set({ prism: e.target.checked || undefined })} />
            {t.prism}
          </label>
        )}
        {any((c) => !!c.zoom) &&
          row(t.zoom, get('zoomDeg').mixed, <input type="number" aria-label={t.zoom} min={0} className={control} disabled={disabled} value={get('zoomDeg').value ?? ''} onChange={(e) => set({ zoomDeg: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })} />)}
        {any((c) => !!c.focus) && percent('focus', t.focus)}
        {any((c) => !!c.iris) && percent('iris', t.iris)}
        {any((c) => !!c.frost) && percent('frost', t.frost)}
        {any((c) => !!c.strobeMaxHz) &&
          row(t.strobe, get('strobeHz').mixed, <input type="number" aria-label={t.strobe} min={0} className={control} disabled={disabled} value={get('strobeHz').value ?? ''} onChange={(e) => set({ strobeHz: e.target.value === '' || Number(e.target.value) === 0 ? undefined : Math.max(0, Number(e.target.value)) })} />)}
      </div>

      {row(t.notes, get('notes').mixed, <input aria-label={t.notes} className={control} disabled={disabled} value={get('notes').value ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} />)}

      {editable && (
        <Button variant="ghost" className="text-xs" onClick={() => clearFixtureValues(doc, sceneId, ids, origin)}>
          <Eraser {...ICON} /> {t.clear}
        </Button>
      )}
    </div>
  );
}
