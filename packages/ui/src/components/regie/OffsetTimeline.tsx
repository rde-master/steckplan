// Versatz-Zeitleiste im Ablauf: oben der Punkt (Start 0:00 bis Ende), darunter die Musik als Block mit Wellenform.
// Musik ziehen stellt den Versatz ein (Raster 0,1 s): nach rechts setzt sie später ein, nach links beginnt der Punkt
// mitten in der Datei (0:00 des Punkts = Stelle in der Datei). Klick ohne Ziehen springt dorthin.
import { ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { formatDuration } from '@steckplan/core';
import { texts } from '../../texts';
import { ICON } from '../icons';
import { Button } from '../ui';
import { formatSceneTime } from './ScenesSection';
import { TimelineScrollbar } from './TimelineScrollbar';
import { Waveform } from './Waveform';

const t = texts.regie.fields;
const ROUND = (sec: number) => Math.round(sec * 10) / 10;
const MIN_SPAN = 1;

interface Drag {
  x: number;
  orig: number;
  /** Ausschnitt beim Start (bleibt beim Ziehen stehen) */
  lo: number;
  hi: number;
  perPx: number;
  moved: boolean;
  offset: number;
}

export function OffsetTimeline({
  offset,
  audioLength,
  duration,
  time,
  src,
  editable,
  onChange,
  onSeek,
}: {
  offset: number;
  /** Länge der Datei (0 = unbekannt) */
  audioLength: number;
  /** Dauer des Punkts (sonst bis zum Ende der Musik) */
  duration: number | undefined;
  /** Abspielposition (Zeit des Punkts) */
  time: number;
  src: string | undefined;
  editable: boolean;
  onChange: (offset: number) => void;
  onSeek: (sec: number) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const shown = drag?.offset ?? offset;
  const end = duration && duration > 0 ? duration : Math.max(1, offset + audioLength);
  const pad = Math.max(1, (Math.max(end, shown + audioLength) - Math.min(0, shown)) * 0.04);
  const lo = drag?.lo ?? Math.min(0, offset) - pad;
  const hi = drag?.hi ?? Math.max(end, offset + audioLength) + pad;
  const total = hi - lo;
  // Ausschnitt (Zoom): Beginn relativ zu lo und Länge; Standard alles
  const [zoomView, setZoomView] = useState<{ start: number; span: number } | null>(null);
  const span = Math.min(total, Math.max(MIN_SPAN, zoomView?.span ?? total));
  const vStart = Math.min(Math.max(0, zoomView?.start ?? 0), total - span);
  const from = lo + vStart;
  const pct = (sec: number) => `${((sec - from) / span) * 100}%`;
  const zoomed = span < total - 0.01;
  const zoom = (factor: number, around = from + span / 2) => {
    const nextSpan = Math.min(total, Math.max(MIN_SPAN, span * factor));
    const ratio = (around - from) / span;
    setZoomView({ span: nextSpan, start: around - lo - ratio * nextSpan });
  };
  // Mausrad: Strg zoomt um die Mausposition, sonst verschieben (nur gezoomt)
  const wheelState = useRef({ from, span, total, lo });
  useEffect(() => {
    wheelState.current = { from, span, total, lo };
  });
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const w = wheelState.current;
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const around = w.from + ((e.clientX - rect.left) / rect.width) * w.span;
        const nextSpan = Math.min(w.total, Math.max(MIN_SPAN, w.span * (e.deltaY > 0 ? 1.25 : 0.8)));
        setZoomView({ span: nextSpan, start: around - w.lo - ((around - w.from) / w.span) * nextSpan });
        return;
      }
      if (w.span >= w.total - 0.01) return;
      e.preventDefault();
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      setZoomView({ span: w.span, start: w.from - w.lo + (delta / rect.width) * w.span });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const width = track.current!.getBoundingClientRect().width;
    setDrag({ x: e.clientX, orig: offset, lo, hi, perPx: span / width, moved: false, offset });
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag || !editable) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) <= 3) return;
    const next = ROUND(Math.min(3600, Math.max(-Math.max(0, audioLength - 0.1), drag.orig + dx * drag.perPx)));
    setDrag({ ...drag, offset: next, moved: true });
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    if (drag.moved) {
      if (drag.offset !== drag.orig) onChange(drag.offset);
    } else seekAt(e.clientX);
    setDrag(null);
  };
  const seekAt = (clientX: number) => {
    const rect = track.current!.getBoundingClientRect();
    onSeek(Math.max(0, ROUND(from + ((clientX - rect.left) / rect.width) * span)));
  };

  const status = shown > 0 ? t.offsetLate(formatSceneTime(shown)) : shown < 0 ? t.offsetFrom(formatSceneTime(-shown)) : t.offsetNone;
  return (
    <section className="space-y-1 sm:col-span-2" aria-label={t.offsetTimeline} data-testid="offset-timeline">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="font-semibold tracking-wide uppercase">{t.offsetTimeline}</span>
        <span className="font-semibold text-sky-700 dark:text-sky-300" data-testid="offset-status">
          {status}
        </span>
        <span className="hidden truncate md:inline">{editable ? t.offsetTimelineHint : ''}</span>
        <span className="flex-1" />
        <Button variant="ghost" className="min-h-7 px-1.5" aria-label={t.offsetZoomOut} title={t.offsetZoomOut} disabled={!zoomed} onClick={() => zoom(1.5)}>
          <ZoomOut {...ICON} />
        </Button>
        <Button variant="ghost" className="min-h-7 px-1.5" aria-label={t.offsetZoomIn} title={t.offsetZoomIn} disabled={span <= MIN_SPAN} onClick={() => zoom(1 / 1.5, time >= from && time <= from + span ? time : undefined)}>
          <ZoomIn {...ICON} />
        </Button>
        {zoomed && (
          <Button variant="ghost" className="min-h-7 px-1.5 text-xs" onClick={() => setZoomView(null)}>
            {t.offsetZoomAll}
          </Button>
        )}
        {editable && offset !== 0 && (
          <Button variant="ghost" className="min-h-7 px-1.5 text-xs" onClick={() => onChange(0)}>
            {t.offsetReset}
          </Button>
        )}
      </div>
      <div
        ref={track}
        className="relative h-24 cursor-pointer touch-none overflow-hidden rounded-md border border-slate-200 bg-slate-50 select-none dark:border-slate-700 dark:bg-slate-950"
        onPointerDown={(e) => e.button === 0 && seekAt(e.clientX)}
        data-testid="offset-track"
        data-lo={from.toFixed(2)}
        data-span={span.toFixed(2)}
      >
        {/* Punkt: 0:00 bis Ende */}
        <div className="pointer-events-none absolute top-1 h-6 rounded border border-slate-300 bg-slate-200/70 dark:border-slate-600 dark:bg-slate-800/70" style={{ left: pct(0), width: `calc(${pct(end)} - ${pct(0)})` }}>
          <span className="absolute top-0.5 left-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">{t.offsetStart}</span>
          <span className="absolute top-0.5 right-1 text-[11px] text-slate-500">
            {t.offsetEnd} {formatDuration(end)}
          </span>
        </div>
        <div className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-emerald-500" style={{ left: pct(0) }} data-testid="offset-zero" />
        {/* Wellenform der Musik: nur der sichtbare Ausschnitt (an der Stelle, wo die Musik gerade liegt) */}
        {audioLength > 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-8 bottom-1 z-[1]">
            <Waveform src={src} offset={shown} start={from} span={span} force color="rgb(14 116 144 / 0.55)" />
          </div>
        )}
        {/* Musik */}
        {audioLength > 0 && (
          <div
            className={`absolute top-8 bottom-1 overflow-hidden rounded border text-xs ${drag?.moved ? 'border-sky-500 bg-sky-200/80 shadow dark:bg-sky-900/80' : 'border-sky-400 bg-sky-100/80 dark:border-sky-700 dark:bg-sky-950/80'} ${editable ? 'cursor-grab active:cursor-grabbing' : ''}`}
            style={{ left: pct(shown), width: `calc(${pct(shown + audioLength)} - ${pct(shown)})` }}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => setDrag(null)}
            data-testid="offset-music"
            data-offset={shown}
          >
            <span className="pointer-events-none absolute top-0.5 left-1 z-[2] font-semibold text-sky-800 dark:text-sky-200">{t.offsetMusic}</span>
          </div>
        )}
        <div className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 bg-red-500" style={{ left: pct(time) }} data-testid="offset-playhead" />
      </div>
      <TimelineScrollbar start={vStart} span={span} total={total} label={t.offsetScroll} onChange={(start) => setZoomView({ span, start })} />
    </section>
  );
}
