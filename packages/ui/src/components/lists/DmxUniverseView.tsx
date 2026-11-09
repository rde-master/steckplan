// DMX-Patch grafisch: je Universum die 512 Kanäle als Raster, Geräte als farbige Balken,
// Überlappungen rot schraffiert, Auslastung und freie Bereiche. Klick auf ein Gerät zeigt Details.
// Bearbeiten per Ziehen: Geräte innerhalb eines Universums bzw. in ein anderes verschieben; nicht gepatchte Geräte
// stehen oben und werden von dort in den Patch gezogen (zurückziehen entfernt die Adresse); unten ein neues Universum.
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

/** laufendes Ziehen: Gerät, gegriffener Kanal relativ zum Start, Zahl der Kanäle */
export interface DmxDrag {
  id: string;
  offset: number;
  channels: number;
  patched: boolean;
}

/** Startadresse, wenn der gegriffene Kanal auf channel liegt (passend ins Universum) */
export function dropAddress(channel: number, drag: Pick<DmxDrag, 'offset' | 'channels'>): number {
  return Math.min(Math.max(1, DMX_CHANNELS - drag.channels + 1), Math.max(1, channel - drag.offset));
}

export function DmxUniverseView({
  rows,
  editable = false,
  channelsFor = () => 1,
  onPatch,
}: {
  rows: DmxPatchRow[];
  editable?: boolean;
  /** Kanäle eines Geräts (nicht gepatcht: erster Modus) */
  channelsFor?: (id: string) => number;
  /** Gerät patchen bzw. (null) aus dem Patch nehmen */
  onPatch?: (id: string, at: { universe: number; address: number } | null) => void;
}) {
  const narrow = useIsNarrow(700);
  const cols = narrow ? 16 : 32;
  const universes = dmxUniverses(rows);
  const unaddressed = rows.filter((r) => r.universe === undefined || r.address === undefined || r.end === undefined);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<DmxDrag | null>(null);
  const [hover, setHover] = useState<{ universe: number; start: number } | null>(null);
  const canDrag = editable && !!onPatch;
  const end = () => {
    setDrag(null);
    setHover(null);
  };
  const dropAt = (universe: number, channel: number) => {
    if (!drag || !onPatch) return;
    onPatch(drag.id, { universe, address: dropAddress(channel, drag) });
    setSelected(drag.id);
    end();
  };
  const nextUniverse = Math.max(0, ...universes.map((u) => u.universe)) + 1;
  const dragProps = { cols, drag: canDrag ? drag : null, hover, setHover, dropAt, startDrag: canDrag ? setDrag : null, endDrag: end };
  return (
    <div className="space-y-4" data-testid="dmx-universes">
      {(unaddressed.length > 0 || (drag?.patched ?? false)) && (
        <section
          className={`rounded-lg border p-3 ${drag?.patched ? 'border-dashed border-sky-500 bg-sky-50 dark:bg-sky-950/40' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`}
          data-testid="dmx-unaddressed"
          onDragOver={(e) => {
            if (drag?.patched) e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (drag?.patched && onPatch) onPatch(drag.id, null);
            end();
          }}
        >
          <div className="mb-2 text-sm font-medium">
            {d.universeView.unaddressed}
            {canDrag && <span className="ml-2 text-xs font-normal text-slate-500">{d.universeView.dragHint}</span>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {unaddressed.map((r) => (
              <span
                key={r.id}
                draggable={canDrag}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', r.id);
                  e.dataTransfer.effectAllowed = 'move';
                  setDrag({ id: r.id, offset: 0, channels: channelsFor(r.id), patched: false });
                }}
                onDragEnd={end}
                className={`rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800 ${canDrag ? 'cursor-grab active:cursor-grabbing' : ''}`}
                data-testid="dmx-unpatched"
                data-device={r.id}
              >
                <span className="font-medium">{r.label}</span> <span className="text-slate-500">· {channelsFor(r.id)} {d.universeView.channels}</span>
              </span>
            ))}
            {unaddressed.length === 0 && <span className="text-xs text-slate-500">{d.universeView.dropToUnpatch}</span>}
          </div>
        </section>
      )}
      {universes.map((u) => (
        <Universe key={u.universe} map={u} selected={selected} onSelect={(id) => setSelected(selected === id ? null : id)} {...dragProps} />
      ))}
      {canDrag && (
        <div
          className={`rounded-lg border-2 border-dashed p-4 text-center text-sm ${drag ? 'border-sky-500 text-sky-700 dark:text-sky-300' : 'border-slate-300 text-slate-500 dark:border-slate-600'}`}
          data-testid="dmx-new-universe"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (drag) dropAt(nextUniverse, 1 + drag.offset);
          }}
        >
          {d.universeView.newUniverse(nextUniverse)}
        </div>
      )}
    </div>
  );
}

interface DragProps {
  cols: number;
  drag: DmxDrag | null;
  hover: { universe: number; start: number } | null;
  setHover: (h: { universe: number; start: number } | null) => void;
  dropAt: (universe: number, channel: number) => void;
  startDrag: ((d: DmxDrag) => void) | null;
  endDrag: () => void;
}

function Universe({ map, cols, selected, onSelect, drag, hover, setHover, dropAt, startDrag, endDrag }: { map: DmxUniverseMap; selected: string | null; onSelect: (id: string) => void } & DragProps) {
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
              data-testid="dmx-row"
              data-start={r * cols + 1}
              onDragOver={(e) => {
                if (!drag) return;
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                const channel = r * cols + Math.min(cols - 1, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * cols))) + 1;
                const start = dropAddress(channel, drag);
                if (hover?.universe !== map.universe || hover.start !== start) setHover({ universe: map.universe, start });
              }}
              onDrop={(e) => {
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                dropAt(map.universe, r * cols + Math.min(cols - 1, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * cols))) + 1);
              }}
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
              draggable={!!startDrag}
              onDragStart={(e) => {
                if (!startDrag) return;
                e.dataTransfer.setData('text/plain', s.row.id);
                e.dataTransfer.effectAllowed = 'move';
                // gegriffener Kanal → Abstand zum Start bleibt beim Ablegen
                const rect = e.currentTarget.getBoundingClientRect();
                const grabbed = p.row * cols + p.col + Math.min(p.span - 1, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * p.span)));
                startDrag({ id: s.row.id, offset: grabbed - s.start, channels: (s.row.end ?? s.end) - s.start + 1, patched: true });
              }}
              onDragEnd={endDrag}
              data-testid="dmx-segment"
              data-device={s.row.id}
              className={`relative z-10 m-px flex min-w-0 items-center overflow-hidden rounded-sm px-1 text-left leading-tight font-medium ${drag ? 'pointer-events-none' : ''} ${drag?.id === s.row.id ? 'opacity-40' : ''} ${startDrag ? 'cursor-grab active:cursor-grabbing' : ''} ${isSelected ? 'ring-2 ring-slate-900 ring-offset-1 dark:ring-white' : ''} ${s.overflow ? 'outline-2 outline-red-600' : ''}`}
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
        {/* Vorschau beim Ziehen */}
        {drag &&
          hover?.universe === map.universe &&
          pieces(hover.start, Math.min(DMX_CHANNELS, hover.start + drag.channels - 1), cols).map((p) => (
            <div key={`v${p.row}`} className="pointer-events-none z-30 rounded-sm border-2 border-dashed border-sky-500 bg-sky-400/30" style={place(p)} data-testid="dmx-drop-preview" />
          ))}
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
