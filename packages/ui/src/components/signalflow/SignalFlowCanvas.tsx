// Signalfluss-Ansicht: frei platzierbare Kästen, Anschlüsse, Kabel ziehen (Konva).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Group, Layer, Line, Rect, Stage, Text } from 'react-konva';
import type Konva from 'konva';
import { orientConnection, type EffectivePort } from '@steckplan/core';
import { useEditor } from '../../lib/editor';
import { DIMMED_OPACITY } from '../../lib/display';
import { anchorOf, bounds, ROLE_COLORS, type CableLine, type DeviceBox } from './model';

export interface PortRef {
  deviceId: string;
  portId: string;
  port: EffectivePort;
}

export interface CanvasProps {
  boxes: DeviceBox[];
  lines: CableLine[];
  editable: boolean;
  occupied: Set<string>;
  onMove: (moves: { id: string; x: number; y: number }[], final: boolean) => void;
  onConnect: (from: PortRef, to: PortRef) => void;
  onDropTemplate: (templateId: string, at: { x: number; y: number }) => void;
  onInvalidConnection: (message: string) => void;
  showDmx?: boolean;
}

const GRID = 10;
const snap = (v: number) => Math.round(v / GRID) * GRID;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3;

declare global {
  interface Window {
    __steckplanStage?: Konva.Stage | null;
  }
}

export function SignalFlowCanvas({ boxes, lines, editable, occupied, onMove, onConnect, onDropTemplate, onInvalidConnection, showDmx = false }: CanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const view = useEditor((s) => s.view);
  const setView = useEditor((s) => s.setView);
  const selection = useEditor((s) => s.selection);
  const select = useEditor((s) => s.select);
  const toggleDevice = useEditor((s) => s.toggleDevice);
  const toggleCable = useEditor((s) => s.toggleCable);
  const clearSelection = useEditor((s) => s.clearSelection);
  const focusRequest = useEditor((s) => s.focusRequest);
  const [connecting, setConnecting] = useState<{ from: PortRef; pointer: { x: number; y: number } } | null>(null);
  const [band, setBand] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const dragStart = useRef<{ id: string; x: number; y: number; others: { id: string; x: number; y: number }[] } | null>(null);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const selectedDevices = useMemo(() => new Set(selection.devices), [selection.devices]);
  const selectedCables = useMemo(() => new Set(selection.cables), [selection.cables]);
  const boxById = useMemo(() => new Map(boxes.map((b) => [b.device.id, b])), [boxes]);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: Math.max(100, entry.contentRect.width), height: Math.max(100, entry.contentRect.height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    window.__steckplanStage = stageRef.current;
    return () => {
      window.__steckplanStage = null;
    };
  }, []);

  // Stelle in die Mitte holen (Prüfungen-Panel, Minikarte)
  useEffect(() => {
    if (!focusRequest) return;
    const { zoom } = useEditor.getState().view;
    setView({ zoom, x: size.width / 2 - focusRequest.x * zoom, y: size.height / 2 - focusRequest.y * zoom });
  }, [focusRequest, size.width, size.height, setView]);

  function toWorld(client: { x: number; y: number }): { x: number; y: number } {
    const rect = container.current!.getBoundingClientRect();
    return { x: (client.x - rect.left - view.x) / view.zoom, y: (client.y - rect.top - view.y) / view.zoom };
  }

  function pointerWorld(): { x: number; y: number } | null {
    const stage = stageRef.current;
    const pos = stage?.getPointerPosition();
    if (!pos) return null;
    return { x: (pos.x - view.x) / view.zoom, y: (pos.y - view.y) / view.zoom };
  }

  function zoomAt(point: { x: number; y: number }, nextZoom: number) {
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
    const worldX = (point.x - view.x) / view.zoom;
    const worldY = (point.y - view.y) / view.zoom;
    setView({ zoom, x: point.x - worldX * zoom, y: point.y - worldY * zoom });
  }

  function handleWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    if (e.evt.ctrlKey || e.evt.metaKey) {
      const pos = stage.getPointerPosition() ?? { x: size.width / 2, y: size.height / 2 };
      zoomAt(pos, view.zoom * Math.exp(-e.evt.deltaY * 0.0025));
    } else {
      setView({ ...view, x: view.x - e.evt.deltaX, y: view.y - e.evt.deltaY });
    }
  }

  // ---------- Verbinden ----------

  function portRefAt(target: Konva.Node | null): PortRef | null {
    if (!target || target.name() !== 'port') return null;
    const deviceId = target.getAttr('deviceId') as string;
    const portId = target.getAttr('portId') as string;
    const port = boxById.get(deviceId)?.layout.anchors.find((a) => a.port.id === portId)?.port;
    return port ? { deviceId, portId, port } : null;
  }

  function startConnect(ref: PortRef, e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (!editable) return;
    e.cancelBubble = true;
    const box = boxById.get(ref.deviceId);
    const anchor = box && anchorOf(box, ref.portId);
    if (anchor) setConnecting({ from: ref, pointer: { x: anchor.x, y: anchor.y } });
  }

  function finishConnect() {
    if (!connecting) return;
    const stage = stageRef.current;
    const pos = stage?.getPointerPosition();
    const target = pos ? stage!.getIntersection(pos) : null;
    const ref = portRefAt(target);
    const from = connecting.from;
    setConnecting(null);
    if (!ref || (ref.deviceId === from.deviceId && ref.portId === from.portId)) return;
    const oriented = orientConnection(from, ref);
    if (!oriented) {
      onInvalidConnection(
        from.port.role === 'in'
          ? 'Ein Eingang kann nur mit einem Ausgang verbunden werden.'
          : 'Ein Ausgang kann nur mit einem Eingang verbunden werden.',
      );
      return;
    }
    onConnect(oriented.from, oriented.to);
  }

  function candidateState(deviceId: string, port: EffectivePort): 'ok' | 'invalid' | null {
    if (!connecting) return null;
    if (deviceId === connecting.from.deviceId && port.id === connecting.from.portId) return null;
    return orientConnection(connecting.from, { deviceId, portId: port.id, port }) ? 'ok' : 'invalid';
  }

  // ---------- Hintergrund: Verschieben, Auswahlrahmen ----------

  function handleStageDown(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (e.target !== stageRef.current) return;
    const shift = 'shiftKey' in e.evt && e.evt.shiftKey;
    if (shift) {
      const p = pointerWorld();
      if (p) setBand({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
    }
  }

  function handleStageMove() {
    const p = pointerWorld();
    if (!p) return;
    if (connecting) setConnecting({ ...connecting, pointer: p });
    if (band) setBand({ ...band, x2: p.x, y2: p.y });
  }

  function handleStageUp(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (connecting) finishConnect();
    if (band) {
      const x1 = Math.min(band.x1, band.x2);
      const x2 = Math.max(band.x1, band.x2);
      const y1 = Math.min(band.y1, band.y2);
      const y2 = Math.max(band.y1, band.y2);
      const inside = boxes.filter((b) => b.x >= x1 && b.y >= y1 && b.x + b.layout.width <= x2 && b.y + b.layout.height <= y2).map((b) => b.device.id);
      select({ devices: inside }, true);
      setBand(null);
      return;
    }
    if (e.target === stageRef.current && !stageMoved.current) clearSelection();
  }

  const stageMoved = useRef(false);

  // ---------- Touch: Zwei-Finger-Zoom ----------

  function handleTouchMove(e: Konva.KonvaEventObject<TouchEvent>) {
    const touches = e.evt.touches;
    if (touches.length !== 2) {
      handleStageMove();
      return;
    }
    e.evt.preventDefault();
    const [t1, t2] = [touches[0]!, touches[1]!];
    const distance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    const rect = container.current!.getBoundingClientRect();
    const center = { x: (t1.clientX + t2.clientX) / 2 - rect.left, y: (t1.clientY + t2.clientY) / 2 - rect.top };
    if (!pinch.current) pinch.current = { distance, zoom: view.zoom };
    zoomAt(center, pinch.current.zoom * (distance / pinch.current.distance));
  }

  // ---------- Kästen ziehen ----------

  function handleDragStart(box: DeviceBox) {
    const ids = selectedDevices.has(box.device.id) ? selection.devices : [box.device.id];
    if (!selectedDevices.has(box.device.id)) select({ devices: [box.device.id] });
    dragStart.current = {
      id: box.device.id,
      x: box.x,
      y: box.y,
      others: ids.filter((id) => id !== box.device.id).map((id) => ({ id, x: boxById.get(id)?.x ?? 0, y: boxById.get(id)?.y ?? 0 })),
    };
  }

  function handleDragMove(box: DeviceBox, node: Konva.Node, final: boolean) {
    const start = dragStart.current;
    if (!start) return;
    const x = final ? snap(node.x()) : node.x();
    const y = final ? snap(node.y()) : node.y();
    const dx = x - start.x;
    const dy = y - start.y;
    onMove([{ id: box.device.id, x, y }, ...start.others.map((o) => ({ id: o.id, x: final ? snap(o.x + dx) : o.x + dx, y: final ? snap(o.y + dy) : o.y + dy }))], final);
    if (final) {
      node.position({ x, y });
      dragStart.current = null;
    }
  }

  const area = bounds(boxes);

  return (
    <div
      ref={container}
      className="relative h-full w-full overflow-hidden bg-slate-100 dark:bg-slate-950"
      style={{
        backgroundImage: 'radial-gradient(circle, rgba(100,116,139,0.35) 1px, transparent 1px)',
        backgroundSize: `${20 * view.zoom}px ${20 * view.zoom}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
        touchAction: 'none',
      }}
      data-testid="signalflow-canvas"
      onDragOver={(e) => {
        if (editable && e.dataTransfer.types.includes('application/x-steckplan-template')) e.preventDefault();
      }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData('application/x-steckplan-template');
        if (!id || !editable) return;
        e.preventDefault();
        const p = toWorld({ x: e.clientX, y: e.clientY });
        onDropTemplate(id, { x: snap(p.x), y: snap(p.y) });
      }}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={view.x}
        y={view.y}
        scaleX={view.zoom}
        scaleY={view.zoom}
        draggable={!connecting && !band}
        onDragStart={(e) => {
          if (e.target === stageRef.current) stageMoved.current = true;
        }}
        onDragEnd={(e) => {
          if (e.target === stageRef.current) {
            setView({ ...view, x: e.target.x(), y: e.target.y() });
            setTimeout(() => (stageMoved.current = false), 0);
          }
        }}
        onWheel={handleWheel}
        onMouseDown={handleStageDown}
        onTouchStart={handleStageDown}
        onMouseMove={handleStageMove}
        onTouchMove={handleTouchMove}
        onMouseUp={handleStageUp}
        onTouchEnd={(e) => {
          pinch.current = null;
          handleStageUp(e);
        }}
      >
        <Layer>
          {/* Kabel */}
          {lines.map((line) => {
            const selected = selectedCables.has(line.cable.id);
            const stroke = line.issue === 'error' || line.issue === 'warning' ? '#dc2626' : line.color;
            return (
              <Line
                key={line.cable.id}
                name="cable"
                id={`cable-${line.cable.id}`}
                points={line.points}
                stroke={stroke}
                strokeWidth={selected ? 4 : 2}
                opacity={line.dimmed && !selected ? DIMMED_OPACITY : 1}
                dash={line.cable.direct ? [6, 4] : undefined}
                hitStrokeWidth={12}
                lineJoin="round"
                shadowColor={selected ? '#0ea5e9' : undefined}
                shadowBlur={selected ? 6 : 0}
                onClick={(e) => {
                  e.cancelBubble = true;
                  if (e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey) toggleCable(line.cable.id);
                  else select({ cables: [line.cable.id] });
                }}
                onTap={(e) => {
                  e.cancelBubble = true;
                  select({ cables: [line.cable.id] });
                }}
              />
            );
          })}

          {/* Kästen */}
          {boxes.map((box) => {
            const selected = selectedDevices.has(box.device.id);
            const { width, height } = box.layout;
            const radius = box.template?.shape?.form === 'rounded' || box.template?.shape?.form === 'circle' ? 12 : 4;
            const ends = box.multicore ? { a: box.template?.endALabel || 'A', b: box.template?.endBLabel || 'B' } : null;
            return (
              <Group
                key={box.device.id}
                id={`device-${box.device.id}`}
                name="device"
                x={box.x}
                y={box.y}
                opacity={box.dimmed && !selected ? DIMMED_OPACITY : 1}
                draggable={editable && !connecting}
                onDragStart={(e) => {
                  e.cancelBubble = true;
                  handleDragStart(box);
                }}
                onDragMove={(e) => {
                  e.cancelBubble = true;
                  handleDragMove(box, e.target, false);
                }}
                onDragEnd={(e) => {
                  e.cancelBubble = true;
                  handleDragMove(box, e.target, true);
                }}
                onClick={(e) => {
                  e.cancelBubble = true;
                  if (e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey) toggleDevice(box.device.id);
                  else if (!selected) select({ devices: [box.device.id] });
                }}
                onTap={(e) => {
                  e.cancelBubble = true;
                  select({ devices: [box.device.id] });
                }}
              >
                <Rect
                  width={width}
                  height={height}
                  fill={box.fill}
                  cornerRadius={radius}
                  stroke={selected ? '#0284c7' : box.template ? 'rgba(15,23,42,0.35)' : '#dc2626'}
                  strokeWidth={selected ? 3 : 1}
                  dash={box.multicore ? [8, 4] : undefined}
                  shadowColor="#0f172a"
                  shadowOpacity={0.15}
                  shadowBlur={selected ? 10 : 4}
                  shadowOffsetY={2}
                />
                <Text text={box.device.label} x={8} y={8} width={width - 16 - (showDmx && box.dmxLabel ? 44 : 0)} fontStyle="bold" fontSize={13} fill={box.text} ellipsis wrap="none" />
                {showDmx && box.dmxLabel && <Text name="dmx-label" text={box.dmxLabel} x={width - 52} y={9} width={44} align="right" fontSize={11} fontFamily="monospace" fill={box.text} />}
                {!box.template && <Text text="Vorlage fehlt" x={8} y={30} fontSize={11} fill="#dc2626" />}
                {box.unplaced && <Text name="unplaced-marker" text="⌖ nicht im Bühnenplan" x={0} y={height + 4} fontSize={10} fill="#b45309" fontStyle="italic" listening={false} />}
                {ends && (
                  <>
                    <Text text={ends.a} x={8} y={28} fontSize={10} fill={box.text} opacity={0.75} />
                    <Text text={ends.b} x={8} y={28} width={width - 16} align="right" fontSize={10} fill={box.text} opacity={0.75} />
                  </>
                )}
                {box.layout.anchors.map(({ port, x, y }) => {
                  const state = candidateState(box.device.id, port);
                  const isOccupied = occupied.has(`${box.device.id}/${port.id}`);
                  const color = ROLE_COLORS[port.role];
                  const label = box.labels.get(port.id) ?? port.label;
                  return (
                    <Group key={port.id}>
                      <Text
                        text={label}
                        x={port.side === 'left' ? 10 : 0}
                        y={y - 6}
                        width={port.side === 'left' ? width / 2 - 10 : width - 10}
                        align={port.side === 'left' ? 'left' : 'right'}
                        fontSize={11}
                        fill={box.text}
                        ellipsis
                        wrap="none"
                        listening={false}
                      />
                      <Circle
                        name="port"
                        id={`port-${box.device.id}-${port.id}`}
                        deviceId={box.device.id}
                        portId={port.id}
                        x={x}
                        y={y}
                        radius={state === 'ok' ? 8 : 5.5}
                        fill={isOccupied ? color : '#ffffff'}
                        stroke={state === 'invalid' ? '#cbd5e1' : color}
                        strokeWidth={state === 'ok' ? 3 : 2}
                        opacity={state === 'invalid' ? 0.4 : 1}
                        hitStrokeWidth={10}
                        onMouseDown={(e) => startConnect({ deviceId: box.device.id, portId: port.id, port }, e)}
                        onTouchStart={(e) => startConnect({ deviceId: box.device.id, portId: port.id, port }, e)}
                        onMouseEnter={(e) => {
                          const stage = e.target.getStage();
                          if (stage && editable) stage.container().style.cursor = 'crosshair';
                        }}
                        onMouseLeave={(e) => {
                          const stage = e.target.getStage();
                          if (stage) stage.container().style.cursor = '';
                        }}
                      />
                    </Group>
                  );
                })}
              </Group>
            );
          })}

          {/* Kabel, das gerade gezogen wird */}
          {connecting &&
            (() => {
              const box = boxById.get(connecting.from.deviceId);
              const a = box && anchorOf(box, connecting.from.portId);
              return a ? <Line points={[a.x, a.y, connecting.pointer.x, connecting.pointer.y]} stroke="#0284c7" strokeWidth={2} dash={[6, 4]} listening={false} /> : null;
            })()}

          {band && (
            <Rect
              x={Math.min(band.x1, band.x2)}
              y={Math.min(band.y1, band.y2)}
              width={Math.abs(band.x2 - band.x1)}
              height={Math.abs(band.y2 - band.y1)}
              fill="rgba(14,165,233,0.1)"
              stroke="#0ea5e9"
              dash={[4, 4]}
              listening={false}
            />
          )}
        </Layer>
      </Stage>
      {!area && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate-500">
          {editable ? 'Geräte aus der Bibliothek links hierher ziehen oder mit ＋ hinzufügen.' : 'Noch keine Geräte im Signalfluss.'}
        </div>
      )}
    </div>
  );
}
