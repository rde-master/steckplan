// Maßstäblicher Bühnenplan (Konva). Weltkoordinaten in Millimetern, Position = Mittelpunkt.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Ellipse, Group, Image as KImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva';
import type Konva from 'konva';
import {
  backgroundScale,
  canDock,
  formatDmx,
  dependents,
  findDockTarget,
  polylineLength,
  snapTo,
  type Background,
  type DeviceInstance,
  type Shape,
  type Template,
} from '@steckplan/core';
import { useEditor } from '../../lib/editor';
import { useLongPress } from '../../lib/useLongPress';
import { useEdgeScroll } from '../../lib/useEdgeScroll';
import { DIMMED_OPACITY } from '../../lib/display';
import { formatLength, scaleBar, type MulticoreRoute, type StageCable, type StageGroupFrame, type StageItem } from './model';

export interface StagePt {
  x: number;
  y: number;
}

export interface StageCanvasProps {
  items: StageItem[];
  cables: StageCable[];
  multicores: MulticoreRoute[];
  showCables: boolean;
  /** Beschriftung (Länge) für ein ausgewähltes Kabel bzw. Multicore */
  lengthLabel: (id: string) => string | undefined;
  onCableWaypoints: (id: string, waypoints: StagePt[]) => void;
  onMulticoreChange: (id: string, patch: { position?: StagePt; endB?: StagePt; waypoints?: StagePt[] }) => void;
  shapes: Shape[];
  lockedLayers: Set<string>;
  background: Background | undefined;
  devices: DeviceInstance[];
  templates: Map<string, Template>;
  gridMm: number;
  snap: boolean;
  editable: boolean;
  onMoveDevices: (moves: { id: string; x: number; y: number }[]) => void;
  onDeviceDrop: (id: string, center: StagePt, noDock: boolean) => void;
  onGroupDrop: () => void;
  onRotate: (id: string, rotationDeg: number) => void;
  onAddShape: (shape: Omit<Shape, 'id' | 'layerId'>) => void;
  onUpdateShape: (id: string, patch: Partial<Shape>) => void;
  onDropTemplate: (templateId: string, at: StagePt) => void;
  onDropUnplaced: (deviceId: string, at: StagePt) => void;
  onCalibrate: (p1: StagePt, p2: StagePt) => void;
  onBackgroundMove: (offset: StagePt) => void;
  /** Gruppenrahmen (ein-/ausblendbar) */
  groupFrames?: StageGroupFrame[];
}

declare global {
  interface Window {
    __steckplanStagePlan?: Konva.Stage | null;
  }
}

const MIN_ZOOM = 0.005;
const MAX_ZOOM = 1.5;

function useImage(src: string | undefined): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) return;
    const img = new window.Image();
    let active = true;
    img.onload = () => active && setImage(img);
    img.src = src;
    return () => {
      active = false;
    };
  }, [src]);
  return src ? image : null;
}

export function StagePlanCanvas(props: StageCanvasProps) {
  const { items, shapes, lockedLayers, background, devices, templates, gridMm, snap, editable, cables, multicores, showCables } = props;
  const container = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const view = useEditor((s) => s.stageView);
  const setView = useEditor((s) => s.setStageView);
  const selection = useEditor((s) => s.selection);
  const select = useEditor((s) => s.select);
  const requestProperties = useEditor((s) => s.requestProperties);
  useLongPress(container, requestProperties);
  const toggleDevice = useEditor((s) => s.toggleDevice);
  const toggleShape = useEditor((s) => s.toggleShape);
  const clearSelection = useEditor((s) => s.clearSelection);
  const tool = useEditor((s) => s.tool);
  /** Auswählen und Markieren: Objekte lassen sich anklicken und ziehen */
  const pointerTool = tool === 'select' || tool === 'marquee';
  const [band, setBand] = useState<{ x1: number; y1: number; x2: number; y2: number; additive: boolean } | null>(null);
  const bandEnded = useRef(false);
  // Am Rand beim Markieren automatisch scrollen; der Rahmen wächst mit
  const getPanView = useCallback(() => useEditor.getState().stageView, []);
  const growBand = useCallback((p: { x: number; y: number }) => setBand((b) => (b ? { ...b, x2: p.x, y2: p.y } : b)), []);
  useEdgeScroll({
    active: band !== null,
    container,
    getView: getPanView,
    setView,
    onPointerWorld: growBand,
    onRelease: () => {
      finishBand();
      bandEnded.current = false;
    },
  });
  const setTool = useEditor((s) => s.setTool);
  const moveBackground = useEditor((s) => s.moveBackground);
  const focusRequest = useEditor((s) => s.focusRequest);
  const showDmx = useEditor((s) => s.showDmx);
  const [draft, setDraft] = useState<StagePt[]>([]);
  const [pointer, setPointer] = useState<StagePt | null>(null);
  const [dockTargetId, setDockTargetId] = useState<string | null>(null);
  const dragStart = useRef<{ id: string; x: number; y: number; others: { id: string; x: number; y: number }[] } | null>(null);
  const bgImage = useImage(background?.image);
  const selectedDevices = useMemo(() => new Set(selection.devices), [selection.devices]);
  const selectedShapes = useMemo(() => new Set(selection.shapes), [selection.shapes]);
  const selectedCables = useMemo(() => new Set(selection.cables), [selection.cables]);
  const toggleCable = useEditor((s) => s.toggleCable);
  const px = (screen: number) => screen / view.zoom; // Bildschirmpixel → Millimeter

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
    window.__steckplanStagePlan = stageRef.current;
    return () => {
      window.__steckplanStagePlan = null;
    };
  }, []);

  useEffect(() => {
    if (!focusRequest) return;
    const { zoom } = useEditor.getState().stageView;
    setView({ zoom, x: size.width / 2 - focusRequest.x * zoom, y: size.height / 2 - focusRequest.y * zoom });
  }, [focusRequest, size.width, size.height, setView]);

  // Drehgriff für ein einzelnes ausgewähltes, nicht gesperrtes Objekt
  useEffect(() => {
    const tr = transformerRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const only = selection.devices.length === 1 && selection.shapes.length === 0 ? items.find((i) => i.device.id === selection.devices[0]) : undefined;
    const node = editable && only && !only.locked && pointerTool ? stage.findOne(`#stage-device-${only.device.id}`) : undefined;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selection, items, editable, pointerTool]);

  // Esc / Enter für Zeichenwerkzeuge
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).closest('input, textarea, select, dialog')) return;
      if (e.key === 'Escape') {
        setDraft([]);
        setTool('select');
      } else if (e.key === 'Enter' && tool === 'wall' && draft.length >= 2) {
        finishWall();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function world(): StagePt | null {
    const pos = stageRef.current?.getPointerPosition();
    return pos ? { x: (pos.x - view.x) / view.zoom, y: (pos.y - view.y) / view.zoom } : null;
  }

  function snapped(p: StagePt, constrainFrom?: StagePt, orthogonal = false): StagePt {
    let q = snap ? { x: snapTo(p.x, gridMm), y: snapTo(p.y, gridMm) } : p;
    if (orthogonal && constrainFrom) {
      q = Math.abs(q.x - constrainFrom.x) > Math.abs(q.y - constrainFrom.y) ? { x: q.x, y: constrainFrom.y } : { x: constrainFrom.x, y: q.y };
    }
    return { x: Math.round(q.x), y: Math.round(q.y) };
  }

  function zoomAt(point: StagePt, next: number) {
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    const wx = (point.x - view.x) / view.zoom;
    const wy = (point.y - view.y) / view.zoom;
    setView({ zoom, x: point.x - wx * zoom, y: point.y - wy * zoom });
  }

  // Touch: Zwei-Finger-Zoom (Geste) – Verschieben mit einem Finger übernimmt Konva (draggable)
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  function handleTouchMove(e: Konva.KonvaEventObject<TouchEvent>) {
    const touches = e.evt.touches;
    if (touches.length !== 2) {
      const p = world();
      setPointer(p);
      if (band && p) setBand({ ...band, x2: p.x, y2: p.y });
      return;
    }
    e.evt.preventDefault();
    if (stageRef.current?.isDragging()) stageRef.current.stopDrag();
    const [t1, t2] = [touches[0]!, touches[1]!];
    const distance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    const rect = container.current!.getBoundingClientRect();
    const center = { x: (t1.clientX + t2.clientX) / 2 - rect.left, y: (t1.clientY + t2.clientY) / 2 - rect.top };
    if (!pinch.current) pinch.current = { distance, zoom: view.zoom };
    zoomAt(center, pinch.current.zoom * (distance / pinch.current.distance));
  }

  // ---------- Markieren: Rahmen aufziehen ----------

  function startBand(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (tool !== 'marquee') return;
    const target = e.target;
    // nur auf leerer Fläche (oder dem nicht verschiebbaren Hintergrundbild)
    if (target !== stageRef.current && target.name() !== 'background') return;
    const p = world();
    if (!p) return;
    const additive = 'shiftKey' in e.evt && (e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey);
    setBand({ x1: p.x, y1: p.y, x2: p.x, y2: p.y, additive });
  }

  function finishBand() {
    if (!band) return;
    const x1 = Math.min(band.x1, band.x2);
    const x2 = Math.max(band.x1, band.x2);
    const y1 = Math.min(band.y1, band.y2);
    const y2 = Math.max(band.y1, band.y2);
    const inRect = (p: StagePt) => p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2;
    setBand(null);
    bandEnded.current = true;
    if (x2 - x1 < 1 && y2 - y1 < 1) {
      bandEnded.current = false;
      return; // nur geklickt
    }
    // Geräte/Träger: Mittelpunkt im Rahmen; Wände, Texte, Maßlinien: alle Punkte im Rahmen
    const deviceIds = items.filter((i) => !i.locked && inRect({ x: i.x, y: i.y })).map((i) => i.device.id);
    const shapeIds = shapes.filter((sh) => !lockedLayers.has(sh.layerId) && sh.points.length > 0 && sh.points.every(inRect)).map((sh) => sh.id);
    if (band.additive) select({ devices: deviceIds, shapes: shapeIds }, true);
    else select({ devices: deviceIds, shapes: shapeIds, cables: [] });
  }


  function finishWall() {
    if (draft.length >= 2) props.onAddShape({ kind: 'wall', points: draft, rotationDeg: 0, strokeWidthMm: 200 });
    setDraft([]);
  }

  // Klick in Zeichenwerkzeugen
  function handleToolClick(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const p0 = world();
    if (!p0) return;
    const shift = 'shiftKey' in e.evt && e.evt.shiftKey;
    const p = snapped(p0, draft[draft.length - 1], shift);
    if (tool === 'wall') {
      if (draft.length && 'detail' in e.evt && e.evt.detail >= 2) {
        finishWall();
        return;
      }
      setDraft([...draft, p]);
    } else if (tool === 'dimension') {
      if (draft.length === 0) setDraft([p]);
      else {
        props.onAddShape({ kind: 'dimension', points: [draft[0]!, p], rotationDeg: 0 });
        setDraft([]);
      }
    } else if (tool === 'text') {
      props.onAddShape({ kind: 'text', points: [p], text: 'Text', rotationDeg: 0, fontSizeMm: 400 });
      setTool('select');
    } else if (tool === 'calibrate') {
      const raw = { x: Math.round(p0.x), y: Math.round(p0.y) };
      if (draft.length === 0) setDraft([raw]);
      else {
        props.onCalibrate(draft[0]!, raw);
        setDraft([]);
        setTool('select');
      }
    }
  }

  // ---------- Geräte ziehen ----------

  function dragIds(item: StageItem): string[] {
    return selectedDevices.has(item.device.id) ? selection.devices : [item.device.id];
  }

  function handleDragStart(item: StageItem) {
    if (!selectedDevices.has(item.device.id)) select({ devices: [item.device.id] });
    const ids = dragIds(item);
    const moving = new Set(ids);
    const others = [...devices.filter((d) => moving.has(d.id) && d.id !== item.device.id), ...dependents(ids, devices).filter((d) => !moving.has(d.id))];
    dragStart.current = {
      id: item.device.id,
      x: item.x,
      y: item.y,
      others: others.filter((d) => d.stagePlan).map((d) => ({ id: d.id, x: d.stagePlan!.position.x, y: d.stagePlan!.position.y })),
    };
  }

  function handleDragMove(item: StageItem, node: Konva.Node) {
    const start = dragStart.current;
    if (!start) return;
    const dx = node.x() - start.x;
    const dy = node.y() - start.y;
    props.onMoveDevices([{ id: item.device.id, x: node.x(), y: node.y() }, ...start.others.map((o) => ({ id: o.id, x: o.x + dx, y: o.y + dy }))]);
    if (start.others.length === 0 && canDock(item.template)) {
      const exclude = new Set([item.device.id, ...dependents([item.device.id], devices).map((d) => d.id)]);
      setDockTargetId(findDockTarget({ x: node.x(), y: node.y() }, devices, templates, exclude)?.carrier.id ?? null);
    }
  }

  function handleDragEnd(item: StageItem, node: Konva.Node, evt: MouseEvent | TouchEvent) {
    const start = dragStart.current;
    dragStart.current = null;
    setDockTargetId(null);
    if (!start) return;
    const noDock = 'altKey' in evt && evt.altKey;
    if (start.others.length === 0) {
      props.onDeviceDrop(item.device.id, { x: node.x(), y: node.y() }, noDock);
    } else {
      // Gruppe: am Raster ausrichten (Versatz des gezogenen Geräts)
      const x = snap ? snapTo(node.x(), gridMm) : node.x();
      const y = snap ? snapTo(node.y(), gridMm) : node.y();
      const dx = x - start.x;
      const dy = y - start.y;
      props.onMoveDevices([{ id: item.device.id, x, y }, ...start.others.map((o) => ({ id: o.id, x: o.x + dx, y: o.y + dy }))]);
      props.onGroupDrop();
    }
  }

  const bar = scaleBar(view.zoom);
  const gridPx = gridMm * view.zoom;
  const visualGrid = gridPx < 8 ? gridPx * 10 : gridPx;
  const bgScale = background ? backgroundScale(background) : 10;
  const fontPx = px(12);

  return (
    <div
      ref={container}
      className="relative h-full w-full overflow-hidden bg-white dark:bg-slate-950"
      style={{
        backgroundImage: 'linear-gradient(rgba(100,116,139,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(100,116,139,0.18) 1px, transparent 1px)',
        backgroundSize: `${visualGrid}px ${visualGrid}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
        touchAction: 'none',
        cursor: tool === 'select' ? undefined : 'crosshair',
      }}
      data-testid="stageplan-canvas"
      onDragOver={(e) => {
        if (editable && (e.dataTransfer.types.includes('application/x-steckplan-template') || e.dataTransfer.types.includes('application/x-steckplan-device'))) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!editable) return;
        const rect = container.current!.getBoundingClientRect();
        const at = { x: Math.round((e.clientX - rect.left - view.x) / view.zoom), y: Math.round((e.clientY - rect.top - view.y) / view.zoom) };
        const templateId = e.dataTransfer.getData('application/x-steckplan-template');
        const deviceId = e.dataTransfer.getData('application/x-steckplan-device');
        if (templateId) props.onDropTemplate(templateId, at);
        else if (deviceId) props.onDropUnplaced(deviceId, at);
        else return;
        e.preventDefault();
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
        draggable={tool === 'select'}
        onDragEnd={(e) => {
          if (e.target === stageRef.current) setView({ ...view, x: e.target.x(), y: e.target.y() });
        }}
        onWheel={(e) => {
          e.evt.preventDefault();
          if (e.evt.ctrlKey || e.evt.metaKey) {
            const pos = stageRef.current?.getPointerPosition() ?? { x: size.width / 2, y: size.height / 2 };
            zoomAt(pos, view.zoom * Math.exp(-e.evt.deltaY * 0.0025));
          } else setView({ ...view, x: view.x - e.evt.deltaX, y: view.y - e.evt.deltaY });
        }}
        onMouseDown={(e) => startBand(e)}
        onTouchStart={(e) => startBand(e)}
        onMouseMove={() => {
          const p = world();
          setPointer(p);
          if (band && p) setBand({ ...band, x2: p.x, y2: p.y });
        }}
        onMouseUp={() => finishBand()}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => {
          pinch.current = null;
          finishBand();
        }}
        onClick={(e) => {
          if (!pointerTool) {
            handleToolClick(e);
            return;
          }
          if (bandEnded.current) {
            bandEnded.current = false;
            return;
          }
          if (e.target === stageRef.current) clearSelection();
        }}
        onTap={(e) => {
          if (!pointerTool) handleToolClick(e);
          else if (e.target === stageRef.current) clearSelection();
        }}
      >
        <Layer>
          {background && bgImage && (
            <KImage
              name="background"
              image={bgImage}
              x={background.offset?.x ?? 0}
              y={background.offset?.y ?? 0}
              scaleX={bgScale}
              scaleY={bgScale}
              opacity={background.opacity ?? 0.5}
              draggable={editable && moveBackground && pointerTool}
              listening={moveBackground && pointerTool}
              onDragEnd={(e) => {
                e.cancelBubble = true;
                props.onBackgroundMove({ x: Math.round(e.target.x()), y: Math.round(e.target.y()) });
              }}
            />
          )}
        </Layer>
        <Layer>
          {/* Wände */}
          {shapes
            .filter((s) => s.kind === 'wall')
            .map((shape) => (
              <ShapeNode key={shape.id} shape={shape} selected={selectedShapes.has(shape.id)} locked={lockedLayers.has(shape.layerId)} editable={editable && pointerTool} fontPx={fontPx} px={px} onSelect={(add) => (add ? toggleShape(shape.id) : select({ shapes: [shape.id] }))} onUpdate={(patch) => props.onUpdateShape(shape.id, patch)} snap={(p) => snapped(p)} />
            ))}

          {/* Gruppenrahmen (nur Anzeige) */}
          {(props.groupFrames ?? []).map((frame) => (
            <Group key={frame.id} name="stage-group-frame" x={frame.x} y={frame.y} listening={false}>
              <Rect width={frame.width} height={frame.height} fill={frame.color} opacity={0.08} cornerRadius={px(10)} />
              <Rect width={frame.width} height={frame.height} stroke={frame.color} strokeWidth={px(1.5)} dash={[px(8), px(4)]} cornerRadius={px(10)} />
              <Text text={frame.name} x={px(8)} y={px(5)} fontSize={fontPx} fontStyle="bold" fill={frame.color} />
            </Group>
          ))}

          {/* Objekte */}
          {items.map((item) => {
            const selected = selectedDevices.has(item.device.id);
            const { widthMm: w, depthMm: d, form } = item.footprint;
            const target = dockTargetId === item.device.id;
            const stroke = target ? '#16a34a' : selected ? '#0284c7' : item.kind === 'device' ? 'rgba(15,23,42,0.6)' : '#475569';
            const strokeWidth = px(target ? 4 : selected ? 3 : 1);
            const label = item.person ? `${item.device.label}\n👤 ${item.person}` : item.device.label;
            const heightText = [
              item.height.heightMm > 0 ? formatLength(item.height.heightMm) : '',
              item.mountSide === 'top' ? 'steht oben' : '',
              showDmx && item.device.dmx ? `DMX ${formatDmx(item.device.dmx.universe, item.device.dmx.address)}` : '',
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <Group
                key={item.device.id}
                id={`stage-device-${item.device.id}`}
                name="stage-device"
                x={item.x}
                y={item.y}
                rotation={item.rotation}
                opacity={item.dimmed && !selected ? DIMMED_OPACITY : 1}
                draggable={editable && !item.locked && pointerTool}
                listening={!item.locked && pointerTool}
                onDragStart={(e) => {
                  e.cancelBubble = true;
                  handleDragStart(item);
                }}
                onDragMove={(e) => {
                  e.cancelBubble = true;
                  handleDragMove(item, e.target);
                }}
                onDragEnd={(e) => {
                  e.cancelBubble = true;
                  handleDragEnd(item, e.target, e.evt);
                }}
                onClick={(e) => {
                  e.cancelBubble = true;
                  if (e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey) toggleDevice(item.device.id);
                  else select({ devices: [item.device.id] });
                }}
                onTap={(e) => {
                  e.cancelBubble = true;
                  select({ devices: [item.device.id] });
                }}
                onTransformEnd={(e) => {
                  const node = e.target;
                  props.onRotate(item.device.id, node.rotation());
                  node.scaleX(1);
                  node.scaleY(1);
                }}
              >
                {form === 'circle' ? (
                  <Ellipse radiusX={w / 2} radiusY={d / 2} fill={item.kind === 'stand' ? 'rgba(148,163,184,0.15)' : item.fill} stroke={stroke} strokeWidth={strokeWidth} dash={item.kind === 'stand' ? [px(6), px(4)] : undefined} />
                ) : (
                  <Rect
                    x={-w / 2}
                    y={-d / 2}
                    width={w}
                    height={d}
                    cornerRadius={form === 'rounded' ? Math.min(w, d) * 0.15 : 0}
                    fill={item.kind === 'truss' ? 'rgba(148,163,184,0.25)' : item.fill}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                  />
                )}
                {item.kind === 'truss' && <Line points={trussZigzag(w, d)} stroke="#64748b" strokeWidth={px(1)} listening={false} />}
                {item.kind === 'stand' && (
                  <>
                    {[0, 120, 240].map((a) => (
                      <Line key={a} points={[0, 0, (Math.cos(((a - 90) * Math.PI) / 180) * w) / 2, (Math.sin(((a - 90) * Math.PI) / 180) * d) / 2]} stroke="#64748b" strokeWidth={px(1.5)} listening={false} />
                    ))}
                    <Circle radius={px(4)} fill="#475569" listening={false} />
                    {(item.tBarMm ?? 0) > 0 && (
                      <Line
                        name="t-bar"
                        points={[-(item.tBarMm ?? 0) / 2, 0, (item.tBarMm ?? 0) / 2, 0]}
                        stroke="#334155"
                        strokeWidth={Math.max(px(3), 40)}
                        lineCap="round"
                        listening={false}
                      />
                    )}
                  </>
                )}
                <Text
                  text={heightText ? `${label}\n${heightText}` : label}
                  x={-Math.max(w, px(120)) / 2}
                  y={labelY(item.kind, d, fontPx, px)}
                  width={Math.max(w, px(120))}
                  align="center"
                  fontSize={fontPx}
                  lineHeight={1.15}
                  fill="#0f172a"
                  listening={false}
                />
                {item.device.mountedOnId && <Circle x={0} y={0} radius={px(3)} fill="#16a34a" listening={false} />}
              </Group>
            );
          })}

          {/* Multicores: Verlauf von Ende A nach Ende B */}
          {multicores.map((route) => {
            const selected = selectedDevices.has(route.device.id);
            const pts = [route.a, ...route.waypoints, ...(route.b ? [route.b] : [])];
            const canEdit = editable && !route.locked && pointerTool;
            const ends = { a: route.template.endALabel || 'A', b: route.template.endBLabel || 'B' };
            const marker = (key: 'a' | 'b', p: StagePt) => (
              <Group
                key={key}
                name="multicore-end"
                id={`multicore-${key}-${route.device.id}`}
                x={p.x}
                y={p.y}
                draggable={canEdit}
                onClick={(e) => {
                  e.cancelBubble = true;
                  select({ devices: [route.device.id] });
                }}
                onTap={(e) => {
                  e.cancelBubble = true;
                  select({ devices: [route.device.id] });
                }}
                onDragStart={(e) => (e.cancelBubble = true)}
                onDragMove={(e) => (e.cancelBubble = true)}
                onDragEnd={(e) => {
                  e.cancelBubble = true;
                  const q = snapped({ x: e.target.x(), y: e.target.y() });
                  props.onMulticoreChange(route.device.id, key === 'a' ? { position: q } : { endB: q });
                }}
              >
                <Rect x={-px(9)} y={-px(9)} width={px(18)} height={px(18)} fill={route.color} stroke={selected ? '#0284c7' : '#0f172a'} strokeWidth={px(selected ? 3 : 1)} cornerRadius={px(3)} />
                <Text text={key === 'a' ? 'A' : 'B'} x={-px(9)} y={-px(6)} width={px(18)} align="center" fontSize={px(11)} fontStyle="bold" fill="#ffffff" listening={false} />
                <Text text={`${route.device.label} · ${key === 'a' ? ends.a : ends.b}`} x={px(12)} y={-px(6)} fontSize={fontPx} fill="#0f172a" listening={false} />
              </Group>
            );
            return (
              <Group key={route.device.id} opacity={route.dimmed && !selected ? DIMMED_OPACITY : 1}>
                {pts.length > 1 && (
                  <Line
                    name="multicore-route"
                    points={pts.flatMap((p) => [p.x, p.y])}
                    stroke={route.color}
                    strokeWidth={px(selected ? 7 : 5)}
                    dash={[px(14), px(6)]}
                    lineJoin="round"
                    hitStrokeWidth={px(14)}
                    onClick={(e) => {
                      e.cancelBubble = true;
                      select({ devices: [route.device.id] });
                    }}
                  />
                )}
                {marker('a', route.a)}
                {route.b && marker('b', route.b)}
                {selected && canEdit && route.b && (
                  <RouteHandles
                    points={pts}
                    px={px}
                    snap={snapped}
                    onChange={(waypoints) => props.onMulticoreChange(route.device.id, { waypoints })}
                  />
                )}
                {selected && props.lengthLabel(route.device.id) && pts.length > 1 && <LengthTag points={pts} text={props.lengthLabel(route.device.id)!} px={px} fontPx={fontPx} />}
              </Group>
            );
          })}

          {/* Kabel */}
          {showCables &&
            cables.map((line) => {
              const selected = selectedCables.has(line.cable.id);
              const pts: StagePt[] = [];
              for (let i = 0; i < line.points.length; i += 2) pts.push({ x: line.points[i]!, y: line.points[i + 1]! });
              return (
                <Group key={line.cable.id} opacity={line.dimmed && !selected ? DIMMED_OPACITY : 1}>
                  <Line
                    name="stage-cable"
                    id={`stage-cable-${line.cable.id}`}
                    points={line.points}
                    stroke={line.issue ? '#dc2626' : line.color}
                    strokeWidth={px(selected ? 4 : 2)}
                    lineJoin="round"
                    hitStrokeWidth={px(12)}
                    listening={pointerTool}
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
                  {selected && editable && pointerTool && <RouteHandles points={pts} px={px} snap={snapped} onChange={(waypoints) => props.onCableWaypoints(line.cable.id, waypoints)} />}
                  {selected && props.lengthLabel(line.cable.id) && <LengthTag points={pts} text={props.lengthLabel(line.cable.id)!} px={px} fontPx={fontPx} />}
                </Group>
              );
            })}

          {/* Text und Maßlinien über den Objekten */}
          {shapes
            .filter((s) => s.kind !== 'wall')
            .map((shape) => (
              <ShapeNode key={shape.id} shape={shape} selected={selectedShapes.has(shape.id)} locked={lockedLayers.has(shape.layerId)} editable={editable && pointerTool} fontPx={fontPx} px={px} onSelect={(add) => (add ? toggleShape(shape.id) : select({ shapes: [shape.id] }))} onUpdate={(patch) => props.onUpdateShape(shape.id, patch)} snap={(p) => snapped(p)} />
            ))}

          {/* Markierungsrahmen */}
          {band && (
            <Rect
              name="marquee"
              x={Math.min(band.x1, band.x2)}
              y={Math.min(band.y1, band.y2)}
              width={Math.abs(band.x2 - band.x1)}
              height={Math.abs(band.y2 - band.y1)}
              fill="rgba(14,165,233,0.08)"
              stroke="#0284c7"
              strokeWidth={px(1)}
              dash={[px(4), px(3)]}
              listening={false}
            />
          )}

          {/* Zeichnen: Vorschau */}
          {draft.length > 0 && pointer && (
            <Line
              points={[...draft.flatMap((p) => [p.x, p.y]), ...(tool === 'calibrate' ? [pointer.x, pointer.y] : (() => {
                const q = snapped(pointer);
                return [q.x, q.y];
              })())]}
              stroke={tool === 'calibrate' ? '#dc2626' : '#0284c7'}
              strokeWidth={tool === 'wall' ? 200 : px(2)}
              opacity={tool === 'wall' ? 0.5 : 1}
              dash={tool === 'wall' ? undefined : [px(6), px(4)]}
              listening={false}
            />
          )}
          {draft.map((p, i) => (
            <Circle key={i} x={p.x} y={p.y} radius={px(4)} fill={tool === 'calibrate' ? '#dc2626' : '#0284c7'} listening={false} />
          ))}

          <Transformer ref={transformerRef} resizeEnabled={false} rotateEnabled rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]} rotationSnapTolerance={4} borderStroke="#0284c7" anchorStroke="#0284c7" />
        </Layer>
      </Stage>

      {/* Maßstab */}
      <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-white/85 px-2 py-1 text-xs text-slate-700 shadow dark:bg-slate-900/85 dark:text-slate-200" data-testid="scale-bar">
        <div className="h-1.5 border-x-2 border-b-2 border-slate-700 dark:border-slate-200" style={{ width: bar.px }} />
        <div className="mt-0.5 text-center">{bar.mm >= 1000 ? `${bar.mm / 1000} m` : `${bar.mm / 10} cm`}</div>
      </div>
      {pointer && (
        <div className="pointer-events-none absolute right-3 bottom-3 rounded bg-white/85 px-2 py-1 font-mono text-xs text-slate-600 shadow dark:bg-slate-900/85 dark:text-slate-300">
          x {formatLength(pointer.x)} · y {formatLength(pointer.y)}
        </div>
      )}
      {tool !== 'select' && !band && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 rounded-md bg-sky-600 px-3 py-1.5 text-sm text-white shadow" data-testid="tool-hint">
          {TOOL_HINTS[tool]}
        </div>
      )}
      {items.length === 0 && shapes.length === 0 && !background && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate-500">
          {editable ? 'Bühnenelemente, Traversen, Stative und Geräte aus der Seitenleiste hierher ziehen oder mit ＋ hinzufügen.' : 'Noch nichts im Bühnenplan.'}
        </div>
      )}
    </div>
  );
}

const TOOL_HINTS: Record<string, string> = {
  marquee: 'Markieren: Rahmen um Objekte ziehen (Umschalt/Strg = hinzufügen); markierte Objekte gemeinsam verschieben',
  wall: 'Wand: Punkte anklicken, Doppelklick oder Enter beendet (Umschalt = rechtwinklig, Esc = abbrechen)',
  text: 'Text: Stelle anklicken',
  dimension: 'Maßlinie: Anfang und Ende anklicken',
  calibrate: 'Kalibrieren: zwei Punkte im Grundriss anklicken, deren Abstand du kennst',
};

/** Lage der Beschriftung je nach Art, damit sich Texte möglichst nicht überlappen. */
function labelY(kind: string, depth: number, fontPx: number, px: (n: number) => number): number {
  const lines = 2.4 * fontPx;
  if (kind === 'stageElement') return depth > lines + px(8) ? -depth / 2 + px(4) : depth / 2 + px(3); // innen oben
  if (kind === 'truss') return -depth / 2 - lines - px(2); // über der Traverse
  if (kind === 'device' && depth > lines + px(4)) return -lines / 2; // innen mittig
  return depth / 2 + px(3); // darunter
}

function trussZigzag(w: number, d: number): number[] {
  const segments = Math.max(2, Math.round(w / Math.max(d, 200)));
  const step = w / segments;
  const points: number[] = [];
  for (let i = 0; i <= segments; i++) points.push(-w / 2 + i * step, i % 2 === 0 ? -d / 2 : d / 2);
  return points;
}

/**
 * Griffe für einen Verlauf: Knickpunkte (ziehen, Doppelklick entfernt) und Mitten der Abschnitte
 * (ziehen fügt einen Knickpunkt ein). Anfang und Ende sind fest (gehören zu den Geräten).
 */
function RouteHandles({ points, px, snap, onChange }: { points: StagePt[]; px: (n: number) => number; snap: (p: StagePt) => StagePt; onChange: (waypoints: StagePt[]) => void }) {
  const waypoints = points.slice(1, -1);
  return (
    <>
      {points.slice(0, -1).map((p, i) => {
        const q = points[i + 1]!;
        return (
          <Circle
            key={`mid-${i}`}
            name="route-mid"
            x={(p.x + q.x) / 2}
            y={(p.y + q.y) / 2}
            radius={px(5)}
            fill="#ffffff"
            stroke="#0284c7"
            strokeWidth={px(1.5)}
            opacity={0.85}
            draggable
            onDragStart={(e) => (e.cancelBubble = true)}
            onDragMove={(e) => (e.cancelBubble = true)}
            onDragEnd={(e) => {
              e.cancelBubble = true;
              const np = snap({ x: e.target.x(), y: e.target.y() });
              onChange([...waypoints.slice(0, i), np, ...waypoints.slice(i)]);
            }}
          />
        );
      })}
      {waypoints.map((p, i) => (
        <Circle
          key={`wp-${i}`}
          name="route-waypoint"
          x={p.x}
          y={p.y}
          radius={px(7)}
          fill="#0284c7"
          stroke="#ffffff"
          strokeWidth={px(2)}
          draggable
          onDragStart={(e) => (e.cancelBubble = true)}
          onDragMove={(e) => (e.cancelBubble = true)}
          onDragEnd={(e) => {
            e.cancelBubble = true;
            const np = snap({ x: e.target.x(), y: e.target.y() });
            onChange(waypoints.map((w, j) => (j === i ? np : w)));
          }}
          onDblClick={(e) => {
            e.cancelBubble = true;
            onChange(waypoints.filter((_, j) => j !== i));
          }}
          onDblTap={(e) => {
            e.cancelBubble = true;
            onChange(waypoints.filter((_, j) => j !== i));
          }}
        />
      ))}
    </>
  );
}

function LengthTag({ points, text, px, fontPx }: { points: StagePt[]; text: string; px: (n: number) => number; fontPx: number }) {
  const mid = Math.floor((points.length - 1) / 2);
  const p = points[mid]!;
  const q = points[mid + 1] ?? p;
  return (
    <Group x={(p.x + q.x) / 2} y={(p.y + q.y) / 2} listening={false}>
      <Rect x={px(8)} y={-px(10)} width={text.length * fontPx * 0.58 + px(10)} height={px(20)} fill="#0f172a" opacity={0.85} cornerRadius={px(4)} />
      <Text name="length-tag" text={text} x={px(13)} y={-px(6)} fontSize={fontPx} fill="#ffffff" />
    </Group>
  );
}

interface ShapeNodeProps {
  shape: Shape;
  selected: boolean;
  locked: boolean;
  editable: boolean;
  fontPx: number;
  px: (screen: number) => number;
  onSelect: (additive: boolean) => void;
  onUpdate: (patch: Partial<Shape>) => void;
  snap: (p: StagePt) => StagePt;
}

function ShapeNode({ shape, selected, locked, editable, fontPx, px, onSelect, onUpdate, snap }: ShapeNodeProps) {
  const canEdit = editable && !locked;
  const color = selected ? '#0284c7' : '#334155';
  const common = {
    name: 'stage-shape',
    id: `stage-shape-${shape.id}`,
    draggable: canEdit,
    listening: !locked,
    onClick: (e: Konva.KonvaEventObject<MouseEvent>) => {
      e.cancelBubble = true;
      onSelect(e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey);
    },
    onTap: (e: Konva.KonvaEventObject<TouchEvent>) => {
      e.cancelBubble = true;
      onSelect(false);
    },
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      e.cancelBubble = true;
      const dx = e.target.x();
      const dy = e.target.y();
      e.target.position({ x: 0, y: 0 });
      const first = shape.points[0];
      const moved = first ? snap({ x: first.x + dx, y: first.y + dy }) : { x: dx, y: dy };
      const ox = first ? moved.x - first.x : dx;
      const oy = first ? moved.y - first.y : dy;
      onUpdate({ points: shape.points.map((p) => ({ x: Math.round(p.x + ox), y: Math.round(p.y + oy) })) });
    },
  };
  const handles =
    selected && canEdit
      ? shape.points.map((p, i) => (
          <Circle
            key={i}
            name="shape-handle"
            x={p.x}
            y={p.y}
            radius={px(6)}
            fill="#ffffff"
            stroke="#0284c7"
            strokeWidth={px(2)}
            draggable
            onDragStart={(e) => (e.cancelBubble = true)}
            onDragMove={(e) => (e.cancelBubble = true)}
            onDragEnd={(e) => {
              e.cancelBubble = true;
              const q = snap({ x: e.target.x(), y: e.target.y() });
              onUpdate({ points: shape.points.map((pt, j) => (j === i ? q : pt)) });
            }}
          />
        ))
      : null;

  if (shape.kind === 'wall') {
    return (
      <>
        <Line {...common} points={shape.points.flatMap((p) => [p.x, p.y])} stroke={color} strokeWidth={shape.strokeWidthMm ?? 200} lineCap="square" lineJoin="miter" hitStrokeWidth={Math.max(shape.strokeWidthMm ?? 200, px(12))} />
        {handles}
      </>
    );
  }
  if (shape.kind === 'text') {
    const p = shape.points[0] ?? { x: 0, y: 0 };
    return (
      <>
        <Text {...common} x={p.x} y={p.y} text={shape.text ?? ''} fontSize={shape.fontSizeMm ?? 400} rotation={shape.rotationDeg} fill={color} />
      </>
    );
  }
  // Maßlinie
  const [a, b] = [shape.points[0] ?? { x: 0, y: 0 }, shape.points[1] ?? { x: 0, y: 0 }];
  const length = polylineLength([a, b]);
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const nx = -Math.sin(angle) * px(8);
  const ny = Math.cos(angle) * px(8);
  const deg = (angle * 180) / Math.PI;
  const readable = deg > 90 || deg < -90 ? deg + 180 : deg;
  return (
    <>
      <Group {...common}>
        <Line points={[a.x, a.y, b.x, b.y]} stroke={color} strokeWidth={px(1.5)} hitStrokeWidth={px(12)} />
        <Line points={[a.x - nx, a.y - ny, a.x + nx, a.y + ny]} stroke={color} strokeWidth={px(1.5)} />
        <Line points={[b.x - nx, b.y - ny, b.x + nx, b.y + ny]} stroke={color} strokeWidth={px(1.5)} />
        <Text name="dimension-label" x={(a.x + b.x) / 2} y={(a.y + b.y) / 2} text={formatLength(length)} fontSize={fontPx} fill={color} rotation={readable} offsetX={px(28)} offsetY={px(16)} />
      </Group>
      {handles}
    </>
  );
}
