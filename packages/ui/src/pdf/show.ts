// PDF der Regie (M11e): Ablaufplan, Lichtszenen (Raster als Bild + Tabelle je Szene), Textbuch.
import {
  contrastText,
  formatDuration,
  gridLayout,
  itemLines,
  itemScenes,
  itemSections,
  lightDevices,
  personName,
  sceneStates,
  sceneTime,
  showSchedule,
  type FixtureState,
  type GridLayout,
  type Library,
  type LightGrid,
  type LightTarget,
  type ShowItem,
} from '@steckplan/core';
import type { ProjectData } from '../lib/useProjectData';
import { texts } from '../texts';
import { base, fitText, pageSize, pdfText, MARGIN, type DocContext, type DocDefinition } from './documents';

type Content = unknown;
const KIND = texts.regie.kinds;
const F = texts.light.fixture;

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** „1:12.5“ */
function sceneClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0').replace(/\.0$/, '')}`;
}

// ---------- Ablaufplan ----------

export function showPlanDoc(data: ProjectData, ctx: DocContext): DocDefinition {
  const items = data.show.items;
  const schedule = showSchedule(items, data.showSettings);
  const people = new Map(data.people.map((p) => [p.id, personName(p)]));
  const rows = items.map((item, i) => {
    const entry = schedule.entries.get(item.id);
    const sceneCount = itemScenes(data.lightScenes, item.id).length;
    return [
      { text: String(i + 1), alignment: 'right', bold: true },
      entry?.clock ?? `+${formatDuration(entry?.offsetSec ?? 0)}`,
      KIND[item.kind],
      { text: [{ text: pdfText(item.title || texts.regie.untitled), bold: true }, item.artist ? { text: `\n${pdfText(item.artist)}`, style: 'small' } : ''] },
      item.durationSec !== undefined ? formatDuration(item.durationSec) : '–',
      pdfText(item.personIds.map((id) => people.get(id)).filter(Boolean).join(', ')),
      sceneCount ? String(sceneCount) : '',
      pdfText(item.notes ?? ''),
    ];
  });
  const summary = [
    data.showSettings.startTime ? `Beginn ${data.showSettings.startTime}` : '',
    `${items.length} Einträge`,
    `Gesamt ${formatDuration(schedule.totalSec)}${schedule.missingDurations ? ` (${schedule.missingDurations} ohne Dauer)` : ''}`,
  ].filter(Boolean);
  const content: Content[] = [
    { text: 'Ablaufplan', style: 'title' },
    { text: summary.join('   ·   '), margin: [0, 0, 0, 8] },
    items.length === 0
      ? { text: 'Der Ablauf ist leer.', italics: true, color: '#64748b' }
      : {
          table: {
            headerRows: 1,
            widths: [18, 34, 52, '*', 34, 90, 30, '*'],
            body: [['Nr.', 'Beginn', 'Art', 'Titel', 'Dauer', 'Personen', 'Szenen', 'Notiz'].map((h) => ({ text: h, style: 'th' })), ...rows],
          },
          layout: { hLineWidth: () => 0.4, vLineWidth: () => 0, hLineColor: () => '#cbd5e1', fillColor: (i: number) => (i > 0 && items[i - 1]?.kind === 'break' ? '#f1f5f9' : null), paddingTop: () => 4, paddingBottom: () => 4 },
        },
  ];
  return base(ctx, 'Ablaufplan', content);
}

// ---------- Lichtszenen ----------

/** Farbe mit Grau mischen (Helligkeit) – im PDF gibt es kein color-mix */
function blend(hex: string, strength: number, bg = '#f1f5f9'): string {
  const parse = (h: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
    const v = m ? parseInt(m[1]!, 16) : 0xffffff;
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  };
  const a = parse(hex);
  const b = parse(bg);
  const mix = a.map((c, i) => Math.round(c * strength + b[i]! * (1 - strength)));
  return `#${mix.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function fixtureFill(state: FixtureState | undefined): { fill: string; text: string; dashed: boolean; off: boolean } {
  if (!state || (state.dimmer === undefined && !state.color)) return { fill: '#ffffff', text: '#0f172a', dashed: true, off: false };
  if (state.dimmer === 0) return { fill: '#1e293b', text: '#94a3b8', dashed: false, off: true };
  const hex = state.color?.hex ?? '#fef3c7';
  const strength = state.dimmer === undefined ? 1 : 0.35 + state.dimmer * 0.0065;
  const fill = blend(hex, strength);
  return { fill, text: strength >= 0.7 ? contrastText(hex) : '#0f172a', dashed: false, off: false };
}

/** Raster einer Szene als SVG (Breite in pt); nicht platzierte Geräte in einer Zeile darunter */
export function sceneGridSvg(grid: LightGrid, layout: GridLayout, states: Map<string, FixtureState>, targets: LightTarget[], widthPt: number): { svg: string; height: number; width: number } {
  const labelW = 64;
  const cellH = 40;
  const gap = 3;
  const extraRows = layout.unplaced.length ? Math.ceil(layout.unplaced.length / grid.cols) : 0;
  const rows = grid.rows + extraRows;
  // Felder höchstens 110 pt breit (sonst werden sie bei wenigen Spalten riesig)
  const cellW = Math.min(110, (widthPt - labelW - gap * grid.cols) / grid.cols);
  const usedWidth = labelW + grid.cols * (cellW + gap);
  const height = rows * (cellH + gap) + (extraRows ? 10 : 0);
  const targetById = new Map(targets.map((x) => [x.id, x]));
  const out: string[] = [];
  const font = Math.max(5, Math.min(7.5, cellW / 9));
  const place = (device: { id: string; label: string }, col: number, row: number, yOffset = 0) => {
    const x = labelW + col * (cellW + gap);
    const y = row * (cellH + gap) + yOffset;
    const state = states.get(device.id);
    const look = fixtureFill(state);
    out.push(`<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="3" fill="${look.fill}" stroke="#94a3b8" stroke-width="0.6"${look.dashed ? ' stroke-dasharray="2 1.5"' : ''}/>`);
    const fit = (text: string, size: number, bold = false) => esc(pdfText(fitText(text, size, cellW - 6, bold)));
    out.push(`<text x="${x + 3}" y="${y + font + 2}" font-size="${font}" font-weight="bold" fill="${look.text}">${fit(device.label, font, true)}</text>`);
    const second = !state ? '–' : look.off ? 'aus' : [state.dimmer !== undefined ? `${state.dimmer} %` : '', state.color?.name ?? ''].filter(Boolean).join(' · ');
    out.push(`<text x="${x + 3}" y="${y + font * 2 + 3}" font-size="${font * 0.9}" fill="${look.text}">${fit(second, font * 0.9)}</text>`);
    if (state?.gobo) out.push(`<text x="${x + 3}" y="${y + font * 3 + 3.5}" font-size="${font * 0.9}" fill="${look.text}">${fit(`Gobo ${state.gobo.name}`, font * 0.9)}</text>`);
    const target = state?.targetId ? targetById.get(state.targetId) : undefined;
    if (target) {
      const color = target.color ?? '#e11d48';
      out.push(`<rect x="${x + 2}" y="${y + cellH - font - 4}" width="${cellW - 4}" height="${font + 2}" rx="1.5" fill="${color}"/>`);
      out.push(`<text x="${x + 4}" y="${y + cellH - 4}" font-size="${font * 0.9}" font-weight="bold" fill="#ffffff">${fit(`-> ${target.name}`, font * 0.9, true)}</text>`);
    }
  };
  for (let r = 0; r < grid.rows; r++) {
    const label = grid.rowLabels[r] ?? '';
    if (label) out.push(`<text x="0" y="${r * (cellH + gap) + cellH / 2 + 3}" font-size="7" fill="#475569">${esc(pdfText(fitText(label, 7, labelW - 4)))}</text>`);
    for (let c = 0; c < grid.cols; c++) {
      if (!layout.placed.some((p) => p.col === c && p.row === r)) {
        out.push(`<rect x="${labelW + c * (cellW + gap)}" y="${r * (cellH + gap)}" width="${cellW}" height="${cellH}" rx="3" fill="none" stroke="#e2e8f0" stroke-width="0.5" stroke-dasharray="2 2"/>`);
      }
    }
  }
  for (const p of layout.placed) place(p.device, p.col, p.row);
  if (extraRows) {
    const top = grid.rows * (cellH + gap) + 10;
    out.push(`<text x="0" y="${top + cellH / 2 + 3}" font-size="7" fill="#475569">Nicht im Raster</text>`);
    layout.unplaced.forEach((d, i) => place(d, i % grid.cols, Math.floor(i / grid.cols), top));
  }
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${usedWidth}" height="${height}" viewBox="0 0 ${usedWidth} ${height}">${out.join('')}</svg>`, height, width: usedWidth };
}

/** Werte eines Geräts als Tabellenzeile */
function stateCells(state: FixtureState, targets: Map<string, string>): string[] {
  const more = [
    state.prism ? 'Prisma' : '',
    state.zoomDeg !== undefined ? `Zoom ${state.zoomDeg}°` : '',
    state.focus !== undefined ? `Fokus ${state.focus} %` : '',
    state.iris !== undefined ? `Iris ${state.iris} %` : '',
    state.frost !== undefined ? `Frost ${state.frost} %` : '',
    state.strobeHz !== undefined ? `Strobe ${state.strobeHz} Hz` : '',
  ].filter(Boolean);
  return [
    state.dimmer === undefined ? '' : state.dimmer === 0 ? 'aus' : `${state.dimmer} %`,
    state.color ? (state.color.name ?? state.color.hex) : '',
    state.gobo ? `${state.gobo.name}${state.gobo.rotate ? ` (${F.rotations[state.gobo.rotate]})` : ''}` : '',
    state.targetId ? (targets.get(state.targetId) ?? '?') : '',
    state.effect ? `${F.effects[state.effect.kind]}${state.effect.speed ? `, ${F.speeds[state.effect.speed]}` : ''}${state.effect.text ? `: ${state.effect.text}` : ''}` : '',
    more.join(', '),
    state.notes ?? '',
  ].map(pdfText);
}

function triggerText(scene: { atSec?: number; lineId?: string }, lines: { id: string; text: string; atSec?: number }[]): string {
  const line = scene.lineId ? lines.find((l) => l.id === scene.lineId) : undefined;
  const parts = [scene.atSec !== undefined ? sceneClock(scene.atSec) : '', line ? `bei „${line.text}“${scene.atSec === undefined && line.atSec !== undefined ? ` (${sceneClock(line.atSec)})` : ''}` : ''].filter(Boolean);
  return parts.join(' · ');
}

export function lightScenesDoc(data: ProjectData, library: Library, ctx: DocContext): DocDefinition {
  const templates = new Map(library.templates.map((t) => [t.id, t]));
  const lights = lightDevices(data.devices, templates);
  const layout = gridLayout(lights, data.lightPlacements, data.lightGrid);
  const targetNames = new Map(data.lightTargets.map((t) => [t.id, t.name]));
  const width = pageSize(ctx.format, ctx.orientation).width - MARGIN.left - MARGIN.right;
  const content: Content[] = [{ text: 'Lichtszenen', style: 'title' }];
  if (data.lightTargets.length) {
    content.push({
      text: [{ text: 'Ziele: ', bold: true }, ...data.lightTargets.flatMap((t, i) => [{ text: '● ', color: t.color ?? '#e11d48' }, { text: `${pdfText(t.name)}${i < data.lightTargets.length - 1 ? '   ' : ''}` }])],
      margin: [0, 0, 0, 6],
    });
  }
  const withScenes = data.show.items.filter((item) => itemScenes(data.lightScenes, item.id).length > 0);
  if (withScenes.length === 0) content.push({ text: 'Noch keine Lichtszenen.', italics: true, color: '#64748b' });
  withScenes.forEach((item, itemIndex) => {
    const scenes = itemScenes(data.lightScenes, item.id);
    const lines = itemLines(data.show.sections, item.id).map((l) => l.line);
    content.push({ text: `${data.show.items.indexOf(item) + 1}. ${pdfText(item.title || texts.regie.untitled)}`, style: 'group', ...(itemIndex > 0 ? { pageBreak: 'before' } : {}) });
    scenes.forEach((scene, i) => {
      const states = sceneStates(data.sceneStates, scene.id);
      const grid = sceneGridSvg(data.lightGrid, layout, states, data.lightTargets, width);
      const trigger = triggerText(scene, lines);
      const rows = lights.filter((d) => states.has(d.id)).map((d) => [{ text: pdfText(d.label), bold: true }, ...stateCells(states.get(d.id)!, targetNames)]);
      content.push({
        unbreakable: grid.height < 320,
        stack: [
          { text: [{ text: `Szene ${i + 1}: ${pdfText(scene.name || '–')}`, bold: true }, trigger ? { text: `   ${pdfText(trigger)}`, color: '#475569' } : ''], margin: [0, 8, 0, 2] },
          ...(scene.notes ? [{ text: pdfText(scene.notes), style: 'small', margin: [0, 0, 0, 3] }] : []),
          { svg: grid.svg, width: grid.width, margin: [0, 2, 0, 4] },
          rows.length
            ? {
                table: {
                  headerRows: 1,
                  widths: [60, 40, 52, 64, 56, '*', '*', '*'],
                  body: [['Gerät', 'Hell.', 'Farbe', 'Gobo', 'Ziel', 'Bewegung', 'Weitere', 'Notiz'].map((h) => ({ text: h, style: 'th' })), ...rows],
                },
                layout: { hLineWidth: () => 0.4, vLineWidth: () => 0, hLineColor: () => '#cbd5e1', paddingTop: () => 2, paddingBottom: () => 2 },
                fontSize: 8,
              }
            : { text: 'Keine Werte in dieser Szene.', italics: true, color: '#64748b', fontSize: 8 },
        ],
      });
    });
  });
  return base(ctx, 'Lichtszenen', content);
}

// ---------- Textbuch ----------

export function scriptBookDoc(data: ProjectData, ctx: DocContext): DocDefinition {
  const content: Content[] = [{ text: 'Textbuch', style: 'title' }];
  const people = new Map(data.people.map((p) => [p.id, personName(p)]));
  const items = data.show.items;
  if (items.length === 0) content.push({ text: 'Der Ablauf ist leer.', italics: true, color: '#64748b' });
  items.forEach((item: ShowItem, index) => {
    const sections = itemSections(data.show.sections, item.id);
    const scenes = itemScenes(data.lightScenes, item.id);
    const lines = itemLines(data.show.sections, item.id).map((l) => l.line);
    const roles = new Map((item.roles ?? []).map((r) => [r.id, r]));
    // Szenen, die an einer Zeile hängen, kommen an den Rand dieser Zeile; die übrigen an den Anfang
    const atLine = new Map<string, string[]>();
    const loose: string[] = [];
    scenes.forEach((s, i) => {
      const label = `Szene ${i + 1}: ${s.name || '–'}`;
      if (s.lineId && lines.some((l) => l.id === s.lineId)) atLine.set(s.lineId, [...(atLine.get(s.lineId) ?? []), label]);
      else {
        const at = sceneTime(s, lines);
        loose.push(at !== undefined ? `${label} (${sceneClock(at)})` : label);
      }
    });
    const header: Content[] = [
      {
        text: [{ text: `${index + 1}. ${pdfText(item.title || texts.regie.untitled)}`, bold: true, fontSize: 12 }, { text: `   ${KIND[item.kind]}${item.artist ? ` · ${pdfText(item.artist)}` : ''}`, color: '#64748b' }],
        margin: [0, index > 0 ? 14 : 4, 0, 2],
      },
    ];
    if (item.roles?.length) {
      header.push({ text: pdfText(item.roles.map((r) => (r.personId && people.get(r.personId) ? `${r.name} – ${people.get(r.personId)}` : r.name)).join(' · ')), style: 'small', margin: [0, 0, 0, 2] });
    }
    if (loose.length) header.push({ text: pdfText(loose.join('  ·  ')), color: '#b45309', fontSize: 8, margin: [0, 0, 0, 2] });
    content.push(...header);
    let speaker: string | undefined;
    for (const section of sections) {
      content.push({ text: pdfText(section.label), bold: true, color: '#334155', fontSize: 9, margin: [0, 6, 0, 1] });
      for (const line of section.lines) {
        const marks = atLine.get(line.id);
        const role = line.roleId ? roles.get(line.roleId) : undefined;
        const showRole = !!role && !line.direction && line.roleId !== speaker;
        speaker = line.direction ? undefined : line.roleId;
        content.push({
          columns: [
            { width: 82, text: marks ? pdfText(marks.join('\n')) : '', fontSize: 7, color: '#b45309', bold: true },
            {
              width: '*',
              text: line.direction
                ? { text: `(${pdfText(line.text)})`, italics: true, color: '#475569' }
                : [showRole ? { text: `${pdfText(role!.name)}: `, bold: true } : '', pdfText(line.text)],
            },
          ],
          columnGap: 6,
          margin: [0, 0.5, 0, 0.5],
        });
      }
    }
    if (sections.length === 0 && item.notes) content.push({ text: pdfText(item.notes), italics: true, color: '#475569' });
  });
  return base(ctx, 'Textbuch', content);
}

