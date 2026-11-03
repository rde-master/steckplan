// Signalfluss-Ansicht: Seitenleiste (Bibliothek), Zeichenfläche, Eigenschaften, Prüfungen.
import { useEffect, useMemo, useState } from 'react';
import type * as Y from 'yjs';
import {
  addCable,
  addDevice,
  assignGroup,
  autoCableType,
  createGroup,
  crossPageRefs,
  devicePageId,
  mixerNetworkRows,
  powerNotes,
  stageboxInputInfo,
  duplicateDevices,
  isMulticore,
  removeCables,
  removeDevices,
  updateDevices,
  updateSettings,
  defectKey,
  setDefect,
  type DeviceInstance,
  type Issue,
  type Library,
  type Template,
} from '@steckplan/core';
import { CanvasThemeSwitch } from '../CanvasThemeSwitch';
import { DeviceList } from '../DeviceList';
import { useEditor } from '../../lib/editor';
import type { UndoApi } from '../../lib/undo';
import { useIssues } from '../../lib/useIssues';
import { useIsNarrow } from '../../lib/useProjectDoc';
import type { ProjectData } from '../../lib/useProjectData';
import { texts } from '../../texts';
import { Banner, Button } from '../ui';
import { CableTypeChooser, type CableChoice } from './CableTypeChooser';
import { FilterBar } from '../FilterBar';
import { FlowPagesBar } from './FlowPages';
import { ChecksPanel } from './ChecksPanel';
import { LibrarySidebar } from './LibrarySidebar';
import { Minimap } from './Minimap';
import { bounds, buildBoxes, buildCableLines, buildGroupFrames } from './model';
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
  // Seiten: nur die Geräte der aktuellen Seite zeigen
  const flowPage = useEditor((st) => st.flowPage);
  const setFlowPage = useEditor((st) => st.setFlowPage);
  const pages = data.flowPages;
  const currentPage = pages.some((p) => p.id === flowPage) ? flowPage : (pages[0]?.id ?? '');
  const pageDevices = useMemo(() => data.devices.filter((d) => devicePageId(d, pages) === currentPage), [data.devices, pages, currentPage]);
  const pageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of data.devices) if (d.signalFlow) counts.set(devicePageId(d, pages), (counts.get(devicePageId(d, pages)) ?? 0) + 1);
    return counts;
  }, [data.devices, pages]);
  const pageRefs = useMemo(() => crossPageRefs(data.devices, data.cables, pages).filter((r) => pageDevices.some((d) => d.id === r.deviceId)), [data.devices, data.cables, pages, pageDevices]);
  const display = useEditor((st) => st.display);
  const setDisplay = useEditor((st) => st.setDisplay);
  const stageboxInfo = useMemo(() => (library && display.channelsOnBoxes ? stageboxInputInfo(data, library) : undefined), [data, library, display.channelsOnBoxes]);
  const mixerRows = useMemo(() => (library && display.channelsOnBoxes ? mixerNetworkRows(data, library) : undefined), [data, library, display.channelsOnBoxes]);
  const power = useMemo(() => (library && display.powerOnBoxes ? powerNotes(data, library) : undefined), [data, library, display.powerOnBoxes]);
  const boxes = useMemo(
    () =>
      buildBoxes(pageDevices, library, showStageObjects, {
        colorMode,
        filter,
        people: data.people,
        showPeople: display.peopleOnBoxes,
        showOwner: display.ownerOnBoxes,
        ...(power ? { power } : {}),
        ...(stageboxInfo ? { stageboxInfo } : {}),
        ...(mixerRows ? { mixerRows } : {}),
      }),
    [pageDevices, library, showStageObjects, colorMode, filter, data.people, display.peopleOnBoxes, display.ownerOnBoxes, stageboxInfo, mixerRows, power],
  );
  const groupFrames = useMemo(() => buildGroupFrames(data.groups, boxes), [data.groups, boxes]);
  const cableStyle = data.settings.cableStyle ?? 'square';
  const lines = useMemo(() => buildCableLines(data.cables, boxes, library, issues, filter, cableStyle), [data.cables, boxes, library, issues, filter, cableStyle]);
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
    const device = addDevice(doc, template, position, undo.origin, currentPage ? { pageId: currentPage } : {});
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
              ...(choice.template.defaultCaseId ? { caseId: choice.template.defaultCaseId } : {}),
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

  // Gruppen: Auswahl gruppieren bzw. aus der Gruppe lösen
  function group() {
    if (!editable || selection.devices.length === 0) return;
    createGroup(doc, selection.devices, undo.origin);
    undo.stop();
  }
  function ungroup() {
    if (!editable || selection.devices.length === 0) return;
    assignGroup(doc, selection.devices, undefined, undo.origin);
    undo.stop();
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

  const flowOf = (id: string): DeviceInstance['signalFlow'] => data.devices.find((d) => d.id === id)?.signalFlow;

  function move(moves: { id: string; x: number; y: number }[], final: boolean) {
    // Seite und Größe bleiben erhalten
    updateDevices(doc, moves.map((m) => ({ id: m.id, patch: { signalFlow: { ...flowOf(m.id), position: { x: m.x, y: m.y } } } })), undo.origin);
    if (final) undo.stop();
  }

  function toggleDefect(deviceId: string, portId: string) {
    const device = data.devices.find((d) => d.id === deviceId);
    if (!device) return;
    const key = defectKey(templates.get(device.templateId), portId);
    const marked = device.defectivePorts?.some((d) => d.portId === key);
    updateDevices(doc, [{ id: deviceId, patch: { defectivePorts: setDefect(device, key, marked ? false : {}) } }], undo.origin);
    undo.stop();
  }

  function resize(id: string, size: { width: number; height: number } | undefined, final: boolean) {
    const current = flowOf(id);
    const box = boxes.find((b) => b.device.id === id);
    if (!box) return;
    const { width: _w, height: _h, ...rest } = current ?? { position: { x: box.x, y: box.y } };
    updateDevices(doc, [{ id, patch: { signalFlow: { ...rest, position: rest.position ?? { x: box.x, y: box.y }, ...(size ?? {}) } } }], undo.origin);
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

  /** Zu einem Gerät springen – bei Bedarf auf seine Seite wechseln */
  function jumpToDevice(deviceId: string, extra: { devices?: string[]; cables?: string[] } = {}) {
    const device = data.devices.find((d) => d.id === deviceId);
    const page = device ? devicePageId(device, pages) : currentPage;
    if (page !== currentPage) setFlowPage(page);
    select({ devices: extra.devices ?? [deviceId], cables: extra.cables ?? [] });
    const box = boxes.find((b) => b.device.id === deviceId);
    const pos = box ? { x: box.x + box.layout.width / 2, y: box.y + box.layout.height / 2 } : device?.signalFlow ? { x: device.signalFlow.position.x + 90, y: device.signalFlow.position.y + 40 } : null;
    if (pos) focus(pos);
  }

  function jump(issue: Issue) {
    const deviceIds = issue.objectIds.filter((id) => data.devices.some((d) => d.id === id));
    const cableIds = issue.objectIds.filter((id) => data.cables.some((c) => c.id === id));
    const cable = data.cables.find((c) => cableIds.includes(c.id));
    const targetId = deviceIds[0] ?? cable?.from.deviceId;
    if (targetId) jumpToDevice(targetId, { devices: deviceIds, cables: cableIds });
    else select({ devices: deviceIds, cables: cableIds });
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
      } else if (editable && mod && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) ungroup();
        else group();
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

  const pageName = new Map(pages.map((p) => [p.id, p.name]));
  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-2 gap-1 border-b border-slate-200 p-1 dark:border-slate-700" role="tablist" aria-label={texts.stageplan.panels.library}>
        {(['library', 'used'] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={display.sidebar === key}
            onClick={() => setDisplay({ sidebar: key })}
            className={`rounded px-2 py-1 text-xs ${display.sidebar === key ? 'bg-sky-600 text-white' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}`}
          >
            {key === 'library' ? texts.stageplan.panels.library : texts.stageplan.panels.placed}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {display.sidebar === 'used' ? (
          <DeviceList
            devices={data.devices}
            cables={data.cables}
            people={data.people}
            library={library}
            testId="flow-used"
            include={(_, t) => !t || t.kind === 'device' || isMulticore(t) || (showStageObjects && ['stageElement', 'truss', 'stand'].includes(t.kind))}
            hint={texts.stageplan.flowUsedHint}
            empty={<p className="px-1 text-sm text-slate-500">{texts.stageplan.flowUsedEmpty}</p>}
            detail={(d) => (pages.length > 1 ? `${texts.stageplan.pageLabel}: ${pageName.get(devicePageId(d, pages)) ?? '–'}` : undefined)}
            selected={new Set(selection.devices)}
            onOpen={(id) => jumpToDevice(id)}
          />
        ) : (
          <LibrarySidebar library={library} editable={editable} onAdd={(t) => add(t)} />
        )}
      </div>
    </div>
  );
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
        onGroup={group}
        onUngroup={ungroup}
        canUngroup={data.devices.some((d) => selection.devices.includes(d.id) && d.groupId)}
        onAlign={align}
        onZoom={zoomBy}
        onFit={fit}
        zoom={view.zoom}
      />
      <FilterBar
        library={library}
        data={data}
        extra={
          <span className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300" role="group" aria-label={s.showOnBoxes}>
            <span className="text-slate-500">{s.showOnBoxes}:</span>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={display.ownerOnBoxes} onChange={(e) => setDisplay({ ownerOnBoxes: e.target.checked })} />
              {s.showOwner}
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={display.peopleOnBoxes} onChange={(e) => setDisplay({ peopleOnBoxes: e.target.checked })} />
              {s.showPeople}
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={display.channelsOnBoxes} onChange={(e) => setDisplay({ channelsOnBoxes: e.target.checked })} />
              {s.showChannels}
            </label>
            <label className="flex items-center gap-1" title={s.showPowerTitle}>
              <input type="checkbox" checked={display.powerOnBoxes} onChange={(e) => setDisplay({ powerOnBoxes: e.target.checked })} />
              {s.showPower}
            </label>
            <span className="ml-2 text-slate-500">{s.cableStyle}:</span>
            <span className="flex overflow-hidden rounded border border-slate-300 dark:border-slate-600" role="radiogroup" aria-label={s.cableStyle}>
              {(['square', 'curved'] as const).map((style) => (
                <button
                  key={style}
                  type="button"
                  role="radio"
                  aria-checked={cableStyle === style}
                  disabled={!editable}
                  title={editable ? undefined : s.cableStyleReadOnly}
                  onClick={() => updateSettings(doc, { cableStyle: style === 'square' ? undefined : style }, undo.origin)}
                  className={`px-2 py-0.5 ${cableStyle === style ? 'bg-sky-600 text-white' : ''}`}
                >
                  {s.cableStyles[style]}
                </button>
              ))}
            </span>
            <span className="ml-2">
              <CanvasThemeSwitch value={display.canvasTheme} onChange={(canvasTheme) => setDisplay({ canvasTheme })} />
            </span>
          </span>
        }
      />
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
      <FlowPagesBar doc={doc} origin={undo.origin} pages={pages} current={currentPage} counts={pageCounts} editable={editable} onSelect={setFlowPage} />
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
            groups={groupFrames}
            pageRefs={pageRefs}
            onPageRef={(ref) => jumpToDevice(ref.targetDeviceId)}
            onResize={resize}
            onToggleDefect={toggleDefect}
            theme={display.canvasTheme}
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
