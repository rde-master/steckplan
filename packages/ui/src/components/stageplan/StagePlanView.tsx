// Bühnenplan-Ansicht: Werkzeuge, Seitenleisten, maßstäbliche Zeichenfläche, Eigenschaften, Prüfungen.
import { useEffect, useMemo, useState } from 'react';
import { BrickWall, Copy, Info, ListChecks, Maximize, Plus, MousePointer2, Redo2, RotateCw, Ruler, SquareDashedMousePointer, Trash2, Type, Undo2, ZoomIn, ZoomOut, type LucideIcon } from 'lucide-react';
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
  type Layer,
  type Template,
  updateLayer,
} from '@steckplan/core';
import { CanvasThemeSwitch } from '../CanvasThemeSwitch';
import { useEditor, type StagePanel, type StageTool } from '../../lib/editor';
import type { UndoApi } from '../../lib/undo';
import { useIssues } from '../../lib/useIssues';
import type { ProjectData } from '../../lib/useProjectData';
import { parseMeters } from '../../lib/units';
import { texts } from '../../texts';
import { Banner, Button, Field, Modal, TextInput } from '../ui';
import { selectClass } from '../library/fields';
import { ChecksPanel } from '../signalflow/ChecksPanel';
import { BottomSheet, CountBadge, FooterButton, InMobileMenu, IssueBadge, MobileFooter, usePhone } from '../mobile';
import { LibrarySidebar } from '../signalflow/LibrarySidebar';
import { PropertiesPanel } from '../signalflow/PropertiesPanel';
import { FilterBar } from '../FilterBar';
import { buildMulticoreRoutes, buildStageCables, buildStageGroupFrames, buildStageItems } from './model';
import { BackgroundPanel, LayersPanel, PlacedPanel, UnplacedPanel } from './SidePanels';
import { StagePlanCanvas, type StagePt } from './StagePlanCanvas';
import { ShapeProperties, StageDeviceSection } from './StageProperties';

const s = texts.stageplan;
type Panel = StagePanel;
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
  const setActiveLayer = useEditor((st) => st.setActiveLayer);
  // Einfügen mit Ebenen-Auswahl (bei mehr als einer Ebene)
  const [pendingInsert, setPendingInsert] = useState<{ template?: Template; deviceId?: string; at?: StagePt } | null>(null);
  const filter = useEditor((st) => st.filter);
  const colorMode = useEditor((st) => st.colorMode);
  const showCables = useEditor((st) => st.showCables);
  const setShowCables = useEditor((st) => st.setShowCables);
  // Handy: Zeichenfläche groß, Werkzeuge im Menü bzw. unten, Seitenleiste/Eigenschaften/Prüfungen als unteres Blatt
  const narrow = usePhone();
  // Reiter links und Texte am Plan: je Browser gemerkt (bleibt beim Neuladen)
  const stageDisplay = useEditor((st) => st.stageDisplay);
  const setStageDisplay = useEditor((st) => st.setStageDisplay);
  const panel = stageDisplay.panel;
  const setPanel = (next: Panel) => setStageDisplay({ panel: next });
  const [mobilePanel, setMobilePanel] = useState<'none' | 'side' | 'properties' | 'checks'>('none');
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

  // Handy: Antippen (neue Auswahl) oder langes Drücken öffnet die Eigenschaften; zu nur über ✕
  useEffect(
    () =>
      useEditor.subscribe((st, prev) => {
        if (!narrow) return;
        const ids = (sel: typeof st.selection) => [...sel.devices, ...sel.cables, ...sel.shapes];
        const before = new Set(ids(prev.selection));
        const added = ids(st.selection).some((id) => !before.has(id));
        if (added || (st.propertiesRequest !== prev.propertiesRequest && ids(st.selection).length > 0)) setMobilePanel('properties');
      }),
    [narrow],
  );

  /** Einfügen anfragen: bei mehreren Ebenen erst fragen, auf welche */
  function requestInsert(request: { template?: Template; deviceId?: string; at?: StagePt }) {
    if (!editable) return;
    if (data.layers.length > 1) {
      setPendingInsert(request);
      return;
    }
    insertOn(request, layerId);
  }

  function insertOn(request: { template?: Template; deviceId?: string; at?: StagePt }, target: string | undefined) {
    const layer = data.layers.find((l) => l.id === target);
    if (layer && !layer.visible) updateLayer(doc, layer.id, { visible: true }, undo.origin);
    if (target) setActiveLayer(target);
    if (request.template) addFromTemplate(request.template, request.at, target);
    else if (request.deviceId) placeUnplaced(request.deviceId, request.at, target);
  }

  function addFromTemplate(template: Template, at?: StagePt, targetLayer: string | undefined = layerId) {
    if (!editable) return;
    const pos = at ?? viewCenter();
    const device = addDevice(doc, template, pos, undo.origin, { view: 'stagePlan', layerId: targetLayer });
    const created = { ...device };
    const patch = dropPatch(created, template, pos, false);
    updateDevices(doc, withStandLayout([{ id: device.id, patch }], [created]), undo.origin);
    undo.stop();
    // Handy: die neue Auswahl öffnet die Eigenschaften
    select({ devices: [device.id] });
  }

  function placeUnplaced(id: string, at?: StagePt, chosenLayer?: string) {
    const device = byId.get(id);
    if (!device) return;
    const pos = at ?? viewCenter();
    // wie neue Objekte: auf die aktive Ebene (sonst landet es evtl. auf einer ausgeblendeten oder tieferen Ebene)
    const targetLayer = chosenLayer ?? layerId ?? device.layerId;
    if (isMulticore(templates.get(device.templateId))) {
      updateDevices(doc, [{ id, patch: { layerId: targetLayer, stagePlan: { position: pos, rotationDeg: 0, endB: { x: pos.x + 5000, y: pos.y }, waypoints: [] } } }], undo.origin);
      undo.stop();
      select({ devices: [id] });
      return;
    }
    const placed = { ...device, stagePlan: { position: pos, rotationDeg: 0 } };
    updateDevices(doc, withStandLayout([{ id, patch: { layerId: targetLayer, ...dropPatch(placed, templates.get(device.templateId), pos, false) } }]), undo.origin);
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
    { key: 'placed', label: s.panels.placed },
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
        {panel === 'library' && <LibrarySidebar mode="stageplan" library={library} editable={editable} onAdd={(t) => requestInsert({ template: t })} />}
        {panel === 'placed' && (
          <PlacedPanel
            devices={data.devices}
            cables={data.cables}
            people={data.people}
            layers={data.layers}
            library={library}
            selected={new Set(selection.devices)}
            onOpen={(id) => {
              select({ devices: [id] });
              const item = items.find((i) => i.device.id === id);
              if (item) focus({ x: item.x, y: item.y });
            }}
          />
        )}
        {panel === 'unplaced' && <UnplacedPanel devices={data.devices} cables={data.cables} people={data.people} library={library} editable={editable} onPlace={(id) => requestInsert({ deviceId: id })} />}
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
      <InMobileMenu title={texts.mobile.tools}>
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
        <span className="ml-2 flex items-center gap-2 text-xs" role="group" aria-label={s.showTexts}>
          <span className="text-slate-500">{s.showTexts}:</span>
          {(
            [
              ['labels', s.textLabels],
              ['people', s.textPeople],
              ['meters', s.textMeters],
              ['cableNames', s.textCableNames],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-1">
              <input type="checkbox" checked={stageDisplay[key]} onChange={(e) => setStageDisplay({ [key]: e.target.checked })} />
              {label}
            </label>
          ))}
        </span>
        <span className="ml-2">
          <CanvasThemeSwitch value={stageDisplay.canvasTheme} onChange={(canvasTheme) => setStageDisplay({ canvasTheme })} />
        </span>
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
      </InMobileMenu>
      <InMobileMenu title={texts.mobile.display}>
        <FilterBar library={library} data={data} />
      </InMobileMenu>
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
            texts={stageDisplay}
            theme={stageDisplay.canvasTheme}
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
              if (t) requestInsert({ template: t, at });
            }}
            onDropUnplaced={(id, at) => requestInsert({ deviceId: id, at })}
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
          <BottomSheet
            title={mobilePanel === 'side' ? texts.mobile.add : mobilePanel === 'checks' ? texts.mobile.checks : texts.mobile.properties}
            onClose={() => setMobilePanel('none')}
          >
            {mobilePanel === 'side' ? side : mobilePanel === 'checks' ? <ChecksPanel issues={issues} onJump={jump} defaultOpen /> : properties}
          </BottomSheet>
        )}
      </div>
      {narrow ? (
        <MobileFooter>
          {editable && <FooterButton label={texts.signalflow.undo} short={texts.mobile.short.undo} icon={Undo2} onClick={undo.undo} disabled={!undo.canUndo} />}
          {editable && <FooterButton label={texts.signalflow.redo} short={texts.mobile.short.redo} icon={Redo2} onClick={undo.redo} disabled={!undo.canRedo} />}
          <FooterButton label={texts.mobile.add} short={texts.mobile.short.add} icon={Plus} active={mobilePanel === 'side'} onClick={() => setMobilePanel(mobilePanel === 'side' ? 'none' : 'side')} />
          <FooterButton label={texts.mobile.fit} short={texts.mobile.short.fit} icon={Maximize} onClick={fit} />
          <FooterButton label={texts.mobile.checks} short={texts.mobile.short.checks} icon={ListChecks} active={mobilePanel === 'checks'} onClick={() => setMobilePanel(mobilePanel === 'checks' ? 'none' : 'checks')} badge={<IssueBadge issues={issues} />} />
          <FooterButton
            label={texts.mobile.properties}
            short={texts.mobile.short.properties}
            icon={Info}
            active={mobilePanel === 'properties'}
            onClick={() => setMobilePanel(mobilePanel === 'properties' ? 'none' : 'properties')}
            badge={count + selection.cables.length > 0 ? <CountBadge count={count + selection.cables.length} /> : undefined}
          />
        </MobileFooter>
      ) : (
        <ChecksPanel issues={issues} onJump={jump} />
      )}
      {pendingInsert && (
        <LayerChoiceDialog
          layers={data.layers}
          initial={layerId}
          title={pendingInsert.template?.name ?? byId.get(pendingInsert.deviceId ?? '')?.label ?? ''}
          onCancel={() => setPendingInsert(null)}
          onChoose={(target) => {
            const request = pendingInsert;
            setPendingInsert(null);
            insertOn(request, target);
          }}
        />
      )}
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

/** Auf welche Ebene soll eingefügt werden? (oben in der Liste = oben im Plan; gesperrte Ebenen nicht wählbar) */
function LayerChoiceDialog({ layers, initial, title, onCancel, onChoose }: { layers: Layer[]; initial: string | undefined; title: string; onCancel: () => void; onChoose: (layerId: string) => void }) {
  const t = texts.stageplan;
  const sorted = [...layers].sort((a, b) => b.order - a.order);
  const firstFree = sorted.find((l) => !l.locked)?.id;
  const [choice, setChoice] = useState(sorted.some((l) => l.id === initial && !l.locked) ? initial! : (firstFree ?? ''));
  return (
    <Modal title={t.chooseLayerTitle} onClose={onCancel}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (choice) onChoose(choice);
        }}
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">{t.chooseLayerText(title)}</p>
        <div className="space-y-1" role="radiogroup" aria-label={t.chooseLayerTitle}>
          {sorted.map((layer) => (
            <label key={layer.id} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${choice === layer.id ? 'border-sky-300 bg-sky-50 dark:border-sky-700 dark:bg-sky-950' : 'border-slate-200 dark:border-slate-700'} ${layer.locked ? 'opacity-50' : ''}`}>
              <input type="radio" name="insert-layer" value={layer.id} checked={choice === layer.id} disabled={layer.locked} onChange={() => setChoice(layer.id)} />
              <span className="flex-1">{layer.name}</span>
              {!layer.visible && <span className="text-xs text-slate-500">{t.layerHiddenNote}</span>}
              {layer.locked && <span className="text-xs text-slate-500">{t.layerLockedNote}</span>}
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel}>{texts.common.cancel}</Button>
          <Button type="submit" variant="primary" disabled={!choice}>
            {t.insertHere}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
