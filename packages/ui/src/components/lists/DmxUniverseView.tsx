// DMX-Patch grafisch: je Universum die 512 Kanäle als Raster, Geräte als farbige Balken,
// Überlappungen rot schraffiert, Auslastung und freie Bereiche. Klick auf ein Gerät zeigt Details.
import { useState, type CSSProperties } from 'react';
import { contrastText, DMX_CHANNELS, dmxUniverses, formatDmx, type DmxPatchRow, type DmxUniverseMap } from '@steckplan/core';
import { useIsNarrow } from '../../lib/useProjectDoc';
import { texts } from '../../texts';

const d = texts.techLists;

/** gut unterscheidbare Farben, nebeneinanderliegende Geräte wechseln ab */
const PALETTE = ['#0284c7', '#f59e0b', '#16a34a', '#db2777', '#7c3aed', '#0d9488', '#ea580c', '#4f46e5', '#65a30d', '#be123c'];

interface Piece {
  row: number;
  col: number;
  span: number;
  first: boolean;
}

/** Bereich start … end auf Rasterzeilen mit cols Kanälen aufteilen */
function pieces(start: number, end: number, cols: number): Piece[] {
  const result: Piece[] = [];
  for (let r = Math.floor((start - 1) / cols); r <= Math.floor((end - 1) / cols); r++) {
    const from = Math.max(start, r * cols + 1);
    const to = Math.min(end, (r + 1) * cols);
    result.push({ row: r, col: from - r * cols, span: to - from + 1, first: from === start });
  }
  return result;
}

const place = (p: Piece): CSSProperties => ({ gridRow: p.row + 2, gridColumn: `${p.col + 1} / span ${p.span}` });

const ROW_REM = 1.5;

/** Spuren für überlappende Geräte: jedes Gerät in die erste Spur, in der es frei ist */
function lanes(segments: DmxUniverseMap['segments']): { lane: Map<string, number>; count: number } {
  const ends: number[] = [];
  const lane = new Map<string, number>();
  for (const s of segments) {
    let i = ends.findIndex((end) => end < s.start);
    if (i < 0) i = ends.push(0) - 1;
    ends[i] = s.end;
    lane.set(s.row.id, i);
  }
  return { lane, count: Math.max(1, ends.length) };
}

export function DmxUniverseView({ rows }: { rows: DmxPatchRow[] }) {
  const narrow = useIsNarrow(700);
  const cols = narrow ? 16 : 32;
  const universes = dmxUniverses(rows);
  const unaddressed = rows.filter((r) => r.universe === undefined || r.address === undefined || r.end === undefined);
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="space-y-4" data-testid="dmx-universes">
      {universes.map((u) => (
        <Universe key={u.universe} map={u} cols={cols} selected={selected} onSelect={(id) => setSelected(selected === id ? null : id)} />
      ))}
      {unaddressed.length > 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-300" data-testid="dmx-unaddressed">
          <span className="font-medium">{d.universeView.unaddressed}:</span> {unaddressed.map((r) => r.label).join(', ')}
        </p>
      )}
    </div>
  );
}

function Universe({ map, cols, selected, onSelect }: { map: DmxUniverseMap; cols: number; selected: string | null; onSelect: (id: string) => void }) {
  const u = d.universeView;
  const percent = Math.round((map.used / DMX_CHANNELS) * 100);
  const lines = DMX_CHANNELS / cols;
  const largestFree = [...map.free].sort((a, b) => b.end - b.start - (a.end - a.start)).slice(0, 3);
  const chosen = map.segments.find((s) => s.row.id === selected);
  const overlapsWith = chosen ? map.segments.filter((s) => s !== chosen && s.start <= chosen.end && chosen.start <= s.end) : [];
  const grid = 'rgb(148 163 184 / 0.35)';
  const { lane, count: laneCount } = lanes(map.segments);
  // bei Überlappungen teilen sich die Geräte die Zeilenhöhe (übereinander)
  const rowRem = laneCount > 1 ? 0.8 * ROW_REM * laneCount : ROW_REM;
  const laneRem = rowRem / laneCount;
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900" aria-label={`${u.universe} ${map.universe}`} data-testid="dmx-universe">
      <header className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <h3 className="font-semibold">
          {u.universe} {map.universe}
        </h3>
        <div className="flex min-w-48 flex-1 items-center gap-2 text-sm">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="meter" aria-valuemin={0} aria-valuemax={DMX_CHANNELS} aria-valuenow={map.used} aria-label={u.used}>
            <div className={`h-full rounded-full ${percent >= 90 ? 'bg-amber-500' : 'bg-sky-600'}`} style={{ width: `${percent}%` }} />
          </div>
          <span className="whitespace-nowrap tabular-nums text-slate-600 dark:text-slate-300" data-testid="dmx-used">
            {u.usedText(map.used, percent)}
          </span>
        </div>
        {map.overlaps.length > 0 && (
          <span className="rounded-full bg-red-100 px-2 text-xs font-medium text-red-900 dark:bg-red-950 dark:text-red-200" data-testid="dmx-overlaps">
            {u.overlaps(map.overlaps.map((o) => (o.start === o.end ? `${o.start}` : `${o.start}–${o.end}`)).join(', '))}
          </span>
        )}
      </header>

      <div
        className="grid gap-y-0.5 text-[10px] select-none"
        style={{ gridTemplateColumns: `2.25rem repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `auto repeat(${lines}, ${rowRem}rem)` }}
        role="img"
        aria-label={u.gridLabel(map.universe, map.segments.length)}
      >
        {/* Kanalnummern oben */}
        {Array.from({ length: cols }, (_, i) => (
          <div key={`h${i}`} className="text-center tabular-nums text-slate-400" style={{ gridRow: 1, gridColumn: i + 2 }}>
            {i === 0 || (i + 1) % 4 === 0 ? i + 1 : ''}
          </div>
        ))}
        {/* Zeilen: Startkanal links, freie Kanäle als Raster */}
        {Array.from({ length: lines }, (_, r) => (
          <div key={`r${r}`} className="contents">
            <div className="self-center pr-1 text-right tabular-nums text-slate-400" style={{ gridRow: r + 2, gridColumn: 1 }}>
              {r * cols + 1}
            </div>
            <div
              className="rounded-sm bg-slate-50 dark:bg-slate-800/60"
              style={{
                gridRow: r + 2,
                gridColumn: `2 / span ${cols}`,
                backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent calc(100% / ${cols} - 1px), ${grid} calc(100% / ${cols} - 1px), ${grid} calc(100% / ${cols}))`,
              }}
            />
          </div>
        ))}
        {/* Geräte */}
        {map.segments.map((s, i) => {
          const color = PALETTE[i % PALETTE.length]!;
          const isSelected = selected === s.row.id;
          const l = lane.get(s.row.id) ?? 0;
          const laneStyle: CSSProperties = laneCount > 1 ? { alignSelf: 'start', height: `calc(${laneRem}rem - 2px)`, marginTop: `calc(${l * laneRem}rem + 1px)` } : {};
          const title = `${s.row.label} · ${formatDmx(map.universe, s.start)}–${s.row.end} · ${s.row.modeName} (${s.row.channels})`;
          return pieces(s.start, s.end, cols).map((p) => (
            <button
              key={`${s.row.id}-${p.row}`}
              type="button"
              title={title}
              aria-label={title}
              aria-pressed={isSelected}
              onClick={() => onSelect(s.row.id)}
              data-testid="dmx-segment"
              data-device={s.row.id}
              className={`relative z-10 m-px flex min-w-0 items-center overflow-hidden rounded-sm px-1 text-left leading-tight font-medium ${isSelected ? 'ring-2 ring-slate-900 ring-offset-1 dark:ring-white' : ''} ${s.overflow ? 'outline-2 outline-red-600' : ''}`}
              style={{ ...place(p), ...laneStyle, backgroundColor: color, color: contrastText(color) }}
            >
              <span className="truncate">
                {p.first ? (
                  <>
                    <span className="tabular-nums opacity-80">{s.start}</span> {s.row.label}
                  </>
                ) : (
                  <span className="opacity-80">… {s.row.label}</span>
                )}
              </span>
            </button>
          ));
        })}
        {/* Überlappungen */}
        {map.overlaps.flatMap((o) =>
          pieces(o.start, o.end, cols).map((p) => (
            <div
              key={`o${o.start}-${p.row}`}
              className="pointer-events-none z-20 rounded-sm border-2 border-red-600"
              style={{ ...place(p), backgroundImage: 'repeating-linear-gradient(45deg, rgb(220 38 38 / 0.3) 0 2px, transparent 2px 7px)' }}
              data-testid="dmx-overlap"
            />
          )),
        )}
      </div>

      {chosen && (
        <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-sm dark:border-slate-700 dark:bg-slate-800" data-testid="dmx-detail">
          <div className="font-semibold">{chosen.row.label}</div>
          <div className="text-slate-600 dark:text-slate-300">
            {chosen.row.templateName} · {chosen.row.modeName} ({chosen.row.channels} {u.channels}) · {formatDmx(map.universe, chosen.start)}–{chosen.row.end}
            {chosen.row.carrier ? ` · ${chosen.row.carrier}` : ''}
          </div>
          {chosen.overflow > 0 && <div className="text-red-700 dark:text-red-400">{u.overflow(chosen.overflow)}</div>}
          {overlapsWith.length > 0 && <div className="text-red-700 dark:text-red-400">{u.overlapsWith(overlapsWith.map((s) => s.row.label).join(', '))}</div>}
        </div>
      )}

      <p className="mt-2 text-xs text-slate-500">
        {map.free.length === 0 ? u.full : u.free(largestFree.map((f) => `${f.start}–${f.end} (${f.end - f.start + 1})`).join(', '))}
      </p>
    </section>
  );
}
