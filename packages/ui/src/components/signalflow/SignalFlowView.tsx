// Signalfluss-Ansicht: Seitenleiste (Bibliothek), Zeichenfläche, Eigenschaften, Prüfungen.
import { useEffect, useMemo, useState } from 'react';
import type * as Y from 'yjs';
import {
  addCable,
  addDevice,
  autoCableType,
  duplicateDevices,
  isMulticore,
  removeCables,
  removeDevices,
  updateDevices,
  type Issue,
  type Library,
  type Template,
} from '@steckplan/core';
import { useEditor } from '../../lib/editor';
import type { UndoApi } from '../../lib/undo';
import { useIssues } from '../../lib/useIssues';
import { useIsNarrow } from '../../lib/useProjectDoc';
import type { ProjectData } from '../../lib/useProjectData';
import { texts } from '../../texts';
import { Banner, Button } from '../ui';
import { CableTypeChooser, type CableChoice } from './CableTypeChooser';
import { FilterBar } from '../FilterBar';
import { ChecksPanel } from './ChecksPanel';
import { LibrarySidebar } from './LibrarySidebar';
import { Minimap } from './Minimap';
import { bounds, buildBoxes, buildCableLines } from './model';
import { PropertiesPanel } from './PropertiesPanel';
import { SignalFlowCanvas, type PortRef } from './SignalFlowCanvas';
import { Toolbar, type AlignMode } from './Toolbar';

const s = texts.signalflow;

export function SignalFlowView({ doc, data, library, editable, undo }: { doc: Y.Doc; data: ProjectData; library: Library | null; editable: boolean; undo: UndoApi }) {
  const view = useEditor((st) => st.view);
  const setView = useEditor((st) => st.setView);
  const selection = useEditor((st) => st.selection);
  const select = useEditor((st) => st.select);
  const clearSelection = useEditor((st) => st.clearSelection);
  const focus = useEditor((st) => st.focus);
  const showStageObjects = useEditor((st) => st.showStageObjects);
  const filter = useEditor((st) => st.filter);
  const colorMode = useEditor((st) => st.colorMode);
  const showDmx = useEditor((st) => st.showDmx);
  const narrow = useIsNarrow(900);
  const [panel, setPanel] = useState<'none' | 'library' | 'properties'>('none');
  const [pending, setPending] = useState<{ from: PortRef; to: PortRef } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ width: 800, height: 600 });

  const issues = useIssues(data, library);
  const boxes = useMemo(() => buildBoxes(data.devices, library, showStageObjects, { colorMode, filter }), [data.devices, library, showStageObjects, colorMode, filter]);
  const lines = useMemo(() => buildCableLines(data.cables, boxes, library, issues, filter), [data.cables, boxes, library, issues, filter]);
  const occupied = useMemo(() => new Set(data.cables.flatMap((c) => [`${c.from.deviceId}/${c.from.portId}`, `${c.to.deviceId}/${c.to.portId}`])), [data.cables]);
  const templates = useMemo(() => new Map((library?.templates ?? []).map((t) => [t.id, t])), [library]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  // Auswahl bereinigen, wenn Objekte (auch von anderen) gelöscht wurden
  useEffect(() => {
    const devices = selection.devices.filter((id) => data.devices.some((d) => d.id === id));
    const cables = selection.cables.filter((id) => data.cables.some((c) => c.id === id));
    if (devices.length !== selection.devices.length || cables.length !== selection.cables.length) select({ devices, cables });
  }, [data, selection, select]);

  function viewCenter(): { x: number; y: number } {
    return { x: (viewport.width / 2 - view.x) / view.zoom - 80, y: (viewport.height / 2 - view.y) / view.zoom - 40 };
  }

  // Langes Drücken auf ein Objekt: auf schmalen Bildschirmen die Eigenschaften (mit allen Aktionen) öffnen
  useEffect(
    () =>
      useEditor.subscribe((st, prev) => {
        const count = st.selection.devices.length + st.selection.cables.length;
        if (narrow && st.propertiesRequest !== prev.propertiesRequest && count > 0) setPanel('properties');
      }),
    [narrow],
  );

  function add(template: Template, at?: { x: number; y: number }) {
    if (!editable) return;
    const position = at ?? viewCenter();
    const device = addDevice(doc, template, position, undo.origin);
    undo.stop();
    select({ devices: [device.id] });
    if (narrow) setPanel('none');
  }

  function createCable(from: PortRef, to: PortRef, choice: CableChoice) {
    const cable = addCable(
      doc,
      {
        from: { deviceId: from.deviceId, portId: from.portId },
        to: { deviceId: to.deviceId, portId: to.portId },
        ...(choice.kind === 'type'
          ? {
              templateId: choice.template.id,
              ...(choice.template.defaultOwnerId ? { ownerId: choice.template.defaultOwnerId } : {}),
              ...(choice.template.defaultTrailerId ? { trailerId: choice.template.defaultTrailerId } : {}),
            }
          : choice.kind === 'direct'
            ? { direct: true }
            : {}),
      },
      undo.origin,
    );
    undo.stop();
    select({ cables: [cable.id] });
  }

  function connect(from: PortRef, to: PortRef) {
    if (!library) return;
    const fromMulticore = isMulticore(templates.get(data.devices.find((d) => d.id === from.deviceId)?.templateId ?? ''));
    const toMulticore = isMulticore(templates.get(data.devices.find((d) => d.id === to.deviceId)?.templateId ?? ''));
    const auto = !fromMulticore && !toMulticore ? autoCableType(library, from.port, to.port) : undefined;
    if (auto) createCable(from, to, { kind: 'type', template: auto });
    else setPending({ from, to });
  }

  function deleteSelection() {
    if (!editable) return;
    removeDevices(doc, selection.devices, undo.origin);
    removeCables(doc, selection.cables, undo.origin);
    undo.stop();
    clearSelection();
  }

  function duplicate() {
    if (!editable || selection.devices.length === 0) return;
    const ids = duplicateDevices(doc, selection.devices, { x: 30, y: 30 }, undo.origin);
    undo.stop();
    select({ devices: ids });
  }

  function align(mode: AlignMode) {
    const sel = boxes.filter((b) => selection.devices.includes(b.device.id));
    if (sel.length < 2) return;
    const minX = Math.min(...sel.map((b) => b.x));
    const maxX = Math.max(...sel.map((b) => b.x + b.layout.width));
    const minY = Math.min(...sel.map((b) => b.y));
    const maxY = Math.max(...sel.map((b) => b.y + b.layout.height));
    let moves: { id: string; x: number; y: number }[];
    if (mode === 'distributeH' || mode === 'distributeV') {
      const horizontal = mode === 'distributeH';
      const sorted = [...sel].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y));
      const total = sorted.reduce((sum, b) => sum + (horizontal ? b.layout.width : b.layout.height), 0);
      const gap = ((horizontal ? maxX - minX : maxY - minY) - total) / (sorted.length - 1);
      let cursor = horizontal ? minX : minY;
      moves = sorted.map((b) => {
        const move = horizontal ? { id: b.device.id, x: Math.round(cursor), y: b.y } : { id: b.device.id, x: b.x, y: Math.round(cursor) };
        cursor += (horizontal ? b.layout.width : b.layout.height) + gap;
        return move;
      });
    } else {
      moves = sel.map((b) => {
        const w = b.layout.width;
        const h = b.layout.height;
        switch (mode) {
          case 'left':
            return { id: b.device.id, x: minX, y: b.y };
          case 'right':
            return { id: b.device.id, x: maxX - w, y: b.y };
          case 'center':
            return { id: b.device.id, x: Math.round((minX + maxX) / 2 - w / 2), y: b.y };
          case 'top':
            return { id: b.device.id, x: b.x, y: minY };
          case 'bottom':
            return { id: b.device.id, x: b.x, y: maxY - h };
          default:
            return { id: b.device.id, x: b.x, y: Math.round((minY + maxY) / 2 - h / 2) };
        }
      });
    }
    move(moves, true);
  }

  function move(moves: { id: string; x: number; y: number }[], final: boolean) {
    updateDevices(doc, moves.map((m) => ({ id: m.id, patch: { signalFlow: { position: { x: m.x, y: m.y } } } })), undo.origin);
    if (final) undo.stop();
  }

  function fit() {
    const area = bounds(boxes);
    if (!area) {
      setView({ x: 40, y: 40, zoom: 1 });
      return;
    }
    const zoom = Math.min(1.5, Math.max(0.15, Math.min((viewport.width - 80) / area.width, (viewport.height - 80) / area.height)));
    setView({ zoom, x: (viewport.width - area.width * zoom) / 2 - area.x * zoom, y: (viewport.height - area.height * zoom) / 2 - area.y * zoom });
  }

  function zoomBy(factor: number) {
    const zoom = Math.min(3, Math.max(0.15, view.zoom * factor));
    const cx = viewport.width / 2;
    const cy = viewport.height / 2;
    setView({ zoom, x: cx - ((cx - view.x) / view.zoom) * zoom, y: cy - ((cy - view.y) / view.zoom) * zoom });
  }

  function jump(issue: Issue) {
    const deviceIds = issue.objectIds.filter((id) => data.devices.some((d) => d.id === id));
    const cableIds = issue.objectIds.filter((id) => data.cables.some((c) => c.id === id));
    select({ devices: deviceIds, cables: cableIds });
    const cable = data.cables.find((c) => cableIds.includes(c.id));
    const targetId = deviceIds[0] ?? cable?.from.deviceId;
    const box = boxes.find((b) => b.device.id === targetId);
    if (box) focus({ x: box.x + box.layout.width / 2, y: box.y + box.layout.height / 2 });
  }

  // Tastenkürzel
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"], dialog')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (editable && (e.key === 'Delete' || e.key === 'Backspace')) {
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
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        select({ devices: boxes.map((b) => b.device.id), cables: data.cables.map((c) => c.id) });
      } else if (e.key === 'Escape') {
        clearSelection();
      } else if (editable && e.key.startsWith('Arrow') && selection.devices.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        move(boxes.filter((b) => selection.devices.includes(b.device.id)).map((b) => ({ id: b.device.id, x: b.x + dx, y: b.y + dy })), true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const selectionCount = selection.devices.length + selection.cables.length;
  const pendingFromMulticore =
    pending !== null &&
    [pending.from.deviceId, pending.to.deviceId].some((id) => isMulticore(templates.get(data.devices.find((d) => d.id === id)?.templateId ?? '')));

  const sidebar = <LibrarySidebar library={library} editable={editable} onAdd={(t) => add(t)} />;
  const properties = <PropertiesPanel doc={doc} origin={undo.origin} library={library} data={data} selection={selection} issues={issues} editable={editable} />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar
        undo={undo}
        editable={editable}
        selectionCount={selectionCount}
        deviceCount={selection.devices.length}
        onDelete={deleteSelection}
        onDuplicate={duplicate}
        onAlign={align}
        onZoom={zoomBy}
        onFit={fit}
        zoom={view.zoom}
      />
      <FilterBar library={library} data={data} />
      {narrow && (
        <div className="flex gap-1 border-b border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900">
          <Button variant={panel === 'library' ? 'primary' : 'ghost'} onClick={() => setPanel(panel === 'library' ? 'none' : 'library')}>
            {s.library}
          </Button>
          <Button variant={panel === 'properties' ? 'primary' : 'ghost'} onClick={() => setPanel(panel === 'properties' ? 'none' : 'properties')}>
            {s.properties}
            {selectionCount > 0 ? ` (${selectionCount})` : ''}
          </Button>
        </div>
      )}
      <div className="relative flex min-h-0 flex-1">
        {!narrow && <div className="w-60 shrink-0 border-r border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">{sidebar}</div>}
        <div
          className="relative min-w-0 flex-1"
          ref={(el) => {
            if (el && (el.clientWidth !== viewport.width || el.clientHeight !== viewport.height)) setViewport({ width: el.clientWidth, height: el.clientHeight });
          }}
        >
          <SignalFlowCanvas
            boxes={boxes}
            lines={lines}
            editable={editable}
            occupied={occupied}
            onMove={move}
            onConnect={connect}
            onDropTemplate={(id, at) => {
              const template = templates.get(id);
              if (template) add(template, at);
            }}
            onInvalidConnection={setMessage}
            showDmx={showDmx}
          />
          <Minimap boxes={boxes} viewport={viewport} />
          {message && (
            <div className="absolute top-3 left-1/2 w-[min(28rem,90%)] -translate-x-1/2">
              <Banner tone="warn">{message}</Banner>
            </div>
          )}
        </div>
        {!narrow && <div className="w-72 shrink-0 border-l border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">{properties}</div>}
        {narrow && panel !== 'none' && (
          <div className="absolute inset-y-0 left-0 z-10 w-[min(20rem,90%)] border-r border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
            {panel === 'library' ? sidebar : properties}
          </div>
        )}
      </div>
      <ChecksPanel issues={issues} onJump={jump} />
      {pending && library && (
        <CableTypeChooser
          library={library}
          from={pending.from.port}
          to={pending.to.port}
          suggestDirect={pendingFromMulticore}
          onCancel={() => setPending(null)}
          onChoose={(choice) => {
            createCable(pending.from, pending.to, choice);
            setPending(null);
          }}
        />
      )}
    </div>
  );
}
