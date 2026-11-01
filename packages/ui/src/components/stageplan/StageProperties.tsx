// Bühnenplan-Abschnitt im Eigenschaften-Panel (Ebene, Höhe, Drehung, Andocken) und Eigenschaften von Formen.
import type * as Y from 'yjs';
import {
  canDock,
  effectiveHeight,
  isCarrierKind,
  mountedCount,
  normalizeAngle,
  polylineLength,
  rotateWithDependents,
  updateDevices,
  updateShapes,
  type DeviceInstance,
  type Library,
  type Shape,
} from '@steckplan/core';
import type { ProjectData } from '../../lib/useProjectData';
import { texts } from '../../texts';
import { Button, Field, TextInput } from '../ui';
import { MeterField, selectClass } from '../library/fields';
import { formatLength } from './model';

const s = texts.stageplan;

export function StageDeviceSection({ doc, origin, library, data, device, editable }: { doc: Y.Doc; origin: object; library: Library | null; data: ProjectData; device: DeviceInstance; editable: boolean }) {
  const templates = new Map((library?.templates ?? []).map((t) => [t.id, t]));
  const byId = new Map(data.devices.map((d) => [d.id, d]));
  const template = templates.get(device.templateId);
  const update = (patch: Partial<DeviceInstance>) => updateDevices(doc, [{ id: device.id, patch }], origin);
  const stage = device.stagePlan;
  const height = effectiveHeight(device, byId, templates);
  const carrier = isCarrierKind(template);
  const from = height.fromId ? byId.get(height.fromId) : undefined;
  const source =
    height.source === 'mount' ? s.heightFrom.mount(from?.label ?? '?') : height.source === 'standsOn' ? s.heightFrom.standsOn(from?.label ?? '?') : s.heightFrom[height.source];
  const mountedOn = device.mountedOnId ? byId.get(device.mountedOnId) : undefined;
  const standsOn = stage?.standsOnId ? byId.get(stage.standsOnId) : undefined;

  return (
    <section className="space-y-3 rounded-md border border-slate-200 p-2 dark:border-slate-700" aria-label={s.stage}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{s.stage}</div>
      <Field label={s.layer}>
        <select className={selectClass} value={device.layerId} disabled={!editable} onChange={(e) => update({ layerId: e.target.value })}>
          {data.layers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </Field>
      {!stage ? (
        <p className="text-sm text-amber-700">{s.notPlaced}</p>
      ) : (
        <>
          <div className="text-sm" data-testid="effective-height">
            {s.height}: <strong>{formatLength(height.heightMm)}</strong> <span className="text-slate-500">({source})</span>
          </div>
          <MeterField
            label={carrier ? s.instanceHeight : s.ownHeight}
            value={stage.heightMm}
            disabled={!editable}
            onChange={(heightMm) => update({ stagePlan: { ...stage, heightMm } })}
          />
          {stage.heightMm !== undefined && editable && !carrier && (
            <Button variant="ghost" onClick={() => update({ stagePlan: { ...stage, heightMm: undefined } })}>
              ↺ {s.resetHeight}
            </Button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <MeterField label={s.positionX} value={stage.position.x} disabled={!editable} onChange={(x) => update({ stagePlan: { ...stage, position: { ...stage.position, x: x ?? 0 } } })} />
            <MeterField label={s.positionY} value={stage.position.y} disabled={!editable} onChange={(y) => update({ stagePlan: { ...stage, position: { ...stage.position, y: y ?? 0 } } })} />
          </div>
          <Field label={s.rotation}>
            <TextInput
              type="number"
              step={15}
              value={stage.rotationDeg ?? 0}
              disabled={!editable}
              onChange={(e) => {
                const deg = normalizeAngle(Number(e.target.value) || 0);
                if (carrier) {
                  updateDevices(
                    doc,
                    rotateWithDependents(device, deg, data.devices).map((p) => {
                      const d = byId.get(p.id)!;
                      return { id: p.id, patch: { stagePlan: { ...d.stagePlan!, position: p.position, rotationDeg: p.rotationDeg ?? 0 } } };
                    }),
                    origin,
                  );
                } else update({ stagePlan: { ...stage, rotationDeg: deg } });
              }}
            />
          </Field>
          {canDock(template) && (mountedOn || standsOn) && (
            <div className="flex items-center gap-2 text-sm" data-testid="dock-info">
              <span className="flex-1">{mountedOn ? s.mountedOn(mountedOn.label) : s.standsOn(standsOn!.label)}</span>
              {editable && (
                <Button variant="ghost" onClick={() => update({ mountedOnId: undefined, stagePlan: { ...stage, standsOnId: undefined } })}>
                  {s.undock}
                </Button>
              )}
            </div>
          )}
          {(template?.kind === 'stand' || template?.kind === 'truss') && (
            <div className="text-sm text-slate-600 dark:text-slate-300">{s.mounted(mountedCount(device.id, data.devices), template.maxMountedDevices)}</div>
          )}
        </>
      )}
    </section>
  );
}

export function ShapeProperties({ doc, origin, data, shape, editable }: { doc: Y.Doc; origin: object; data: ProjectData; shape: Shape; editable: boolean }) {
  const update = (patch: Partial<Shape>) => updateShapes(doc, [{ id: shape.id, patch }], origin);
  return (
    <div className="space-y-3 p-3">
      <h2 className="text-base font-semibold">{s.shape[shape.kind]}</h2>
      <Field label={s.layer}>
        <select className={selectClass} value={shape.layerId} disabled={!editable} onChange={(e) => update({ layerId: e.target.value })}>
          {data.layers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </Field>
      {shape.kind === 'wall' && (
        <>
          <MeterField label={s.wallThickness} value={shape.strokeWidthMm ?? 200} disabled={!editable} onChange={(v) => update({ strokeWidthMm: v && v > 0 ? v : 200 })} />
          <div className="text-sm text-slate-600 dark:text-slate-300">
            {s.points(shape.points.length)} · {s.length} {formatLength(polylineLength(shape.points))}
          </div>
        </>
      )}
      {shape.kind === 'text' && (
        <>
          <Field label={s.textContent}>
            <TextInput value={shape.text ?? ''} disabled={!editable} onChange={(e) => update({ text: e.target.value })} />
          </Field>
          <MeterField label={s.fontSize} value={shape.fontSizeMm ?? 400} disabled={!editable} onChange={(v) => update({ fontSizeMm: v && v > 0 ? v : 400 })} />
          <Field label={s.rotation}>
            <TextInput type="number" step={15} value={shape.rotationDeg} disabled={!editable} onChange={(e) => update({ rotationDeg: normalizeAngle(Number(e.target.value) || 0) })} />
          </Field>
        </>
      )}
      {shape.kind === 'dimension' && (
        <div className="text-sm" data-testid="dimension-length">
          {s.length}: <strong>{formatLength(polylineLength(shape.points))}</strong>
        </div>
      )}
    </div>
  );
}
