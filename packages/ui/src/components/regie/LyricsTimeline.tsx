// Zeitleiste beim Mitschreiben: jede Zeile mit Zeit als Block an ihrer Stelle; per Ziehen verschieben (Raster 0,1 s,
// nicht über die Nachbarzeilen hinaus), Klick auf einen Block oder die Leiste springt dorthin. Abspielposition als
// rote Linie, die Leiste rollt mit. Zoom über „−“/„+“.
import { ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type * as Y from 'yjs';
import { setLineTime, type TimedLine } from '@steckplan/core';
import { texts } from '../../texts';
import { ICON } from '../icons';
import { Button } from '../ui';
import { Waveform, WaveformControls, useWaveformSettings } from './Waveform';

const t = texts.regie.media;

const ZOOMS = [10, 20, 40, 80, 160];
const ROUND = (sec: number) => Math.round(sec * 10) / 10;

function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

/** Abstand der Skalenstriche passend zum Zoom */
function tickStep(pxPerSec: number): number {
  return [1, 2, 5, 10, 15, 30, 60].find((s) => s * pxPerSec >= 60) ?? 60;
}

interface Drag {
  id: string;
  sectionId: string;
  startX: number;
  orig: number;
  min: number;
  max: number;
  at: number;
  moved: boolean;
}

export function LyricsTimeline({
  doc,
  origin,
  lines,
  time,
  duration,
  timeOffset,
  editable,
  onSeek,
  waveSrc,
  audioOffset = 0,
}: {
  doc: Y.Doc;
  origin: object;
  lines: TimedLine[];
  time: number;
  /** Länge der Leiste (Sekunden) */
  duration: number;
  /** angezeigte Zeiten sind um diesen Versatz verschoben (gespeichert wird ohne) */
  timeOffset: number;
  editable: boolean;
  onSeek: (sec: number) => void;
  /** Audiodatei für die Wellenform */
  waveSrc?: string;
  /** die Datei beginnt bei diesem Zeitpunkt */
  audioOffset?: number;
}) {
  const wave = useWaveformSettings();
  // sichtbarer Ausschnitt (für die Wellenform)
  const [visible, setVisible] = useState({ left: 0, width: 0 });
  const [zoom, setZoom] = useState(2);
  const pps = ZOOMS[zoom]!;
  const timed = lines.filter((l) => l.line.atSec !== undefined);
  const lastAt = timed.reduce((m, l) => Math.max(m, l.line.atSec!), 0);
  const total = Math.max(duration > 0 && Number.isFinite(duration) ? duration : 0, lastAt + 5, 10);
  const width = Math.ceil(total * pps);
  const [drag, setDrag] = useState<Drag | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // Abspielposition im Blick behalten (nicht während des Ziehens)
  const dragging = drag !== null;
  useEffect(() => {
    const el = scroller.current;
    if (!el || dragging) return;
    const x = time * pps;
    if (x < el.scrollLeft + 40 || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = Math.max(0, x - el.clientWidth / 3);
  }, [time, pps, dragging]);
  useEffect(() => {
    const el = scroller.current;
    if (!el || !wave.on) return;
    const measure = () => setVisible({ left: el.scrollLeft, width: el.clientWidth });
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      ro.disconnect();
    };
  }, [wave.on, pps]);

  const startDrag = (e: ReactPointerEvent<HTMLButtonElement>, index: number) => {
    const l = timed[index]!;
    if (!editable) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const prev = timed[index - 1]?.line.atSec;
    const next = timed[index + 1]?.line.atSec;
    setDrag({ id: l.line.id, sectionId: l.sectionId, startX: e.clientX, orig: l.line.atSec!, min: prev !== undefined ? prev + 0.1 : timeOffset, max: next !== undefined ? next - 0.1 : total, at: l.line.atSec!, moved: false });
  };
  const moveDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const at = ROUND(Math.min(drag.max, Math.max(drag.min, drag.orig + dx / pps)));
    setDrag({ ...drag, at, moved: drag.moved || Math.abs(dx) > 3 });
  };
  const endDrag = (atSec: number) => {
    if (!drag) {
      onSeek(atSec);
      return;
    }
    if (drag.moved) {
      if (drag.at !== drag.orig) setLineTime(doc, drag.sectionId, drag.id, Math.max(0, drag.at - timeOffset), origin);
    } else onSeek(drag.orig);
    setDrag(null);
  };

  const step = tickStep(pps);
  const ticks = Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => i * step);

  return (
    <section className="space-y-1" aria-label={t.timeline} data-testid="lyrics-timeline">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="font-semibold tracking-wide uppercase">{t.timeline}</span>
        <span className="truncate">{editable ? t.timelineHint : ''}</span>
        <span className="flex-1" />
        <WaveformControls />
        <Button variant="ghost" className="min-h-7 px-1.5" aria-label={t.zoomOut} title={t.zoomOut} disabled={zoom === 0} onClick={() => setZoom(zoom - 1)}>
          <ZoomOut {...ICON} />
        </Button>
        <Button variant="ghost" className="min-h-7 px-1.5" aria-label={t.zoomIn} title={t.zoomIn} disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom(zoom + 1)}>
          <ZoomIn {...ICON} />
        </Button>
      </div>
      <div ref={scroller} className="overflow-x-auto rounded-md border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950">
        <div
          className={`relative cursor-pointer select-none ${wave.on ? 'h-36' : 'h-20'}`}
          style={{ width }}
          data-testid="timeline-track"
          onClick={(e) => {
            // Klick auf die Leiste (nicht auf einen Block): dorthin springen
            if (e.target !== e.currentTarget) return;
            const rect = e.currentTarget.getBoundingClientRect();
            onSeek(Math.max(0, ROUND((e.clientX - rect.left) / pps)));
          }}
        >
          {/* Wellenform unter den Zeilen, nur der sichtbare Ausschnitt */}
          {wave.on && visible.width > 0 && (
            <div className="pointer-events-none absolute top-[4.75rem] bottom-1 border-t border-slate-200 dark:border-slate-800" style={{ left: visible.left, width: visible.width }} data-testid="timeline-wave">
              <Waveform src={waveSrc} offset={audioOffset} start={visible.left / pps} span={visible.width / pps} />
            </div>
          )}
          {/* Skala */}
          {ticks.map((s) => (
            <div key={s} className="pointer-events-none absolute top-0 h-full border-l border-slate-200 dark:border-slate-800" style={{ left: s * pps }}>
              <span className="ml-0.5 text-[10px] text-slate-400 tabular-nums">{clock(s).replace(/\.0$/, '')}</span>
            </div>
          ))}
          {/* Zeilen */}
          {timed.map((l, i) => {
            const at = drag?.id === l.line.id ? drag.at : l.line.atSec!;
            const next = timed[i + 1];
            const nextAt = next ? (drag && drag.id === next.line.id ? drag.at : next.line.atSec!) : Math.max(at + 3, total);
            const w = Math.max(24, (nextAt - at) * pps - 2);
            const active = drag?.id === l.line.id;
            return (
              <button
                key={l.line.id}
                type="button"
                aria-label={`${l.line.text || '–'} (${clock(at)})`}
                title={`${clock(at)} · ${l.line.text}`}
                data-testid="timeline-line"
                data-at={at}
                className={`absolute top-5 flex h-12 touch-none items-start overflow-hidden rounded border px-1.5 py-1 text-left text-xs leading-tight ${active ? 'z-10 border-sky-600 bg-sky-200 shadow dark:bg-sky-800' : 'border-sky-300 bg-sky-100 hover:bg-sky-200 dark:border-sky-800 dark:bg-sky-900 dark:hover:bg-sky-800'} ${editable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                style={{ left: at * pps, width: w }}
                onPointerDown={(e) => startDrag(e, i)}
                onPointerMove={moveDrag}
                onPointerUp={() => endDrag(l.line.atSec!)}
                onPointerCancel={() => setDrag(null)}
              >
                <span className="line-clamp-2">
                  {active && <span className="mr-1 font-semibold tabular-nums">{clock(at)}</span>}
                  {l.line.text || texts.regie.breakLine}
                </span>
              </button>
            );
          })}
          {/* Abspielposition */}
          <div className="pointer-events-none absolute top-0 z-20 h-full w-0.5 bg-red-500" style={{ left: time * pps }} data-testid="timeline-playhead" />
        </div>
      </div>
    </section>
  );
}
