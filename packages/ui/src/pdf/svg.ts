// Planzeichnungen als SVG aus den Daten (Vektor, kein Bildschirmfoto) – für den PDF-Export.
import { backgroundScale, polylineLength, type Background, type CrossPageRef, type Library, type Shape } from '@steckplan/core';
import { formatLength, type MulticoreRoute, type StageCable, type StageItem } from '../components/stageplan/model';
import { anchorOf, edgePoint, ROLE_COLORS, WIRELESS_COLOR, type CableLine, type DeviceBox } from '../components/signalflow/model';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function n(v: number): string {
  return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '0';
}

const DIMMED = 0.2;

// ---------- Bühnenplan ----------

export interface StageDrawing {
  items: StageItem[];
  shapes: Shape[];
  cables: StageCable[];
  multicores: MulticoreRoute[];
  background?: Background;
  showCables: boolean;
  /** false = ohne jede Beschriftung (Namen, Multicore-Enden, Texte, Maße) – Helfer-Seite */
  labels?: boolean;
  /** Diese Geräte rot umranden (Helfer-Seite: die eigenen Geräte) */
  highlightIds?: string[];
  /** Gruppenrahmen (optional) */
  groupFrames?: { id: string; name: string; color: string; layerOrder: number; x: number; y: number; width: number; height: number }[];
}

/** Umrandung aller Inhalte in Millimetern (mit Rand). */
export function stageBounds(d: StageDrawing, includeBackground: boolean): Rect | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const i of d.items) {
    const r = Math.max(i.footprint.widthMm, i.footprint.depthMm) / 2;
    xs.push(i.x - r, i.x + r);
    ys.push(i.y - r, i.y + r + 600); // Platz für die Beschriftung
  }
  for (const s of d.shapes) for (const p of s.points) {
    xs.push(p.x);
    ys.push(p.y);
  }
  for (const m of d.multicores) for (const p of [m.a, ...m.waypoints, ...(m.b ? [m.b] : [])]) {
    xs.push(p.x);
    ys.push(p.y);
  }
  if (includeBackground && d.background?.widthPx && d.background.heightPx) {
    const sc = backgroundScale(d.background);
    const o = d.background.offset ?? { x: 0, y: 0 };
    xs.push(o.x, o.x + d.background.widthPx * sc);
    ys.push(o.y, o.y + d.background.heightPx * sc);
  }
  if (!xs.length) return null;
  const pad = 500;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  return { x: minX, y: minY, width: Math.max(...xs) + pad - minX, height: Math.max(...ys) + pad - minY };
}

/**
 * SVG für einen Ausschnitt (Weltkoordinaten in mm). fontMm = Schrifthöhe auf dem Plan in Weltmillimetern.
 * widthPt/heightPt = Größe auf dem Papier.
 */
export function stagePlanSvg(d: StageDrawing, view: Rect, widthPt: number, heightPt: number, fontMm: number, includeBackground: boolean): string {
  const out: string[] = [];
  const stroke = fontMm / 12;
  if (includeBackground && d.background) {
    const bg = d.background;
    const sc = backgroundScale(bg);
    const o = bg.offset ?? { x: 0, y: 0 };
    if (bg.widthPx && bg.heightPx) {
      out.push(`<image href="${bg.image}" x="${n(o.x)}" y="${n(o.y)}" width="${n(bg.widthPx * sc)}" height="${n(bg.heightPx * sc)}" opacity="${n(bg.opacity ?? 0.5)}" preserveAspectRatio="none"/>`);
    }
  }
  // Wände
  for (const s of d.shapes.filter((x) => x.kind === 'wall')) {
    out.push(`<polyline points="${s.points.map((p) => `${n(p.x)},${n(p.y)}`).join(' ')}" fill="none" stroke="#334155" stroke-width="${n(s.strokeWidthMm ?? 200)}" stroke-linecap="square"/>`);
  }
  // Objekte nach Ebenen (unten → oben); Gruppenrahmen direkt unter den Objekten der untersten Ebene ihrer Mitglieder
  const frame = (f: NonNullable<StageDrawing['groupFrames']>[number]) =>
    out.push(
      `<rect x="${n(f.x)}" y="${n(f.y)}" width="${n(f.width)}" height="${n(f.height)}" rx="${n(fontMm)}" fill="${f.color}" fill-opacity="0.08" stroke="${f.color}" stroke-width="${n(stroke * 1.5)}" stroke-dasharray="${n(fontMm)} ${n(fontMm / 2)}"/>` +
        `<text x="${n(f.x + fontMm * 0.6)}" y="${n(f.y + fontMm * 1.3)}" font-size="${n(fontMm)}" font-weight="bold" fill="${f.color}">${esc(f.name)}</text>`,
    );
  d.items.forEach((i, index) => {
    if (index === 0 || d.items[index - 1]!.layerOrder !== i.layerOrder) for (const f of (d.groupFrames ?? []).filter((x) => x.layerOrder === i.layerOrder)) frame(f);
    drawItem(i);
  });
  function drawItem(i: StageDrawing['items'][number]) {
    const { widthMm: w, depthMm: h, form } = i.footprint;
    const opacity = i.dimmed ? DIMMED : 1;
    const fill = i.kind === 'truss' ? '#e2e8f0' : i.kind === 'stand' ? '#f1f5f9' : i.fill;
    const g: string[] = [];
    if (form === 'circle') g.push(`<ellipse cx="0" cy="0" rx="${n(w / 2)}" ry="${n(h / 2)}" fill="${fill}" stroke="#475569" stroke-width="${n(stroke)}"/>`);
    else g.push(`<rect x="${n(-w / 2)}" y="${n(-h / 2)}" width="${n(w)}" height="${n(h)}" rx="${form === 'rounded' ? n(Math.min(w, h) * 0.15) : 0}" fill="${fill}" stroke="#475569" stroke-width="${n(stroke)}"/>`);
    if (i.kind === 'truss') {
      const segs = Math.max(2, Math.round(w / Math.max(h, 200)));
      const pts = Array.from({ length: segs + 1 }, (_, k) => `${n(-w / 2 + (k * w) / segs)},${n(k % 2 === 0 ? -h / 2 : h / 2)}`).join(' ');
      g.push(`<polyline points="${pts}" fill="none" stroke="#64748b" stroke-width="${n(stroke)}"/>`);
    }
    if (i.kind === 'stand') {
      for (const a of [0, 120, 240]) {
        const rad = ((a - 90) * Math.PI) / 180;
        g.push(`<line x1="0" y1="0" x2="${n((Math.cos(rad) * w) / 2)}" y2="${n((Math.sin(rad) * h) / 2)}" stroke="#64748b" stroke-width="${n(stroke)}"/>`);
      }
    }
    out.push(`<g transform="translate(${n(i.x)} ${n(i.y)}) rotate(${n(i.rotation)})" opacity="${opacity}">${g.join('')}</g>`);
    if (d.labels === false) return;
    const lines = [i.device.label, ...(i.person ? [i.person] : []), ...(i.height.heightMm > 0 ? [formatLength(i.height.heightMm)] : [])];
    const ty = i.kind === 'truss' ? i.y - h / 2 - fontMm * (lines.length + 0.2) : i.y + Math.max(w, h) / 2 + fontMm * 1.1;
    lines.forEach((line, k) => {
      out.push(`<text x="${n(i.x)}" y="${n(ty + k * fontMm * 1.15)}" font-size="${n(fontMm)}" text-anchor="middle" fill="#0f172a" opacity="${opacity}">${esc(line)}</text>`);
    });
  }
  // hervorgehobene Geräte
  const highlight = new Set(d.highlightIds ?? []);
  for (const i of d.items.filter((x) => highlight.has(x.device.id))) {
    const r = Math.max(i.footprint.widthMm, i.footprint.depthMm) / 2 + fontMm * 0.6;
    out.push(`<circle cx="${n(i.x)}" cy="${n(i.y)}" r="${n(r)}" fill="none" stroke="#dc2626" stroke-width="${n(stroke * 4)}"/>`);
  }
  // Multicores
  for (const m of d.multicores) {
    const pts = [m.a, ...m.waypoints, ...(m.b ? [m.b] : [])];
    const opacity = m.dimmed ? DIMMED : 1;
    if (pts.length > 1) out.push(`<polyline points="${pts.map((p) => `${n(p.x)},${n(p.y)}`).join(' ')}" fill="none" stroke="${m.color}" stroke-width="${n(stroke * 4)}" stroke-dasharray="${n(fontMm)} ${n(fontMm / 2)}" opacity="${opacity}"/>`);
    const end = (p: { x: number; y: number }, label: string) =>
      out.push(
        `<rect x="${n(p.x - fontMm / 2)}" y="${n(p.y - fontMm / 2)}" width="${n(fontMm)}" height="${n(fontMm)}" fill="${m.color}" opacity="${opacity}"/>` +
          (d.labels === false ? '' : `<text x="${n(p.x + fontMm * 0.8)}" y="${n(p.y + fontMm * 0.35)}" font-size="${n(fontMm)}" fill="#0f172a" opacity="${opacity}">${esc(label)}</text>`),
      );
    end(m.a, `${m.device.label} · ${m.template.endALabel || 'A'}`);
    if (m.b) end(m.b, `${m.device.label} · ${m.template.endBLabel || 'B'}`);
  }
  // Kabel
  if (d.showCables) {
    for (const c of d.cables) {
      const pts: string[] = [];
      for (let k = 0; k < c.points.length; k += 2) pts.push(`${n(c.points[k]!)},${n(c.points[k + 1]!)}`);
      out.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${c.issue ? '#dc2626' : c.color}" stroke-width="${n(stroke * 1.5)}"${c.direct ? ` stroke-dasharray="${n(stroke * 6)} ${n(stroke * 4)}"` : ''} opacity="${c.dimmed ? DIMMED : 1}"/>`);
    }
  }
  // Text und Maßlinien
  for (const s of d.labels === false ? [] : d.shapes) {
    if (s.kind === 'text' && s.points[0]) {
      const p = s.points[0];
      const size = s.fontSizeMm ?? 400;
      out.push(`<text x="${n(p.x)}" y="${n(p.y + size)}" font-size="${n(size)}" fill="#334155" transform="rotate(${n(s.rotationDeg)} ${n(p.x)} ${n(p.y)})">${esc(s.text ?? '')}</text>`);
    } else if (s.kind === 'dimension' && s.points.length >= 2) {
      const [a, b] = [s.points[0]!, s.points[1]!];
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const deg = (angle * 180) / Math.PI;
      const readable = deg > 90 || deg < -90 ? deg + 180 : deg;
      const nx = -Math.sin(angle) * fontMm * 0.5;
      const ny = Math.cos(angle) * fontMm * 0.5;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      out.push(
        `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="#334155" stroke-width="${n(stroke)}"/>` +
          `<line x1="${n(a.x - nx)}" y1="${n(a.y - ny)}" x2="${n(a.x + nx)}" y2="${n(a.y + ny)}" stroke="#334155" stroke-width="${n(stroke)}"/>` +
          `<line x1="${n(b.x - nx)}" y1="${n(b.y - ny)}" x2="${n(b.x + nx)}" y2="${n(b.y + ny)}" stroke="#334155" stroke-width="${n(stroke)}"/>` +
          `<text x="${n(mx)}" y="${n(my - fontMm * 0.4)}" font-size="${n(fontMm)}" text-anchor="middle" fill="#334155" transform="rotate(${n(readable)} ${n(mx)} ${n(my)})">${esc(formatLength(polylineLength([a, b])))}</text>`,
      );
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(widthPt)}" height="${n(heightPt)}" viewBox="${n(view.x)} ${n(view.y)} ${n(view.width)} ${n(view.height)}">${out.join('')}</svg>`;
}

// ---------- Signalfluss ----------

export function signalFlowBounds(boxes: DeviceBox[]): Rect | null {
  if (!boxes.length) return null;
  const minX = Math.min(...boxes.map((b) => b.x)) - 40;
  const minY = Math.min(...boxes.map((b) => b.y)) - 40;
  const maxX = Math.max(...boxes.map((b) => b.x + b.layout.width)) + 40;
  const maxY = Math.max(...boxes.map((b) => b.y + b.layout.height)) + 60;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function signalFlowSvg(
  boxes: DeviceBox[],
  lines: CableLine[],
  view: Rect,
  widthPt: number,
  heightPt: number,
  groupFrames: { id: string; name: string; color: string; x: number; y: number; width: number; height: number }[] = [],
  pageRefs: CrossPageRef[] = [],
  wireless: { senderId: string; receiverId: string; universe: number | undefined }[] = [],
): string {
  const out: string[] = [];
  // Verweise auf Kabel zu anderen Seiten (am Anschluss)
  const byId = new Map(boxes.map((b) => [b.device.id, b]));
  for (const ref of pageRefs) {
    const box = byId.get(ref.deviceId);
    const anchor = box ? anchorOf(box, ref.portId) : undefined;
    if (!anchor) continue;
    const left = anchor.side === 'left';
    out.push(`<text x="${n(left ? anchor.x - 10 : anchor.x + 10)}" y="${n(anchor.y + 3.5)}" font-size="9" fill="#0369a1" text-anchor="${left ? 'end' : 'start'}">–&gt; ${esc(ref.targetPageName)}: ${esc(ref.targetDeviceLabel)}</text>`);
  }
  for (const f of groupFrames) {
    out.push(
      `<rect x="${n(f.x)}" y="${n(f.y)}" width="${n(f.width)}" height="${n(f.height)}" rx="10" fill="${f.color}" fill-opacity="0.1" stroke="${f.color}" stroke-width="1.2" stroke-dasharray="8 4"/>` +
        `<text x="${n(f.x + 10)}" y="${n(f.y + 15)}" font-size="11" font-weight="bold" fill="${f.color}">${esc(f.name)}</text>`,
    );
  }
  for (const l of lines) {
    const style = `fill="none" stroke="${l.issue === 'error' || l.issue === 'warning' ? '#dc2626' : l.color}" stroke-width="1.5"${l.cable.direct ? ' stroke-dasharray="5 3"' : ''} opacity="${l.dimmed ? DIMMED : 1}"`;
    if (l.curved) {
      const [x0, y0, c1x, c1y, c2x, c2y, x1, y1] = l.points.map(n);
      out.push(`<path d="M ${x0} ${y0} C ${c1x} ${c1y} ${c2x} ${c2y} ${x1} ${y1}" ${style}/>`);
      continue;
    }
    const pts: string[] = [];
    for (let k = 0; k < l.points.length; k += 2) pts.push(`${n(l.points[k]!)},${n(l.points[k + 1]!)}`);
    out.push(`<polyline points="${pts.join(' ')}" ${style}/>`);
  }
  // DMX per Funk: gepunktet vom Sender zum Empfänger
  for (const w of wireless) {
    const from = byId.get(w.senderId);
    const to = byId.get(w.receiverId);
    if (!from || !to) continue;
    const a = edgePoint(from, to);
    const b = edgePoint(to, from);
    out.push(`<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="${WIRELESS_COLOR}" stroke-width="2" stroke-linecap="round" stroke-dasharray="0.5 6"/>`);
    out.push(`<text x="${n((a.x + b.x) / 2)}" y="${n((a.y + b.y) / 2 - 5)}" font-size="10" font-weight="bold" fill="${WIRELESS_COLOR}" text-anchor="middle">((·))${w.universe !== undefined ? ` U${w.universe}` : ''}</text>`);
  }
  for (const b of boxes) {
    const g: string[] = [];
    const radius = b.template?.shape?.form === 'rounded' || b.template?.shape?.form === 'circle' ? 10 : 3;
    g.push(`<rect x="0" y="0" width="${n(b.layout.width)}" height="${n(b.layout.height)}" rx="${radius}" fill="${b.fill}" stroke="#334155" stroke-width="0.8"${b.multicore ? ' stroke-dasharray="6 3"' : ''}/>`);
    g.push(`<text x="7" y="18" font-size="11" font-weight="bold" fill="${b.text}">${esc(b.device.label)}</text>`);
    if (b.person) g.push(`<text x="7" y="35" font-size="10" fill="${b.text}">${esc(b.person)}</text>`);
    if (b.dmxLabel) g.push(`<text x="${n(b.layout.width - 7)}" y="18" font-size="9" text-anchor="end" fill="${b.text}">${esc(b.dmxLabel)}</text>`);
    for (const a of b.layout.anchors) {
      const label = b.labels.get(a.port.id) ?? a.port.label;
      if (!a.port.virtual) g.push(`<circle cx="${n(a.x)}" cy="${n(a.y)}" r="3.5" fill="#ffffff" stroke="${ROLE_COLORS[a.port.role]}" stroke-width="1.5"/>`);
      // defekt bzw. per Funk versorgt: rotes X über dem Anschluss
      if (b.defects.has(a.port.id) || b.wirelessIn.has(a.port.id)) {
        const d = 4.5;
        g.push(`<path d="M ${n(a.x - d)} ${n(a.y - d)} L ${n(a.x + d)} ${n(a.y + d)} M ${n(a.x + d)} ${n(a.y - d)} L ${n(a.x - d)} ${n(a.y + d)}" stroke="#dc2626" stroke-width="1.8" stroke-linecap="round"/>`);
      }
      g.push(
        a.port.side === 'left'
          ? `<text x="${n(a.x + 8)}" y="${n(a.y + 3)}" font-size="8.5" fill="${b.text}">${esc(label)}</text>`
          : `<text x="${n(a.x - 8)}" y="${n(a.y + 3)}" font-size="8.5" text-anchor="end" fill="${b.text}">${esc(label)}</text>`,
      );
    }
    out.push(`<g transform="translate(${n(b.x)} ${n(b.y)})" opacity="${b.dimmed ? DIMMED : 1}">${g.join('')}</g>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(widthPt)}" height="${n(heightPt)}" viewBox="${n(view.x)} ${n(view.y)} ${n(view.width)} ${n(view.height)}">${out.join('')}</svg>`;
}

/** Kategorien, die in der Zeichnung vorkommen (für die Legende). */
export function usedCategories(deviceIds: Iterable<string>, data: { devices: { id: string; templateId: string; categoryOverride?: string }[] }, library: Library | null): { name: string; color?: string }[] {
  const ids = new Set(deviceIds);
  const templates = new Map((library?.templates ?? []).map((t) => [t.id, t]));
  const used = new Set<string>();
  for (const d of data.devices) {
    if (!ids.has(d.id)) continue;
    const c = d.categoryOverride ?? templates.get(d.templateId)?.categoryId;
    if (c) used.add(c);
  }
  return (library?.masterData.categories ?? []).filter((c) => used.has(c.id)).map((c) => ({ name: c.name, ...(c.color ? { color: c.color } : {}) }));
}
