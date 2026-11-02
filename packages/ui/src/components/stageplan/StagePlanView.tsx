// Bühnenplan-Ansicht: Werkzeuge, Seitenleisten, maßstäbliche Zeichenfläche, Eigenschaften, Prüfungen.
import { useEffect, useMemo, useState } from 'react';
import { BrickWall, Copy, Maximize, MousePointer2, Redo2, RotateCw, Ruler, SquareDashedMousePointer, Trash2, Type, Undo2, ZoomIn, ZoomOut, type LucideIcon } from 'lucide-react';
import { ICON, TOOL_ICON } from '../icons';
import type * as Y from 'yjs';
import {
  addDevice,
  addShape,
  backgroundScale,
  canDock,
  computeCableLength,
  computeMulticoreLength,
  dependents,
  formatCableLength,
  formatMeters,
  isMulticore,
  lengthContext,
  updateCables,
  dockedPosition,
  standLayout,
  duplicateDevices,
  findDockTarget,
  isCarrierKind,
  normalizeAngle,
  removeDevices,
  removeShapes,
  rotateWithDependents,
  setBackground,
  snapTo,
  updateDevices,
  updateSettings,
  updateShapes,
  type DeviceInstance,
  type Issue,
  type Library,
  type Shape,
  type Template,
} from '@steckplan/core';
import { useEditor, type StageTool } from '../../lib/editor';
import type { UndoApi } from '../../lib/undo';
import { useIssues } from '../../lib/useIssues';
import { useIsNarrow } from '../../lib/useProjectDoc';
import type { ProjectData } from '../../lib/useProjectData';
import { parseMeters } from '../../lib/units';
import { texts } from '../../texts';
import { Banner, Button, Field, Modal, TextInput } from '../ui';
import { selectClass } from '../library/fields';
import { ChecksPanel } from '../signalflow/ChecksPanel';
import { LibrarySidebar } from '../signalflow/LibrarySidebar';
import { PropertiesPanel } from '../signalflow/PropertiesPanel';
import { FilterBar } from '../FilterBar';
import { buildMulticoreRoutes, buildStageCables, buildStageGroupFrames, buildStageItems } from './model';
import { BackgroundPanel, LayersPanel, UnplacedPanel } from './SidePanels';
import { StagePlanCanvas, type StagePt } from './StagePlanCanvas';
import { ShapeProperties, StageDeviceSection } from './StageProperties';

const s = texts.stageplan;
type Panel = 'library' | 'unplaced' | 'layers' | 'background';
const GRIDS = [100, 250, 500, 1000];

export function StagePlanView({ doc, data, library, editable, undo }: { doc: Y.Doc; data: ProjectData; library: Library | null; editable: boolean; undo: UndoApi }) {
  const view = useEditor((st) => st.stageView);
  const setView = useEditor((st) => st.setStageView);
  const selection = useEditor((st) => st.selection);
  const select = useEditor((st) => st.select);
  const clearSelection = useEditor((st) => st.clearSelection);
  const focus = useEditor((st) => st.focus);
  const tool = useEditor((st) => st.tool);
  const setTool = useEditor((st) => st.setTool);
  const activeLayer = useEditor((st) => st.activeLayerId);
  const filter = useEditor((st) => st.filter);
  const colorMode = useEditor((st) => st.colorMode);
  const showCables = useEditor((st) => st.showCables);
  const setShowCables = useEditor((st) => st.setShowCables);
  const narrow = useIsNarrow(900);
  const [panel, setPanel] = useState<Panel>('library');
  const [mobilePanel, setMobilePanel] = useState<'none' | 'side' | 'properties'>('none');
  const [calibration, setCalibration] = useState<{ p1: StagePt; p2: StagePt; text: string } | null>(null);
  const [viewport, setViewport] = useState({ width: 800, height: 600 });

  const templates = useMemo(() => new Map((library?.templates ?? []).map((t) => [t.id, t])), [library]);
  const issues = useIssues(data, library);
  const items = useMemo(() => buildStageItems(data.devices, library, data.layers, { colorMode, filter, people: data.people }), [data.devices, library, data.layers, colorMode, filter, data.people]);
  const showStageGroups = useEditor((st) => st.showStageGroups);
  const setShowStageGroups = useEditor((st) => st.setShowStageGroups);
  const groupFrames = useMemo(() => (showStageGroups ? buildStageGroupFrames(data.groups, items) : []), [showStageGroups, data.groups, items]);
  const stageCables = useMemo(() => buildStageCables(data.cables, data.devices, library, data.layers, filter, issues), [data.cables, data.devices, library, data.layers, filter, issues]);
  const multicores = useMemo(() => buildMulticoreRoutes(data.devices, library, data.layers, filter), [data.devices, library, data.layers, filter]);
  const lengthCtx = useMemo(() => lengthContext(data.devices, library?.templates ?? [], data.settings), [data.devices, library, data.settings]);
  const visibleLayers = useMemo(() => new Set(data.layers.filter((l) => l.visible).map((l) => l.id)), [data.layers]);
  const lockedLayers = useMemo(() => new Set(data.layers.filter((l) => l.locked).map((l) => l.id)), [data.layers]);
  const shapes = useMemo(() => data.shapes.filter((x) => visibleLayers.has(x.layerId) || !data.layers.some((l) => l.id === x.layerId)), [data.shapes, visibleLayers, data.layers]);
  const gridMm = data.settings.gridMm ?? 500;
  const snap = data.settings.snap ?? true;
  const layerId = activeLayer && data.layers.some((l) => l.id === activeLayer) ? activeLayer : data.layers[0]?.id;
  const unplacedCount = data.devices.filter((d) => !d.stagePlan && (templates.get(d.templateId)?.kind !== 'cableType' || isMulticore(templates.get(d.templateId)))).length;
  const byId = useMemo(() => new Map(data.devices.map((d) => [d.id, d])), [data.devices]);

  useEffect(() => () => setTool('select'), [setTool]);

  const snapPt = (p: StagePt): StagePt => (snap ? { x: snapTo(p.x, gridMm), y: snapTo(p.y, gridMm) } : { x: Math.round(p.x), y: Math.round(p.y) });

  function viewCenter(): StagePt {
    return snapPt({ x: (viewport.width / 2 - view.x) / view.zoom, y: (viewport.height / 2 - view.y) / view.zoom });
  }

  function placementPatch(device: DeviceInstance, position: StagePt, extra: Partial<NonNullable<DeviceInstance['stagePlan']>> = {}): Partial<DeviceInstance> {
    return { stagePlan: { rotationDeg: 0, ...device.stagePlan, ...extra, position: { x: Math.round(position.x), y: Math.round(position.y) } } };
  }

  /** Andocken/Lösen beim Ablegen eines einzelnen Objekts */
  function dropPatch(device: DeviceInstance, template: Template | undefined, center: StagePt, noDock: boolean): Partial<DeviceInstance> {
    if (canDock(template) && !noDock) {
      const exclude = new Set([device.id, ...dependents([device.id], data.devices).map((d) => d.id)]);
      const target = findDockTarget(center, data.devices, templates, exclude);
      if (target) {
        // Stativ: zunächst an der Ablagestelle (bestimmt die Reihenfolge), danach verteilt standLayout nebeneinander
        const pos = templates.get(target.carrier.templateId)?.kind === 'stand' ? center : dockedPosition(target, templates, center);
        return target.kind === 'mount'
          ? { mountedOnId: target.carrier.id, ...placementPatch(device, pos, { standsOnId: undefined }) }
          : { mountedOnId: undefined, ...placementPatch(device, pos, { standsOnId: target.carrier.id }) };
      }
    }
    return { mountedOnId: undefined, ...placementPatch(device, snapPt(center), { standsOnId: undefined }) };
  }

  /** Ergänzt Änderungen um die Neuverteilung auf allen betroffenen Stativen (alter und neuer Träger). */
  function withStandLayout(patches: { id: string; patch: Partial<DeviceInstance> }[], added: DeviceInstance[] = []): { id: string; patch: Partial<DeviceInstance> }[] {
    const patched = new Map(patches.map((x) => [x.id, x.patch]));
    const after = [...data.devices, ...added].map((d) => (patched.has(d.id) ? { ...d, ...patched.get(d.id) } : d));
    const standIds = new Set<string>();
    for (const { id, patch } of patches) {
      for (const carrierId of [byId.get(id)?.mountedOnId, 'mountedOnId' in patch ? patch.mountedOnId : byId.get(id)?.mountedOnId]) {
        if (carrierId && templates.get(byId.get(carrierId)?.templateId ?? '')?.kind === 'stand') standIds.add(carrierId);
      }
    }
    const result = new Map(patches.map((x) => [x.id, { ...x.patch }]));
    for (const standId of standIds) {
      const stand = after.find((d) => d.id === standId);
      if (!stand) continue;
      for (const placement of standLayout(stand, after, templates)) {
        const current = after.find((d) => d.id === placement.id)!;
        const patch = result.get(placement.id) ?? {};
        patch.stagePlan = { ...current.stagePlan!, ...patch.stagePlan, position: placement.position, rotationDeg: placement.rotationDeg ?? 0 };
        result.set(placement.id, patch);
      }
    }
    return [...result.entries()].map(([id, patch]) => ({ id, patch }));
  }

  function moveDevices(moves: { id: string; x: number; y: number }[]) {
    updateDevices(
      doc,
      moves.flatMap((m) => {
        const d = byId.get(m.id);
        return d ? [{ id: m.id, patch: placementPatch(d, m) }] : [];
      }),
      undo.origin,
    );
  }

  function deviceDrop(id: string, center: StagePt, noDock: boolean) {
    const device = byId.get(id);
    if (!device) return;
    updateDevices(doc, withStandLayout([{ id, patch: dropPatch(device, templates.get(device.templateId), center, noDock) }]), undo.origin);
    undo.stop();
  }

  // Langes Drücken auf ein Objekt: auf schmalen Bildschirmen die Eigenschaften (mit allen Aktionen) öffnen
  useEffect(
    () =>
      useEditor.subscribe((st, prev) => {
        const count = st.selection.devices.length + st.selection.cables.length + st.selection.shapes.length;
        if (narrow && st.propertiesRequest !== prev.propertiesRequest && count > 0) setMobilePanel('properties');
      }),
    [narrow],
  );

  function addFromTemplate(template: Template, at?: StagePt) {
    if (!editable) return;
    const pos = at ?? viewCenter();
    const device = addDevice(doc, template, pos, undo.origin, { view: 'stagePlan', layerId });
    const created = { ...device };
    const patch = dropPatch(created, template, pos, false);
    updateDevices(doc, withStandLayout([{ id: device.id, patch }], [created]), undo.origin);
    undo.stop();
    select({ devices: [device.id] });
    if (narrow) setMobilePanel('none');
  }

  function placeUnplaced(id: string, at?: StagePt) {
    const device = byId.get(id);
    if (!device) return;
    const pos = at ?? viewCenter();
    if (isMulticore(templates.get(device.templateId))) {
      updateDevices(doc, [{ id, patch: { stagePlan: { position: pos, rotationDeg: 0, endB: { x: pos.x + 5000, y: pos.y }, waypoints: [] } } }], undo.origin);
      undo.stop();
      select({ devices: [id] });
      return;
    }
    const placed = { ...device, stagePlan: { position: pos, rotationDeg: 0 } };
    updateDevices(doc, withStandLayout([{ id, patch: { layerId: device.layerId || layerId || device.layerId, ...dropPatch(placed, templates.get(device.templateId), pos, false) } }]), undo.origin);
    undo.stop();
    select({ devices: [id] });
  }

  function lengthLabel(id: string): string | undefined {
    const cable = data.cables.find((c) => c.id === id);
    const device = cable ? undefined : byId.get(id);
    const length = cable ? computeCableLength(cable, lengthCtx) : device ? computeMulticoreLength(device, templates.get(device.templateId), data.settings) : undefined;
    if (!length || length.totalMm === undefined) return undefined;
    if (length.status === 'manual') return `${formatCableLength(length.chosenMm)} (von Hand)`;
    return `${formatMeters(length.totalMm)} → ${length.chosenMm === null ? 'Verlängerung nötig' : formatCableLength(length.chosenMm)}`;
  }

  function rotate(id: string, deg: number) {
    const device = byId.get(id);
    if (!device?.stagePlan) return;
    const rotationDeg = normalizeAngle(deg);
    if (isCarrierKind(templates.get(device.templateId))) {
      updateDevices(
        doc,
        rotateWithDependents(device, rotationDeg, data.devices).map((p) => {
          const d = byId.get(p.id)!;
          return { id: p.id, patch: { stagePlan: { ...d.stagePlan!, position: { x: Math.round(p.position.x), y: Math.round(p.position.y) }, rotationDeg: p.rotationDeg ?? 0 } } };
        }),
        undo.origin,
      );
    } else updateDevices(doc, [{ id, patch: { stagePlan: { ...device.stagePlan, rotationDeg } } }], undo.origin);
    undo.stop();
  }

  function rotateSelection90() {
    for (const id of selection.devices) {
      const d = byId.get(id);
      if (d?.stagePlan) rotate(id, (d.stagePlan.rotationDeg ?? 0) + 90);
    }
    updateShapes(
      doc,
      data.shapes.filter((x) => selection.shapes.includes(x.id) && x.kind === 'text').map((x) => ({ id: x.id, patch: { rotationDeg: normalizeAngle(x.rotationDeg + 90) } })),
      undo.origin,
    );
  }

  function addShapeFromCanvas(shape: Omit<Shape, 'id' | 'layerId'>) {
    if (!layerId) return;
    const created = addShape(doc, { ...shape, layerId } as Omit<Shape, 'id'>, undo.origin);
    undo.stop();
    if (shape.kind === 'text') select({ shapes: [created.id] });
  }

  function deleteSelection() {
    if (!editable) return;
    const removing = new Set(selection.devices);
    // Geräte an gelöschten Trägern lösen (bleiben liegen)
    const released = data.devices.filter((d) => !removing.has(d.id) && ((d.mountedOnId && removing.has(d.mountedOnId)) || (d.stagePlan?.standsOnId && removing.has(d.stagePlan.standsOnId))));
    doc.transact(() => {
      updateDevices(doc, released.map((d) => ({ id: d.id, patch: { mountedOnId: d.mountedOnId && removing.has(d.mountedOnId) ? undefined : d.mountedOnId, stagePlan: { ...d.stagePlan!, standsOnId: d.stagePlan?.standsOnId && removing.has(d.stagePlan.standsOnId) ? undefined : d.stagePlan?.standsOnId } } })), undo.origin);
      removeDevices(doc, selection.devices, undo.origin);
      removeShapes(doc, selection.shapes, undo.origin);
    }, undo.origin);
    undo.stop();
    clearSelection();
  }

  function duplicate() {
    if (!editable) return;
    const deviceIds = selection.devices.length ? duplicateDevices(doc, selection.devices, { x: 30, y: 30 }, undo.origin, { x: gridMm, y: gridMm }) : [];
    const shapeIds = data.shapes
      .filter((x) => selection.shapes.includes(x.id))
      .map((x) => addShape(doc, { ...x, points: x.points.map((p) => ({ x: p.x + gridMm, y: p.y + gridMm })) }, undo.origin).id);
    undo.stop();
    select({ devices: deviceIds, shapes: shapeIds });
  }

  function confirmCalibration() {
    if (!calibration || !data.background) return;
    const real = parseMeters(calibration.text);
    if (!real || real <= 0) return;
    const bg = data.background;
    const scale = backgroundScale(bg);
    const offset = bg.offset ?? { x: 0, y: 0 };
    const img1 = { x: (calibration.p1.x - offset.x) / scale, y: (calibration.p1.y - offset.y) / scale };
    const img2 = { x: (calibration.p2.x - offset.x) / scale, y: (calibration.p2.y - offset.y) / scale };
    const distPx = Math.hypot(img2.x - img1.x, img2.y - img1.y);
    if (distPx <= 0) return;
    const newScale = real / distPx;
    setBackground(
      doc,
      { ...bg, calibration: { p1: img1, p2: img2, realDistanceMm: real }, offset: { x: Math.round(calibration.p1.x - img1.x * newScale), y: Math.round(calibration.p1.y - img1.y * newScale) } },
      undo.origin,
    );
    undo.stop();
    setCalibration(null);
  }

  function fit() {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const i of items) {
      const r = Math.max(i.footprint.widthMm, i.footprint.depthMm) / 2;
      xs.push(i.x - r, i.x + r);
      ys.push(i.y - r, i.y + r);
    }
    for (const sh of shapes) {
      for (const p of sh.points) {
        xs.push(p.x);
        ys.push(p.y);
      }
    }
    if (data.background?.widthPx && data.background.heightPx) {
      const sc = backgroundScale(data.background);
      const o = data.background.offset ?? { x: 0, y: 0 };
      xs.push(o.x, o.x + data.background.widthPx * sc);
      ys.push(o.y, o.y + data.background.heightPx * sc);
    }
    if (!xs.length) {
      setView({ x: 60, y: 60, zoom: 0.08 });
      return;
    }
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const w = Math.max(1000, Math.max(...xs) - minX);
    const h = Math.max(1000, Math.max(...ys) - minY);
    const zoom = Math.min(0.5, Math.max(0.005, Math.min((viewport.width - 80) / w, (viewport.height - 80) / h)));
    setView({ zoom, x: (viewport.width - w * zoom) / 2 - minX * zoom, y: (viewport.height - h * zoom) / 2 - minY * zoom });
  }

  function zoomBy(factor: number) {
    const zoom = Math.min(1.5, Math.max(0.005, view.zoom * factor));
    const cx = viewport.width / 2;
    const cy = viewport.height / 2;
    setView({ zoom, x: cx - ((cx - view.x) / view.zoom) * zoom, y: cy - ((cy - view.y) / view.zoom) * zoom });
  }

  function jump(issue: Issue) {
    const deviceIds = issue.objectIds.filter((id) => byId.has(id));
    select({ devices: deviceIds, cables: issue.objectIds.filter((id) => data.cables.some((c) => c.id === id)) });
    const item = items.find((i) => deviceIds.includes(i.device.id));
    if (item) focus({ x: item.x, y: item.y });
    if (issue.id === 'unplaced') setPanel('unplaced');
  }

  // Tastenkürzel
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"], dialog')) return;
      const mod = e.ctrlKey || e.metaKey;
      const count = selection.devices.length + selection.shapes.length;
      if (editable && (e.key === 'Delete' || e.key === 'Backspace') && count) {
        e.preventDefault();
        deleteSelection();
      } else if (editable && mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) undo.redo();
        else undo.undo();
      } else if (editable && mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        undo.redo();
      } else if (editable && mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicate();
      } else if (editable && !mod && e.key.toLowerCase() === 'r' && count) {
        e.preventDefault();
        rotateSelection90();
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        select({ devices: items.filter((i) => !i.locked).map((i) => i.device.id), shapes: shapes.filter((x) => !lockedLayers.has(x.layerId)).map((x) => x.id) });
      } else if (editable && e.key.startsWith('Arrow') && count) {
        e.preventDefault();
        const step = e.shiftKey ? gridMm : 10;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const ids = selection.devices;
        const moving = [...ids.map((id) => byId.get(id)!), ...dependents(ids, data.devices).filter((d) => !ids.includes(d.id))].filter((d) => d?.stagePlan);
        moveDevices(moving.map((d) => ({ id: d.id, x: d.stagePlan!.position.x + dx, y: d.stagePlan!.position.y + dy })));
        updateShapes(doc, data.shapes.filter((x) => selection.shapes.includes(x.id)).map((x) => ({ id: x.id, patch: { points: x.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) } })), undo.origin);
        undo.stop();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const selectedShape = selection.devices.length === 0 && selection.cables.length === 0 && selection.shapes.length === 1 ? data.shapes.find((x) => x.id === selection.shapes[0]) : undefined;
  const count = selection.devices.length + selection.shapes.length;

  const tabs: { key: Panel; label: string }[] = [
    { key: 'library', label: s.panels.library },
    { key: 'unplaced', label: `${s.panels.unplaced}${unplacedCount ? ` (${unplacedCount})` : ''}` },
    { key: 'layers', label: s.panels.layers },
    { key: 'background', label: s.panels.background },
  ];
  const side = (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-2 gap-1 border-b border-slate-200 p-1 dark:border-slate-700" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={panel === t.key} onClick={() => setPanel(t.key)} className={`rounded px-2 py-1 text-xs ${panel === t.key ? 'bg-sky-600 text-white' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {panel === 'library' && <LibrarySidebar mode="stageplan" library={library} editable={editable} onAdd={(t) => addFromTemplate(t)} />}
        {panel === 'unplaced' && <UnplacedPanel devices={data.devices} library={library} editable={editable} onPlace={(id) => placeUnplaced(id)} />}
        {panel === 'layers' && <LayersPanel doc={doc} origin={undo.origin} data={data} editable={editable} />}
        {panel === 'background' && <BackgroundPanel doc={doc} origin={undo.origin} background={data.background} editable={editable} />}
      </div>
    </div>
  );
  const properties = selectedShape ? (
    <ShapeProperties doc={doc} origin={undo.origin} data={data} shape={selectedShape} editable={editable} />
  ) : (
    <PropertiesPanel
      doc={doc}
      origin={undo.origin}
      library={library}
      data={data}
      selection={selection}
      issues={issues}
      editable={editable}
      deviceExtra={(device) => <StageDeviceSection doc={doc} origin={undo.origin} library={library} data={data} device={device} editable={editable} />}
      empty={
        <div className="space-y-2 text-sm text-slate-500">
          <p>{texts.signalflow.nothingSelected}</p>
          <ul className="list-disc space-y-1 pl-4 text-xs">
            <li>Geräte über einem Stativ, einer Traverse oder einem Podest ablegen = andocken (Alt-Taste: nicht andocken)</li>
            <li>R = drehen, Entf = löschen, Strg/⌘+D = duplizieren, Pfeiltasten = verschieben</li>
            <li>Strg/⌘ + Mausrad = zoomen, Hintergrund ziehen = verschieben</li>
          </ul>
        </div>
      }
    />
  );

  const toolButton = (key: StageTool, label: string, Icon: LucideIcon) => (
    <Button key={key} variant={tool === key ? 'primary' : 'ghost'} className="min-h-9 px-2" aria-pressed={tool === key} aria-label={label} title={label} onClick={() => setTool(tool === key ? 'select' : key)}>
      <Icon {...TOOL_ICON} /> <span className="hidden lg:inline">{label}</span>
    </Button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900" role="toolbar" aria-label={texts.signalflow.toolbar}>
        {editable && (
          <>
            {toolButton('select', s.tools.select, MousePointer2)}
            {toolButton('marquee', s.tools.marquee, SquareDashedMousePointer)}
            {toolButton('wall', s.tools.wall, BrickWall)}
            {toolButton('text', s.tools.text, Type)}
            {toolButton('dimension', s.tools.dimension, Ruler)}
            <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
            <Button variant="ghost" className="min-h-9 px-2" aria-label={texts.signalflow.undo} title={texts.signalflow.undo} onClick={undo.undo} disabled={!undo.canUndo}>
              <Undo2 {...TOOL_ICON} />
            </Button>
            <Button variant="ghost" className="min-h-9 px-2" aria-label={texts.signalflow.redo} title={texts.signalflow.redo} onClick={undo.redo} disabled={!undo.canRedo}>
              <Redo2 {...TOOL_ICON} />
            </Button>
            <Button variant="ghost" className="min-h-9 px-2" aria-label={s.rotate90} title={s.rotate90} onClick={rotateSelection90} disabled={count === 0}>
              <RotateCw {...TOOL_ICON} />
            </Button>
            <Button variant="ghost" className="min-h-9 px-2" aria-label={texts.signalflow.duplicate} title={texts.signalflow.duplicate} onClick={duplicate} disabled={count === 0}>
              <Copy {...TOOL_ICON} />
            </Button>
            <Button variant="ghost" className="min-h-9 px-2" aria-label={texts.signalflow.delete} title={texts.signalflow.delete} onClick={deleteSelection} disabled={count === 0}>
              <Trash2 {...TOOL_ICON} />
            </Button>
            <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
            <label className="flex items-center gap-1 text-xs">
              {s.grid}
              <select
                className={`${selectClass} w-auto py-1 text-xs`}
                aria-label={s.grid}
                value={gridMm}
                onChange={(e) => updateSettings(doc, { gridMm: Number(e.target.value) }, undo.origin)}
              >
                {[...new Set([...GRIDS, gridMm])].sort((a, b) => a - b).map((g) => (
                  <option key={g} value={g}>
                    {(g / 1000).toLocaleString('de-DE')} m
                  </option>
                ))}
              </select>
            </label>
            <label className="ml-2 flex items-center gap-1 text-xs">
              <input type="checkbox" checked={snap} onChange={(e) => updateSettings(doc, { snap: e.target.checked }, undo.origin)} />
              {s.snap}
            </label>
          </>
        )}
        <label className="ml-2 flex items-center gap-1 text-xs">
          <input type="checkbox" checked={showCables} onChange={(e) => setShowCables(e.target.checked)} />
          {s.showCables}
        </label>
        {data.groups.length > 0 && (
          <label className="ml-2 flex items-center gap-1 text-xs" title={texts.groups.showTitle}>
            <input type="checkbox" checked={showStageGroups} onChange={(e) => setShowStageGroups(e.target.checked)} />
            {texts.groups.show}
          </label>
        )}
        <div className="flex-1" />
        <Button variant="ghost" className="min-h-9 px-2" aria-label={texts.signalflow.zoomOut} onClick={() => zoomBy(1 / 1.25)}>
          <ZoomOut {...TOOL_ICON} />
        </Button>
        <Button variant="ghost" className="min-h-9 px-2" aria-label={texts.signalflow.zoomIn} onClick={() => zoomBy(1.25)}>
          <ZoomIn {...TOOL_ICON} />
        </Button>
        <Button variant="ghost" className="min-h-9 px-2 text-xs" onClick={fit}>
          <Maximize {...ICON} /> {texts.signalflow.fit}
        </Button>
      </div>
      <FilterBar library={library} data={data} />
      {narrow && (
        <div className="flex gap-1 border-b border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900">
          <Button variant={mobilePanel === 'side' ? 'primary' : 'ghost'} onClick={() => setMobilePanel(mobilePanel === 'side' ? 'none' : 'side')}>
            {s.panels.library}
          </Button>
          <Button variant={mobilePanel === 'properties' ? 'primary' : 'ghost'} onClick={() => setMobilePanel(mobilePanel === 'properties' ? 'none' : 'properties')}>
            {texts.signalflow.properties}
            {count ? ` (${count})` : ''}
          </Button>
        </div>
      )}
      <div className="relative flex min-h-0 flex-1">
        {!narrow && <div className="w-64 shrink-0 border-r border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">{side}</div>}
        <div
          className="relative min-w-0 flex-1"
          ref={(el) => {
            if (el && (el.clientWidth !== viewport.width || el.clientHeight !== viewport.height)) setViewport({ width: el.clientWidth, height: el.clientHeight });
          }}
        >
          <StagePlanCanvas
            items={items}
            cables={stageCables}
            multicores={multicores}
            showCables={showCables}
            groupFrames={groupFrames}
            lengthLabel={lengthLabel}
            onCableWaypoints={(id, waypoints) => {
              updateCables(doc, [{ id, patch: { waypoints } }], undo.origin);
              undo.stop();
            }}
            onMulticoreChange={(id, patch) => {
              const d = byId.get(id);
              if (!d?.stagePlan) return;
              updateDevices(doc, [{ id, patch: { stagePlan: { ...d.stagePlan, ...patch } } }], undo.origin);
              undo.stop();
            }}
            shapes={shapes}
            lockedLayers={lockedLayers}
            background={data.background}
            devices={data.devices}
            templates={templates}
            gridMm={gridMm}
            snap={snap}
            editable={editable}
            onMoveDevices={moveDevices}
            onDeviceDrop={deviceDrop}
            onGroupDrop={() => undo.stop()}
            onRotate={rotate}
            onAddShape={addShapeFromCanvas}
            onUpdateShape={(id, patch) => {
              updateShapes(doc, [{ id, patch }], undo.origin);
              undo.stop();
            }}
            onDropTemplate={(id, at) => {
              const t = templates.get(id);
              if (t) addFromTemplate(t, at);
            }}
            onDropUnplaced={(id, at) => placeUnplaced(id, at)}
            onCalibrate={(p1, p2) => setCalibration({ p1, p2, text: '' })}
            onBackgroundMove={(offset) => {
              if (data.background) setBackground(doc, { ...data.background, offset }, undo.origin);
              undo.stop();
            }}
          />
          {tool === 'calibrate' && !data.background && (
            <div className="absolute top-14 left-1/2 w-80 -translate-x-1/2">
              <Banner tone="warn">Zuerst einen Grundriss importieren (Reiter „Hintergrund“).</Banner>
            </div>
          )}
        </div>
        {!narrow && <div className="w-72 shrink-0 overflow-y-auto border-l border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">{properties}</div>}
        {narrow && mobilePanel !== 'none' && (
          <div className="absolute inset-y-0 left-0 z-10 w-[min(20rem,90%)] overflow-y-auto border-r border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
            {mobilePanel === 'side' ? side : properties}
          </div>
        )}
      </div>
      <ChecksPanel issues={issues} onJump={jump} />
      {calibration && (
        <Modal
          title={s.calibrateTitle}
          onClose={() => setCalibration(null)}
          footer={
            <>
              <Button onClick={() => setCalibration(null)}>{texts.common.cancel}</Button>
              <Button variant="primary" disabled={!parseMeters(calibration.text)} onClick={confirmCalibration}>
                {s.apply}
              </Button>
            </>
          }
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              confirmCalibration();
            }}
            className="space-y-2"
          >
            <p className="text-sm">{s.calibrateText}</p>
            <Field label={s.distance}>
              <TextInput inputMode="decimal" autoFocus value={calibration.text} onChange={(e) => setCalibration({ ...calibration, text: e.target.value })} />
            </Field>
          </form>
        </Modal>
      )}
    </div>
  );
}
