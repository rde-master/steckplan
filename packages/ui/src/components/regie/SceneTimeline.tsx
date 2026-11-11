// Zeitleiste über den Licht- bzw. Tonszenen: jede Szene mit Startpunkt als Block bis zur nächsten. Block ziehen
// verschiebt die Szene (ihre Länge bleibt, die vorige wird länger bzw. kürzer, die folgende entsprechend); den linken
// Rand ziehen verschiebt nur die Grenze – die Szene wird länger, die vorige kürzer (und umgekehrt). Raster 0,1 s,
// nie über die Nachbarn hinaus. Klick wählt die Szene und springt dorthin. Mausrad verschiebt (gezoomt),
// Strg + Mausrad bzw. Lupen zoomen. Darunter auf Wunsch die Wellenform.
import { ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Transport, type Playback } from '../../lib/transport';
import { texts } from '../../texts';
import { ICON } from '../icons';
import { Button } from '../ui';
import { formatSceneTime } from './ScenesSection';
import { usePlayerTime, usePlayerValue, usePlaying, type TimeSource } from '../../lib/playerTime';
import { Playhead, PLAYHEAD_RED } from './Playhead';
import { seekAudio, usePlaybackState } from './SongMedia';
import { TimelineScrollbar } from './TimelineScrollbar';
import { Waveform, WaveformControls, useWaveformSettings } from './Waveform';

const t = texts.regie.sceneTimeline;

export interface SceneTimelineScene {
  id: string;
  /** Nummer in der Szenenliste */
  number: number;
  name: string;
  /** Startpunkt (Sekunden) – ohne Auslöser undefined */
  at: number | undefined;
}

const ROUND = (sec: number) => Math.round(sec * 10) / 10;
const GAP = 0.1;
const MIN_SPAN = 2;

interface Drag {
  mode: 'body' | 'edge';
  /** Index in der zeitlich sortierten Liste */
  index: number;
  startX: number;
  /** Sekunden je Pixel beim Start */
  perPx: number;
  /** Startpunkte beim Start (sortiert) */
  orig: number[];
  delta: number;
  moved: boolean;
}

/** Erlaubte Verschiebung (Sekunden) für das Ziehen eines Blocks bzw. seines linken Rands */
export function dragBounds(times: number[], index: number, mode: 'body' | 'edge', total: number): { min: number; max: number } {
  const at = times[index]!;
  const prev = times[index - 1];
  const next = times[index + 1];
  const min = (prev !== undefined ? prev + GAP : 0) - at;
  let max: number;
  if (mode === 'edge' || next === undefined) max = (next !== undefined ? next - GAP : total - GAP) - at;
  else {
    // ganzer Block: der Beginn der folgenden Szene wandert mit
    const after = times[index + 2];
    max = (after !== undefined ? after - GAP : total - GAP) - next;
  }
  return { min: Math.min(0, ROUND(min)), max: Math.max(0, ROUND(max)) };
}

/** Neue Startpunkte nach dem Ziehen: Index → Zeit (nur die geänderten) */
export function applyDrag(times: number[], index: number, mode: 'body' | 'edge', delta: number): Map<number, number> {
  const out = new Map<number, number>();
  if (delta === 0) return out;
  out.set(index, ROUND(times[index]! + delta));
  if (mode === 'body' && times[index + 1] !== undefined) out.set(index + 1, ROUND(times[index + 1]! + delta));
  return out;
}

function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec - m * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** so lange nach dem Scrollen nicht mitlaufen (ms) */
const HOLD_MS = 4000;

/** Abspielstand als rote Linie (läuft je Bild, ohne die Zeitleiste neu zu zeichnen) */
function ScenePlayhead({ source, start, span }: { source: TimeSource | null; start: number; span: number }) {
  const time = usePlayerTime(source);
  if (time < start || time > start + span) return null;
  return <Playhead at={{ fraction: (time - start) / span }} width={2} image={PLAYHEAD_RED} testId="scene-timeline-playhead" className="z-20" />;
}

export function SceneTimeline({
  scenes,
  music,
  src,
  audioOffset,
  selectedId,
  onSelect,
  onMove,
  editable,
  tone,
  events = [],
  onEventMove,
}: {
  scenes: SceneTimelineScene[];
  music: Playback | null;
  /** Audiodatei für die Wellenform */
  src: string | undefined;
  /** die Datei beginnt bei diesem Zeitpunkt */
  audioOffset: number;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  /** neue Startpunkte (Szene → Sekunden) */
  onMove: (changes: { id: string; atSec: number }[]) => void;
  editable: boolean;
  tone: 'light' | 'sound';
  /** Licht-Events: Marker über den Szenen (anklicken springt dorthin, ziehen verschiebt) */
  events?: { id: string; atSec: number; note: string }[];
  onEventMove?: (id: string, atSec: number) => void;
}) {
  const { duration } = usePlaybackState(music);
  const wave = useWaveformSettings();
  const timed = scenes.filter((s) => s.at !== undefined).sort((a, b) => a.at! - b.at! || a.number - b.number);
  const untimed = scenes.length - timed.length;
  const tr = music instanceof Transport ? music : null;
  const audioEnd = tr && tr.audioLength ? tr.audioOffset + tr.audioLength : 0;
  const lastAt = timed.reduce((m, s) => Math.max(m, s.at!), 0);
  const total = Math.max(Number.isFinite(duration) ? duration : 0, audioEnd, lastAt + 5, 10);

  const [view, setView] = useState<{ start: number; span: number } | null>(null);
  const span = Math.min(total, Math.max(MIN_SPAN, view?.span ?? total));
  const start = Math.min(Math.max(0, view?.start ?? 0), Math.max(0, total - span));
  const end = start + span;
  const pos = (sec: number) => ((sec - start) / span) * 100;
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  /** Event-Marker ziehen: Ausgang, Zeit beim Start, Sekunden je Pixel, aktuelle Zeit */
  const [eventDrag, setEventDrag] = useState<{ id: string; x: number; orig: number; perPx: number; at: number; moved: boolean } | null>(null);
  /** zuletzt von Hand verschoben (dann eine Weile nicht mitlaufen) */
  const lastScroll = useRef(0);

  const zoom = (factor: number, around = music?.currentTime ?? 0) => {
    const nextSpan = Math.min(total, Math.max(MIN_SPAN, span * factor));
    const ratio = span > 0 ? (around - start) / span : 0.5;
    setView({ span: nextSpan, start: around - ratio * nextSpan });
  };

  // Mausrad: verschieben (Strg: zoomen) – die Abspielposition bleibt
  const wheelState = useRef({ start, span, total });
  useEffect(() => {
    wheelState.current = { start, span, total };
  });
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const { start: s, span: sp, total: tot } = wheelState.current;
      const rect = el.getBoundingClientRect();
      lastScroll.current = performance.now();
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const around = s + ((e.clientX - rect.left) / rect.width) * sp;
        const nextSpan = Math.min(tot, Math.max(MIN_SPAN, sp * (e.deltaY > 0 ? 1.25 : 0.8)));
        setView({ span: nextSpan, start: around - ((around - s) / sp) * nextSpan });
        return;
      }
      // ungezoomt bleibt das Mausrad beim Blättern der Seite
      if (sp >= tot - 0.01) return;
      e.preventDefault();
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      setView({ span: sp, start: s + (delta / rect.width) * sp });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Abspielstand im Blick behalten (nicht beim Ziehen)
  // geprüft je Bild, neu gezeichnet nur, wenn der Abspielstand den Ausschnitt verlässt (die Leiste selbst steht)
  const playing = usePlaying(music);
  const outside = usePlayerValue(music, (time) => time < start || time > start + span * 0.95);
  const dragging = drag !== null;
  useEffect(() => {
    if (!music || !playing || dragging || span >= total || !outside) return;
    const follow = () => setView({ span, start: music.currentTime - span * 0.1 });
    // nach dem Scrollen erst nach der Wartezeit wieder mitlaufen
    const wait = HOLD_MS - (performance.now() - lastScroll.current);
    if (wait > 0) {
      const timer = window.setTimeout(follow, wait);
      return () => window.clearTimeout(timer);
    }
    const id = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(id);
  }, [music, outside, playing, dragging, span, start, total]);

  const times = timed.map((s) => s.at!);
  const preview = drag ? applyDrag(drag.orig, drag.index, drag.mode, drag.delta) : new Map<number, number>();
  const shown = times.map((at, i) => preview.get(i) ?? at);

  const begin = (e: ReactPointerEvent<HTMLElement>, index: number, mode: 'body' | 'edge') => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const rect = track.current!.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ mode, index, startX: e.clientX, perPx: span / rect.width, orig: times, delta: 0, moved: false });
  };
  const move = (e: ReactPointerEvent<HTMLElement>) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const moved = drag.moved || Math.abs(dx) > 3;
    if (!moved || !editable) return;
    const { min, max } = dragBounds(drag.orig, drag.index, drag.mode, total);
    const delta = ROUND(Math.min(max, Math.max(min, dx * drag.perPx)));
    if (delta !== drag.delta || !drag.moved) setDrag({ ...drag, delta, moved });
  };
  const finish = () => {
    if (!drag) return;
    const scene = timed[drag.index];
    if (drag.moved && editable) {
      const changes = [...applyDrag(drag.orig, drag.index, drag.mode, drag.delta)].map(([i, atSec]) => ({ id: timed[i]!.id, atSec }));
      if (changes.length) onMove(changes);
    } else if (scene) {
      onSelect(scene.id);
      if (music) seekAudio(music, scene.at!);
    }
    setDrag(null);
  };
  const seekAt = (clientX: number) => {
    const rect = track.current!.getBoundingClientRect();
    if (music) seekAudio(music, Math.min(total, Math.max(0, ROUND(start + ((clientX - rect.left) / rect.width) * span))));
  };

  const step = span > 600 ? 120 : span > 240 ? 60 : span > 90 ? 30 : span > 30 ? 10 : span > 10 ? 5 : 1;
  const labels: number[] = [];
  for (let s = Math.ceil(start / step) * step; s <= end; s += step) labels.push(s);
  const zoomed = span < total - 0.01;
  const block = tone === 'light' ? 'bg-amber-500 border-amber-600 dark:bg-amber-600 dark:border-amber-500' : 'bg-violet-500 border-violet-600 dark:bg-violet-600 dark:border-violet-500';

  return (
    <section className="space-y-1" aria-label={t.title} data-testid="scene-timeline">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="font-semibold tracking-wide uppercase">{t.title}</span>
        <span className="hidden truncate md:inline">{editable ? t.hint : t.hintRead}</span>
        {untimed > 0 && <span className="text-amber-700 dark:text-amber-400">{t.untimed(untimed)}</span>}
        <span className="flex-1" />
        <WaveformControls />
        <Button variant="ghost" className="min-h-7 px-1.5" aria-label={t.zoomOut} title={t.zoomOut} disabled={!zoomed} onClick={() => zoom(1.5)}>
          <ZoomOut {...ICON} />
        </Button>
        <Button variant="ghost" className="min-h-7 px-1.5" aria-label={t.zoomIn} title={t.zoomIn} disabled={span <= MIN_SPAN} onClick={() => zoom(1 / 1.5)}>
          <ZoomIn {...ICON} />
        </Button>
        {zoomed && (
          <Button variant="ghost" className="min-h-7 px-1.5" onClick={() => setView(null)}>
            {t.zoomAll}
          </Button>
        )}
      </div>
      <div
        ref={track}
        className="relative cursor-pointer touch-none overflow-hidden rounded-md border border-slate-200 bg-slate-50 select-none dark:border-slate-700 dark:bg-slate-950"
        onPointerDown={(e) => {
          if (e.button === 0) seekAt(e.clientX);
        }}
        data-testid="scene-timeline-track"
        data-start={start.toFixed(2)}
        data-span={span.toFixed(2)}
        data-total={total.toFixed(2)}
      >
        {events.length > 0 && (
          <div className="relative h-5 border-b border-slate-200 dark:border-slate-800" data-testid="scene-timeline-events">
            {events.map((ev) => {
              const at = eventDrag?.id === ev.id ? eventDrag.at : ev.atSec;
              if (at < start || at > end) return null;
              return (
                <span
                  key={ev.id}
                  className={`absolute top-0.5 z-20 flex h-4 w-4 -translate-x-1/2 cursor-pointer items-center justify-center rounded-sm bg-amber-400 text-[10px] leading-none font-bold text-amber-950 ring-1 ring-amber-700/40 ${editable ? 'cursor-grab' : ''}`}
                  style={{ left: `${pos(at)}%`, transform: 'translateX(-50%) rotate(45deg)' }}
                  title={`${formatSceneTime(at)} · ${ev.note || '–'}`}
                  data-testid="scene-event-marker"
                  data-at={at}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (e.button !== 0) return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setEventDrag({ id: ev.id, x: e.clientX, orig: ev.atSec, perPx: span / track.current!.getBoundingClientRect().width, at: ev.atSec, moved: false });
                  }}
                  onPointerMove={(e) => {
                    if (!eventDrag || !editable) return;
                    const dx = e.clientX - eventDrag.x;
                    if (!eventDrag.moved && Math.abs(dx) <= 3) return;
                    setEventDrag({ ...eventDrag, at: ROUND(Math.min(total, Math.max(0, eventDrag.orig + dx * eventDrag.perPx))), moved: true });
                  }}
                  onPointerUp={() => {
                    if (!eventDrag) return;
                    if (eventDrag.moved && eventDrag.at !== eventDrag.orig) onEventMove?.(eventDrag.id, eventDrag.at);
                    else if (!eventDrag.moved && music) seekAudio(music, ev.atSec);
                    setEventDrag(null);
                  }}
                  onPointerCancel={() => setEventDrag(null)}
                >
                  <span style={{ transform: 'rotate(-45deg)' }}>!</span>
                </span>
              );
            })}
          </div>
        )}
        {/* Event-Linien durch die Szenen */}
        {events.map((ev) => {
          const at = eventDrag?.id === ev.id ? eventDrag.at : ev.atSec;
          return at >= start && at <= end ? <div key={`l${ev.id}`} className="pointer-events-none absolute top-5 bottom-0 z-10 w-px border-l border-dashed border-amber-500" style={{ left: `${pos(at)}%` }} /> : null;
        })}
        <div className="relative h-11">
          {timed.length === 0 && <p className="pointer-events-none absolute inset-0 flex items-center px-2 text-xs text-slate-500">{t.empty}</p>}
          {timed.map((s, i) => {
            const at = shown[i]!;
            const until = shown[i + 1] ?? total;
            if (until < start || at > end) return null;
            const left = pos(at);
            const width = pos(until) - left;
            const selected = s.id === selectedId;
            const active = drag?.index === i || (drag?.mode === 'body' && drag.index === i - 1);
            return (
              <div
                key={s.id}
                className={`absolute top-1 bottom-1 overflow-hidden rounded border text-xs leading-tight text-white ${block} ${selected ? 'ring-2 ring-sky-500 ring-offset-1 dark:ring-offset-slate-950' : 'opacity-80'} ${active ? 'z-10 shadow-lg' : ''} ${editable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                style={{ left: `${left}%`, width: `calc(${width}% - 2px)` }}
                title={`${s.number}. ${s.name || '–'} · ${formatSceneTime(at)}`}
                onPointerDown={(e) => begin(e, i, 'body')}
                onPointerMove={move}
                onPointerUp={finish}
                onPointerCancel={() => setDrag(null)}
                data-testid="scene-block"
                data-id={s.id}
                data-at={at}
                data-selected={selected || undefined}
              >
                <span className="pointer-events-none flex h-full flex-col justify-center px-2" style={{ marginLeft: left < 0 ? `${(-left / width) * 100}%` : 0 }}>
                  <span className="truncate font-semibold">
                    {s.number}. {s.name || '–'}
                  </span>
                  <span className="truncate tabular-nums opacity-80">{formatSceneTime(at)}</span>
                </span>
                {editable && (
                  <span
                    className="absolute top-0 bottom-0 left-0 w-2 cursor-ew-resize bg-white/0 hover:bg-white/40"
                    title={t.edgeHint}
                    onPointerDown={(e) => begin(e, i, 'edge')}
                    onPointerMove={move}
                    onPointerUp={finish}
                    onPointerCancel={() => setDrag(null)}
                    data-testid="scene-edge"
                  />
                )}
              </div>
            );
          })}
        </div>
        {wave.on && (
          <div className="relative h-16 border-t border-slate-200 dark:border-slate-800" data-testid="scene-timeline-wave">
            <Waveform src={src} offset={audioOffset} start={start} span={span} />
          </div>
        )}
        <ScenePlayhead source={music} start={start} span={span} />
      </div>
      <TimelineScrollbar start={start} span={span} total={total} label={t.scroll} onChange={(next) => {
          lastScroll.current = performance.now();
          setView({ span, start: next });
        }}
      />
      <div className="relative h-4 text-[11px] text-slate-500 tabular-nums">
        {labels.map((s) => (
          <span key={s} className="absolute -translate-x-1/2" style={{ left: `${pos(s)}%` }}>
            {clock(s)}
          </span>
        ))}
      </div>
    </section>
  );
}
