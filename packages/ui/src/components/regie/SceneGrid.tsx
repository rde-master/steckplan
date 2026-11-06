// Lichtszene im Raster: jedes Gerät in Farbe und Helligkeit seiner Szene, dazu Gobo, Ziel und Bewegung.
import { Move } from 'lucide-react';
import { contrastText, type DeviceInstance, type FixtureState, type GridLayout, type LightGrid, type LightTarget, type Template } from '@steckplan/core';
import { texts } from '../../texts';

const t = texts.light;

/** Hintergrund und Schrift eines Geräts in der Szene (ohne Angabe: neutral, aus: dunkel) */
export function fixtureLook(state: FixtureState | undefined): { background: string; color: string; off: boolean; unset: boolean } {
  if (!state || (state.dimmer === undefined && !state.color)) return { background: 'transparent', color: 'inherit', off: false, unset: !state };
  if (state.dimmer === 0) return { background: '#1e293b', color: '#94a3b8', off: true, unset: false };
  const hex = state.color?.hex ?? '#fef3c7';
  const strength = state.dimmer === undefined ? 100 : 35 + Math.round(state.dimmer * 0.65);
  const background = `color-mix(in srgb, ${hex} ${strength}%, #f1f5f9)`;
  return { background, color: strength >= 70 ? contrastText(hex) : '#0f172a', off: false, unset: false };
}

export function SceneGrid({
  grid,
  layout,
  states,
  targets,
  templates,
  selected,
  onToggle,
  center = false,
}: {
  grid: LightGrid;
  layout: GridLayout;
  states: Map<string, FixtureState>;
  targets: LightTarget[];
  templates: Map<string, Template>;
  selected: ReadonlySet<string>;
  onToggle: ((deviceId: string) => void) | undefined;
  /** Kacheln mit fester Höchstbreite mittig statt über die ganze Breite (Vorstellung) */
  center?: boolean;
}) {
  const at = new Map(layout.placed.map((p) => [`${p.col}/${p.row}`, p.device]));
  const targetById = new Map(targets.map((x) => [x.id, x]));
  const cell = (device: DeviceInstance) => {
    const state = states.get(device.id);
    const look = fixtureLook(state);
    const target = state?.targetId ? targetById.get(state.targetId) : undefined;
    const isSelected = selected.has(device.id);
    return (
      <button
        type="button"
        key={device.id}
        aria-pressed={isSelected}
        aria-label={device.label}
        title={templates.get(device.templateId)?.name}
        disabled={!onToggle}
        onClick={() => onToggle?.(device.id)}
        data-testid="scene-fixture"
        data-device={device.id}
        className={`relative flex h-full min-h-14 w-full min-w-0 flex-col items-start overflow-hidden rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight ${
          isSelected ? 'ring-2 ring-sky-600 ring-offset-1 dark:ring-offset-slate-900' : ''
        } ${look.unset ? 'border-dashed border-slate-300 dark:border-slate-600' : 'border-slate-300 dark:border-slate-600'}`}
        style={{ background: look.background, color: look.color }}
      >
        <span className="w-full truncate font-semibold">{device.label}</span>
        <span className="w-full truncate opacity-90">
          {look.unset ? t.scenes.unset : look.off ? t.scenes.off : [state?.dimmer !== undefined ? `${state.dimmer} %` : '', state?.color?.name ?? ''].filter(Boolean).join(' · ')}
        </span>
        {state?.gobo && <span className="w-full truncate opacity-90">◎ {state.gobo.name}</span>}
        {target && (
          <span className="mt-0.5 max-w-full truncate rounded px-1 text-[10px] font-semibold text-white" style={{ background: target.color ?? '#e11d48' }}>
            → {target.name}
          </span>
        )}
        {state?.effect && <Move size={12} className="absolute top-1 right-1 opacity-80" aria-label={t.fixture.effects[state.effect.kind]} />}
      </button>
    );
  };
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto p-1">
        <div className="grid gap-1" style={{
            // Vorstellung: Kacheln dürfen schmaler werden und stehen mittig (kein Überlaufen nach rechts)
            gridTemplateColumns: center ? `fit-content(7rem) repeat(${grid.cols}, minmax(0, 6.5rem))` : `minmax(3rem, 7rem) repeat(${grid.cols}, minmax(4.25rem, 1fr))`,
            ...(center ? { justifyContent: 'center' } : { minWidth: `${3 + grid.cols * 4.5}rem` }),
          }} data-testid="scene-grid">
          {Array.from({ length: grid.rows }, (_, row) => (
            <div key={row} className="contents">
              <div className="self-center truncate px-1 text-xs text-slate-500">{grid.rowLabels[row] ?? ''}</div>
              {Array.from({ length: grid.cols }, (_, col) => {
                const device = at.get(`${col}/${row}`);
                return (
                  <div key={col} className={`min-h-14 rounded-md ${device ? '' : 'border border-dashed border-slate-100 dark:border-slate-800'}`}>
                    {device && cell(device)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {layout.unplaced.length > 0 && (
        <div>
          <div className="mb-1 text-xs text-slate-500">{t.scenes.notInGrid}</div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-1">{layout.unplaced.map((d) => cell(d))}</div>
        </div>
      )}
    </div>
  );
}
