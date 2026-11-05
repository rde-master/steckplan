// Regie → Lichtaufbau (M11c): Raster mit den Lichtgeräten und benannte Ziele mit Punkt auf der Bühne.
// Geräte per Ziehen platzieren (am Handy: antippen, dann Feld antippen); liegt dort schon eines, tauschen beide.
import { ArrowDown, ArrowUp, Crosshair, Eye, EyeOff, LayoutGrid, Trash2, X } from 'lucide-react';
import { useMemo, useRef, useState, type DragEvent } from 'react';
import type * as Y from 'yjs';
import {
  addLightTarget,
  applyArrangement,
  arrangeFromStage,
  gridLayout,
  lightDevices,
  moveLightTarget,
  placeLight,
  removeLightTarget,
  setLightHidden,
  unplaceLight,
  updateLightGrid,
  updateLightTarget,
  type DeviceInstance,
  type Library,
  type LightTarget,
  type StagePosition,
} from '@steckplan/core';
import type { ProjectData } from '../../lib/useProjectData';
import { stageBounds, stagePlanSvg, type StageDrawing } from '../../pdf/svg';
import { texts } from '../../texts';
import { ICON } from '../icons';
import { buildStageItems } from '../stageplan/model';
import { Button } from '../ui';

const t = texts.light;

export function LightSetupView({ doc, origin, data, library, editable }: { doc: Y.Doc; origin: object; data: ProjectData; library: Library | null; editable: boolean }) {
  const templates = useMemo(() => new Map((library?.templates ?? []).map((tp) => [tp.id, tp])), [library]);
  const lights = useMemo(() => lightDevices(data.devices, templates), [data.devices, templates]);
  const grid = data.lightGrid;
  const layout = gridLayout(lights, data.lightPlacements, grid);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const items = useMemo(() => buildStageItems(data.devices, library, data.layers), [data.devices, library, data.layers]);

  const at = new Map(layout.placed.map((p) => [`${p.col}/${p.row}`, p.device]));
  const selectedDevice = lights.find((d) => d.id === selected);

  const arrange = () => {
    if (layout.placed.length && !window.confirm(t.fromStageConfirm)) return;
    const byId = new Map(data.devices.map((d) => [d.id, d]));
    const lightIds = new Set(lights.map((d) => d.id));
    const positions: StagePosition[] = items
      .filter((i) => lightIds.has(i.device.id))
      .map((i) => {
        const carrierId = i.device.mountedOnId ?? i.device.stagePlan?.standsOnId;
        const carrier = carrierId ? byId.get(carrierId) : undefined;
        return { deviceId: i.device.id, x: i.x, y: i.y, ...(carrier ? { carrierId: carrier.id, carrierLabel: carrier.label } : {}) };
      });
    applyArrangement(doc, arrangeFromStage(positions, t.floor), origin);
  };

  const dropOn = (col: number, row: number) => (e: DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/x-steckplan-light') || dragging;
    if (id) placeLight(doc, id, col, row, origin);
    setDragging(null);
  };

  const chip = (device: DeviceInstance, cell?: { col: number; row: number }) => {
    const where = cell ? 'grid' : 'list';
    const template = templates.get(device.templateId);
    const isSelected = selected === device.id;
    return (
      <button
        key={device.id}
        type="button"
        draggable={editable}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/x-steckplan-light', device.id);
          e.dataTransfer.effectAllowed = 'move';
          setDragging(device.id);
        }}
        onDragEnd={() => setDragging(null)}
        onClick={(e) => {
          e.stopPropagation();
          if (!editable) return;
          // anderes Gerät gewählt und dieses liegt im Raster → tauschen
          if (selected && !isSelected && cell) {
            placeLight(doc, selected, cell.col, cell.row, origin);
            setSelected(null);
            return;
          }
          setSelected(isSelected ? null : device.id);
        }}
        aria-pressed={isSelected}
        data-testid="light-chip"
        data-device={device.id}
        title={template?.name}
        className={`flex min-w-0 flex-col items-start rounded-md border px-1.5 py-1 text-left text-xs leading-tight ${
          isSelected ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 bg-white hover:border-sky-400 dark:border-slate-600 dark:bg-slate-800'
        } ${where === 'grid' ? 'h-full w-full' : ''} ${dragging === device.id ? 'opacity-40' : ''}`}
      >
        <span className="w-full truncate font-semibold">{device.label}</span>
        <span className={`w-full truncate ${isSelected ? 'text-sky-100' : 'text-slate-500'}`}>{template?.name}</span>
      </button>
    );
  };

  if (lights.length === 0) return <p className="mx-auto max-w-2xl p-6 text-sm text-slate-500" data-testid="light-setup">{t.noLights}</p>;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4" data-testid="light-setup">
      <section className="space-y-2" aria-label={t.grid}>
        <div className="flex flex-wrap items-end gap-3">
          <h3 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{t.grid}</h3>
          <SizeInput label={t.cols} value={grid.cols} max={48} disabled={!editable} onChange={(cols) => updateLightGrid(doc, { cols }, origin)} />
          <SizeInput label={t.rows} value={grid.rows} max={24} disabled={!editable} onChange={(rows) => updateLightGrid(doc, { rows }, origin)} />
          <div className="flex-1" />
          {editable && (
            <Button variant="secondary" className="text-xs" onClick={arrange} title={t.fromStageHint}>
              <LayoutGrid {...ICON} /> {t.fromStage}
            </Button>
          )}
        </div>
        {editable && <p className="text-xs text-slate-500">{selectedDevice ? t.selected(selectedDevice.label) : t.placeHint}</p>}
        {selectedDevice && editable && (
          <div className="flex flex-wrap gap-2">
            {layout.placed.some((p) => p.device.id === selectedDevice.id) && (
              <Button variant="ghost" className="text-xs" onClick={() => {
                  unplaceLight(doc, selectedDevice.id, origin);
                  setSelected(null);
                }}>
                <X {...ICON} /> {t.remove}
              </Button>
            )}
            <Button variant="ghost" className="text-xs" onClick={() => {
                setLightHidden(doc, selectedDevice.id, true, origin);
                setSelected(null);
              }}>
              <EyeOff {...ICON} /> {t.hide}
            </Button>
            <Button variant="ghost" className="text-xs" onClick={() => setSelected(null)}>
              {t.cancelSelection}
            </Button>
          </div>
        )}
        <div className="overflow-x-auto pb-1">
          <div className="grid gap-1" style={{ gridTemplateColumns: `minmax(6rem, 9rem) repeat(${grid.cols}, minmax(4.5rem, 1fr))`, minWidth: `${6 + grid.cols * 4.75}rem` }} data-testid="light-grid">
            {Array.from({ length: grid.rows }, (_, row) => (
              <div key={row} className="contents">
                <input
                  aria-label={t.rowLabel(row + 1)}
                  className="self-center rounded border border-transparent bg-transparent px-1 py-1 text-xs font-medium text-slate-600 hover:border-slate-300 focus:border-sky-500 focus:outline-none disabled:hover:border-transparent dark:text-slate-300 dark:hover:border-slate-600"
                  value={grid.rowLabels[row] ?? ''}
                  placeholder={`${t.rows} ${row + 1}`}
                  disabled={!editable}
                  onChange={(e) => {
                    const labels = Array.from({ length: Math.max(grid.rowLabels.length, row + 1) }, (_, i) => grid.rowLabels[i] ?? '');
                    labels[row] = e.target.value;
                    updateLightGrid(doc, { rowLabels: labels }, origin);
                  }}
                />
                {Array.from({ length: grid.cols }, (_, col) => {
                  const device = at.get(`${col}/${row}`);
                  return (
                    <div
                      key={col}
                      role="gridcell"
                      aria-label={t.cell(col, row)}
                      data-testid="light-cell"
                      onDragOver={(e) => editable && dragging && e.preventDefault()}
                      onDrop={dropOn(col, row)}
                      onClick={() => {
                        if (editable && selected) {
                          placeLight(doc, selected, col, row, origin);
                          setSelected(null);
                        }
                      }}
                      className={`h-14 rounded-md border border-dashed ${selected && !device ? 'border-sky-400 bg-sky-50/60 dark:bg-sky-950/40' : 'border-slate-200 dark:border-slate-700'} ${device ? 'border-transparent' : ''}`}
                    >
                      {device && chip(device, { col, row })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div
            className="rounded-md border border-slate-200 p-2 dark:border-slate-700"
            onDragOver={(e) => editable && dragging && e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData('text/x-steckplan-light') || dragging;
              if (id) unplaceLight(doc, id, origin);
              setDragging(null);
            }}
            data-testid="light-unplaced"
          >
            <div className="mb-1 text-xs font-semibold text-slate-500">
              {t.unplaced} ({layout.unplaced.length})
            </div>
            {layout.unplaced.length === 0 ? <p className="text-xs text-slate-500">{t.unplacedEmpty}</p> : <div className="flex flex-wrap gap-1">{layout.unplaced.map((d) => <div key={d.id} className="w-28">{chip(d)}</div>)}</div>}
          </div>
          {layout.hidden.length > 0 && (
            <div className="rounded-md border border-slate-200 p-2 dark:border-slate-700" data-testid="light-hidden">
              <div className="mb-1 text-xs font-semibold text-slate-500">
                {t.hidden} ({layout.hidden.length})
              </div>
              <ul className="space-y-0.5 text-sm">
                {layout.hidden.map((d) => (
                  <li key={d.id} className="flex items-center gap-2">
                    <span className="flex-1 truncate text-slate-500">{d.label}</span>
                    {editable && (
                      <Button variant="ghost" className="min-h-7 px-1.5 text-xs" onClick={() => setLightHidden(doc, d.id, false, origin)}>
                        <Eye {...ICON} /> {t.show}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <TargetsSection doc={doc} origin={origin} data={data} library={library} targets={data.lightTargets} editable={editable} />
    </div>
  );
}

function SizeInput({ label, value, max, disabled, onChange }: { label: string; value: number; max: number; disabled: boolean; onChange: (n: number) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs">
      {label}
      <input
        type="number"
        min={1}
        max={max}
        className="w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const n = Math.round(Number(e.target.value));
          if (n >= 1 && n <= max) onChange(n);
        }}
      />
    </label>
  );
}

// ---------- Ziele ----------

function TargetsSection({ doc, origin, data, library, targets, editable }: { doc: Y.Doc; origin: object; data: ProjectData; library: Library | null; targets: LightTarget[]; editable: boolean }) {
  const [picking, setPicking] = useState<string | null>(null);
  const pickingTarget = targets.find((x) => x.id === picking);
  return (
    <section className="space-y-2" aria-label={t.targets}>
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{t.targets}</h3>
        <div className="flex-1" />
        {editable && (
          <Button variant="secondary" className="text-xs" onClick={() => setPicking(addLightTarget(doc, t.newTarget(targets.length + 1), origin))}>
            {t.addTarget}
          </Button>
        )}
      </div>
      <p className="text-xs text-slate-500">{t.targetsHint}</p>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <ul className="space-y-1" data-testid="light-targets">
          {targets.map((target, index) => (
            <li key={target.id} className={`flex items-center gap-1.5 rounded-md border px-2 py-1 ${picking === target.id ? 'border-sky-500 bg-sky-50 dark:bg-sky-950' : 'border-slate-200 dark:border-slate-700'}`} data-testid="light-target">
              <input type="color" aria-label={`${t.targetColor}: ${target.name}`} value={target.color ?? '#e11d48'} disabled={!editable} className="h-6 w-6 shrink-0 cursor-pointer border-0 bg-transparent p-0" onChange={(e) => updateLightTarget(doc, target.id, { color: e.target.value }, origin)} />
              <input
                aria-label={t.targetName}
                className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-slate-300 focus:border-sky-500 focus:outline-none disabled:hover:border-transparent dark:hover:border-slate-600"
                value={target.name}
                disabled={!editable}
                onChange={(e) => updateLightTarget(doc, target.id, { name: e.target.value }, origin)}
              />
              <span className="shrink-0 text-xs text-slate-500">{target.stagePoint ? '' : t.noPoint}</span>
              {editable && (
                <>
                  <Button variant="ghost" className={`min-h-7 px-1.5 ${picking === target.id ? 'text-sky-700' : ''}`} aria-label={`${t.setPoint}: ${target.name}`} aria-pressed={picking === target.id} onClick={() => setPicking(picking === target.id ? null : target.id)}>
                    <Crosshair {...ICON} />
                  </Button>
                  <Button variant="ghost" className="min-h-7 px-1.5" aria-label={`${texts.regie.up}: ${target.name}`} disabled={index === 0} onClick={() => moveLightTarget(doc, target.id, -1, origin)}>
                    <ArrowUp {...ICON} />
                  </Button>
                  <Button variant="ghost" className="min-h-7 px-1.5" aria-label={`${texts.regie.down}: ${target.name}`} disabled={index === targets.length - 1} onClick={() => moveLightTarget(doc, target.id, 1, origin)}>
                    <ArrowDown {...ICON} />
                  </Button>
                  <Button variant="ghost" className="min-h-7 px-1.5" aria-label={`${t.removeTarget}: ${target.name}`} onClick={() => removeLightTarget(doc, target.id, origin)}>
                    <Trash2 {...ICON} />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
        <StageMini
          data={data}
          library={library}
          targets={targets}
          picking={pickingTarget}
          onPick={(point) => {
            if (!pickingTarget) return;
            updateLightTarget(doc, pickingTarget.id, { stagePoint: point }, origin);
            setPicking(null);
          }}
          onClear={
            editable && pickingTarget?.stagePoint
              ? () => {
                  updateLightTarget(doc, pickingTarget.id, { stagePoint: undefined }, origin);
                  setPicking(null);
                }
              : undefined
          }
        />
      </div>
    </section>
  );
}

/** Draufsicht des Bühnenplans (nur ansehen) mit den Zielen als farbige Punkte; Klick setzt den Punkt des gewählten Ziels. */
function StageMini({
  data,
  library,
  targets,
  picking,
  onPick,
  onClear,
}: {
  data: ProjectData;
  library: Library | null;
  targets: LightTarget[];
  picking: LightTarget | undefined;
  onPick: (point: { x: number; y: number }) => void;
  onClear: (() => void) | undefined;
}) {
  const overlay = useRef<SVGSVGElement>(null);
  const drawing = useMemo((): StageDrawing => {
    const visible = new Set(data.layers.filter((l) => l.visible).map((l) => l.id));
    return { items: buildStageItems(data.devices, library, data.layers), shapes: data.shapes.filter((s) => visible.has(s.layerId)), cables: [], multicores: [], showCables: false };
  }, [data.devices, data.layers, data.shapes, library]);
  const view = useMemo(() => {
    const base = stageBounds(drawing, false);
    const points = targets.flatMap((x) => (x.stagePoint ? [x.stagePoint] : []));
    if (!base && !points.length) return null;
    const xs = [...(base ? [base.x, base.x + base.width] : []), ...points.map((p) => p.x - 800), ...points.map((p) => p.x + 800)];
    const ys = [...(base ? [base.y, base.y + base.height] : []), ...points.map((p) => p.y - 800), ...points.map((p) => p.y + 800)];
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  }, [drawing, targets]);
  const svg = useMemo(() => (view ? stagePlanSvg(drawing, view, 100, (100 * view.height) / view.width, view.width / 60, false).replace(/width="[^"]*" height="[^"]*"/, 'width="100%" height="100%"') : ''), [drawing, view]);
  if (!view) return <p className="text-sm text-slate-500">{t.stageEmpty}</p>;
  const r = view.width / 70;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="flex-1">{picking ? t.pickPoint(picking.name) : t.stageView}</span>
        {onClear && (
          <Button variant="ghost" className="min-h-7 px-1.5 text-xs" onClick={onClear}>
            {t.clearPoint}
          </Button>
        )}
      </div>
      {/* feste Höhe; beide Ebenen skalieren gleich (preserveAspectRatio „meet“), Punkte bleiben deckungsgleich */}
      <div className={`relative h-[min(28rem,60vh)] w-full overflow-hidden rounded-md border bg-white ${picking ? 'cursor-crosshair border-sky-500' : 'border-slate-200 dark:border-slate-700'}`} data-testid="light-stage">
        <div className="absolute inset-0 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        <svg
          ref={overlay}
          className="absolute inset-0 h-full w-full"
          viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
          onClick={(e) => {
            if (!picking || !overlay.current) return;
            const ctm = overlay.current.getScreenCTM();
            if (!ctm) return;
            const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
            onPick({ x: Math.round(p.x), y: Math.round(p.y) });
          }}
          role="img"
          aria-label={t.stageView}
        >
          {targets.map((target) =>
            target.stagePoint ? (
              <g key={target.id} data-testid="light-target-point">
                <circle cx={target.stagePoint.x} cy={target.stagePoint.y} r={r} fill={target.color ?? '#e11d48'} fillOpacity={0.85} stroke="#fff" strokeWidth={r / 5} />
                <text x={target.stagePoint.x} y={target.stagePoint.y - r * 1.5} textAnchor="middle" fontSize={r * 1.6} fontWeight={600} fill={target.color ?? '#e11d48'} stroke="#fff" strokeWidth={r / 4} paintOrder="stroke">
                  {target.name}
                </text>
              </g>
            ) : null,
          )}
        </svg>
      </div>
    </div>
  );
}
