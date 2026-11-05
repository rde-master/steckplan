// Gerätevorlage: Lichtfähigkeiten für den Lichtaufbau und die Lichtszenen der Regie.
import { Plus, X } from 'lucide-react';
import { COLOR_MIXING, type ColorMixing, type LightCaps } from '@steckplan/core';
import { texts } from '../../texts';
import { ICON } from '../icons';
import { Button, Field, TextInput } from '../ui';
import { NumberField, SelectField } from './fields';

const t = texts.light.caps;

export const EMPTY_LIGHT: LightCaps = { showInScenes: true, dimmer: true, colorMixing: 'none', colorWheels: [], goboWheels: [] };

function Check({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function LightFields({ light, disabled, onChange }: { light: LightCaps | undefined; disabled: boolean; onChange: (light: LightCaps | undefined) => void }) {
  const caps = light ?? { ...EMPTY_LIGHT, showInScenes: false };
  const set = (patch: Partial<LightCaps>) => onChange({ ...caps, ...patch });
  const optional = <K extends keyof LightCaps>(key: K, value: LightCaps[K] | undefined) => {
    const next = { ...caps };
    if (value === undefined || value === false) delete next[key];
    else next[key] = value;
    onChange(next);
  };
  return (
    <section className="space-y-3 rounded-md border border-slate-200 p-3 dark:border-slate-700" aria-label={t.title}>
      <h3 className="text-sm font-semibold">{t.title}</h3>
      <div>
        <Check
          label={t.showInScenes}
          checked={caps.showInScenes}
          disabled={disabled}
          onChange={(checked) => (checked ? onChange({ ...EMPTY_LIGHT, ...light, showInScenes: true }) : onChange(light ? { ...light, showInScenes: false } : undefined))}
        />
        <p className="pl-6 text-xs text-slate-500">{t.showInScenesHint}</p>
      </div>
      {caps.showInScenes && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col justify-end gap-1.5 pb-1">
              <Check label={t.dimmer} checked={caps.dimmer} disabled={disabled} onChange={(dimmer) => set({ dimmer })} />
              <Check label={t.cto} checked={!!caps.cto} disabled={disabled} onChange={(v) => optional('cto', v || undefined)} />
            </div>
            <SelectField
              label={t.colorMixing}
              value={caps.colorMixing}
              options={COLOR_MIXING.map((m) => ({ value: m, label: t.mixing[m] }))}
              onChange={(colorMixing: ColorMixing) => set({ colorMixing })}
              disabled={disabled}
            />
            <NumberField label={t.strobe} value={caps.strobeMaxHz} onChange={(v) => optional('strobeMaxHz', v || undefined)} disabled={disabled} />
          </div>

          <ColorWheels caps={caps} disabled={disabled} set={set} />
          <GoboWheels caps={caps} disabled={disabled} set={set} />

          <div className="grid gap-3 sm:grid-cols-4">
            <NumberField label={t.prismFacets} value={caps.prism?.facets} onChange={(facets) => optional('prism', facets ? { facets, rotating: caps.prism?.rotating ?? false } : undefined)} disabled={disabled} />
            <div className="flex items-end pb-2">
              <Check label={t.prismRotating} checked={!!caps.prism?.rotating} disabled={disabled || !caps.prism} onChange={(rotating) => caps.prism && set({ prism: { ...caps.prism, rotating } })} />
            </div>
            <NumberField label={t.zoomMin} value={caps.zoom?.minDeg} onChange={(minDeg) => optional('zoom', minDeg !== undefined || caps.zoom ? { minDeg: minDeg ?? 0, maxDeg: caps.zoom?.maxDeg ?? minDeg ?? 0 } : undefined)} disabled={disabled} />
            <NumberField label={t.zoomMax} value={caps.zoom?.maxDeg} onChange={(maxDeg) => optional('zoom', maxDeg !== undefined || caps.zoom ? { minDeg: caps.zoom?.minDeg ?? 0, maxDeg: maxDeg ?? 0 } : undefined)} disabled={disabled} />
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            <Check label={t.focus} checked={!!caps.focus} disabled={disabled} onChange={(v) => optional('focus', v || undefined)} />
            <Check label={t.iris} checked={!!caps.iris} disabled={disabled} onChange={(v) => optional('iris', v || undefined)} />
            <Check label={t.frost} checked={!!caps.frost} disabled={disabled} onChange={(v) => optional('frost', v || undefined)} />
            <Check label={t.moving} checked={!!caps.moving} disabled={disabled} onChange={(v) => optional('moving', v ? { panDeg: 540, tiltDeg: 270 } : undefined)} />
          </div>
          {caps.moving && (
            <div className="grid gap-3 sm:grid-cols-4">
              <NumberField label={t.pan} value={caps.moving.panDeg} onChange={(panDeg) => set({ moving: { ...caps.moving!, panDeg: panDeg ?? 0 } })} disabled={disabled} />
              <NumberField label={t.tilt} value={caps.moving.tiltDeg} onChange={(tiltDeg) => set({ moving: { ...caps.moving!, tiltDeg: tiltDeg ?? 0 } })} disabled={disabled} />
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ColorWheels({ caps, disabled, set }: { caps: LightCaps; disabled: boolean; set: (patch: Partial<LightCaps>) => void }) {
  const wheels = caps.colorWheels;
  const setWheel = (index: number, patch: Partial<LightCaps['colorWheels'][number]>) => set({ colorWheels: wheels.map((w, i) => (i === index ? { ...w, ...patch } : w)) });
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{t.colorWheels}</div>
      {wheels.map((wheel, index) => (
        <div key={index} className="space-y-1.5 rounded border border-slate-200 p-2 dark:border-slate-700" data-testid="color-wheel">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Field label={`${t.wheelName} ${index + 1}`}>
                <TextInput value={wheel.name} disabled={disabled} onChange={(e) => setWheel(index, { name: e.target.value })} />
              </Field>
            </div>
            {!disabled && (
              <Button variant="ghost" aria-label={`${t.removeWheel} ${index + 1}`} onClick={() => set({ colorWheels: wheels.filter((_, i) => i !== index) })}>
                <X {...ICON} />
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {wheel.colors.map((color, ci) => (
              <span key={ci} className="flex items-center gap-1 rounded border border-slate-200 py-0.5 pr-0.5 pl-1 dark:border-slate-700">
                <input type="color" aria-label={`${t.colorValue} ${color.name}`} value={color.hex} disabled={disabled} className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0" onChange={(e) => setWheel(index, { colors: wheel.colors.map((c, i) => (i === ci ? { ...c, hex: e.target.value } : c)) })} />
                <input aria-label={`${t.colorName} ${ci + 1}`} value={color.name} disabled={disabled} className="w-24 bg-transparent text-sm focus:outline-none" onChange={(e) => setWheel(index, { colors: wheel.colors.map((c, i) => (i === ci ? { ...c, name: e.target.value } : c)) })} />
                {!disabled && (
                  <button type="button" aria-label={`${t.removeColor} ${color.name}`} className="text-slate-400 hover:text-red-600" onClick={() => setWheel(index, { colors: wheel.colors.filter((_, i) => i !== ci) })}>
                    <X size={14} aria-hidden />
                  </button>
                )}
              </span>
            ))}
            {!disabled && (
              <Button variant="ghost" className="min-h-7 px-2 text-xs" onClick={() => setWheel(index, { colors: [...wheel.colors, { name: '', hex: '#ffffff' }] })}>
                <Plus {...ICON} /> {t.addColor}
              </Button>
            )}
          </div>
        </div>
      ))}
      {!disabled && (
        <Button variant="secondary" className="text-xs" onClick={() => set({ colorWheels: [...wheels, { name: wheels.length ? `${t.wheelName} ${wheels.length + 1}` : t.wheelName, colors: [] }] })}>
          <Plus {...ICON} /> {t.addColorWheel}
        </Button>
      )}
    </div>
  );
}

function GoboWheels({ caps, disabled, set }: { caps: LightCaps; disabled: boolean; set: (patch: Partial<LightCaps>) => void }) {
  const wheels = caps.goboWheels;
  const setWheel = (index: number, patch: Partial<LightCaps['goboWheels'][number]>) => set({ goboWheels: wheels.map((w, i) => (i === index ? { ...w, ...patch } : w)) });
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{t.goboWheels}</div>
      {wheels.map((wheel, index) => (
        <div key={index} className="grid gap-2 rounded border border-slate-200 p-2 sm:grid-cols-[12rem_1fr_auto] sm:items-end dark:border-slate-700" data-testid="gobo-wheel">
          <div className="space-y-1">
            <Field label={`${t.goboWheelName} ${index + 1}`}>
              <TextInput value={wheel.name} disabled={disabled} onChange={(e) => setWheel(index, { name: e.target.value })} />
            </Field>
            <Check label={t.goboRotating} checked={wheel.rotating} disabled={disabled} onChange={(rotating) => setWheel(index, { rotating })} />
          </div>
          <Field label={t.gobos} hint={t.gobosHint}>
            <GoboList value={wheel.gobos} disabled={disabled} onChange={(gobos) => setWheel(index, { gobos })} />
          </Field>
          {!disabled && (
            <Button variant="ghost" aria-label={`${t.removeWheel} ${wheel.name || index + 1}`} onClick={() => set({ goboWheels: wheels.filter((_, i) => i !== index) })}>
              <X {...ICON} />
            </Button>
          )}
        </div>
      ))}
      {!disabled && (
        <Button variant="secondary" className="text-xs" onClick={() => set({ goboWheels: [...wheels, { name: `${t.goboWheelName} ${wheels.length + 1}`, rotating: false, gobos: [] }] })}>
          <Plus {...ICON} /> {t.addGoboWheel}
        </Button>
      )}
    </div>
  );
}

/** Gobos als kommagetrennte Liste (Leerzeichen und Groß-/Kleinschreibung bleiben) */
function GoboList({ value, disabled, onChange }: { value: string[]; disabled: boolean; onChange: (gobos: string[]) => void }) {
  return (
    <TextInput
      defaultValue={value.join(', ')}
      disabled={disabled}
      placeholder="Sterne, Breakup, Kreis …"
      onBlur={(e) =>
        onChange(
          e.target.value
            .split(',')
            .map((g) => g.trim())
            .filter(Boolean),
        )
      }
    />
  );
}
