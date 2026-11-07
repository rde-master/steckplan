// Zeitstrahl der Führen-Ansicht: über der Leiste die Szenen als Balken (Licht, darunter Ton), dann Taktstriche aus
// Tempo und Taktart (die „1“ jedes Takts kräftig mit Nummer, Zählzeiten fein), Textzeilen als Blöcke und der
// Abspielstand als rote Linie. Rechts die Szenenliste – Klick springt dorthin.
// Mausrad verschiebt den Ausschnitt (Strg + Mausrad bzw. Lupen zoomen), ohne die Abspielposition zu ändern; beim
// Abspielen läuft der Ausschnitt wieder mit, wenn man eine Weile nicht scrollt. Klick springt; mit „Scrubben“ verschiebt
// gedrückte Maus die Abspielposition.
import { Hand, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { parseTimeSignature, type TimedLine } from '@steckplan/core';
import { texts } from '../../texts';
import { ICON } from '../icons';
import { useFrame } from './BeatPanel';
import { formatSceneTime } from './ScenesSection';

const t = texts.regie.performance;

export interface TimelineScene {
  id: string;
  number: number;
  name: string;
  /** Startpunkt (Sekunden) – ohne Auslöser undefined */
  at: number | undefined;
  current: boolean;
}

function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec - m * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** höchstens so viele Striche im Ausschnitt zeichnen (sonst nur jeden n-ten) */
const MAX_BARS = 160;
const MAX_BEATS = 600;
/** so lange nach dem Scrollen nicht mitlaufen (ms) */
const HOLD_MS = 4000;
const SCRUB_KEY = 'steckplan.scrub';

function readScrub(): boolean {
  try {
    return localStorage.getItem(SCRUB_KEY) === 'on';
  } catch {
    return false;
  }
}

/** Szenen als Balken: von ihrem Startpunkt bis zur nächsten (ohne Startpunkt nicht gezeichnet) */
function SceneRow({ scenes, total, pos, label, color, testId }: { scenes: TimelineScene[]; total: number; pos: (sec: number) => number; label: string; color: string; testId: string }) {
  const timed = scenes.filter((s) => s.at !== undefined).sort((a, b) => a.at! - b.at!);
  if (timed.length === 0) return null;
  return (
    <div className="relative h-6" aria-label={label} data-testid={testId}>
      {timed.map((s, i) => {
        const start = pos(s.at!);
        const end = pos(timed[i + 1]?.at ?? total);
        return (
          <div
            key={s.id}
            className={`absolute top-0.5 bottom-0.5 overflow-hidden rounded px-1.5 text-xs leading-5 whitespace-nowrap ${s.current ? `${color} font-semibold text-white ring-2 ring-white/70` : `${color} text-white/85 opacity-60`}`}
            style={{ left: `${start}%`, width: `calc(${end - start}% - 2px)` }}
            title={`${s.number}. ${s.name}`}
            data-testid="lead-scene-bar"
            data-current={s.current || undefined}
          >
            {/* Beschriftung bleibt am linken Rand, wenn der Balken links aus dem Ausschnitt ragt */}
            <span className="inline-block" style={{ marginLeft: start < 0 ? `${(-start / (end - start)) * 100}%` : 0 }}>
              {s.number}. {s.name || '–'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function LeadTimeline({
  duration,
  lines,
  currentLineId,
  bpm,
  signature,
  offset,
  getTime,
  playing,
  onSeek,
  lightScenes,
  soundScenes,
  onScene,
}: {
  duration: number;
  lines: TimedLine[];
  currentLineId: string | undefined;
  bpm: number | undefined;
  signature: string | undefined;
  offset: number | undefined;
  getTime: () => number;
  playing: boolean;
  onSeek?: (sec: number) => void;
  lightScenes: TimelineScene[];
  soundScenes: TimelineScene[];
  /** Szene aus der Liste gewählt: dorthin springen */
  onScene?: (kind: 'light' | 'sound', scene: TimelineScene) => void;
}) {
  useFrame(playing);
  const time = getTime();
  const total = duration > 0 ? duration : 1;
  // Ausschnitt: Beginn und Länge (Sekunden); Standard alles
  const [view, setView] = useState<{ start: number; span: number } | null>(null);
  const span = Math.min(total, Math.max(2, view?.span ?? total));
  const start = Math.min(Math.max(0, view?.start ?? 0), Math.max(0, total - span));
  const pos = (sec: number) => ((sec - start) / span) * 100;
  const pct = (sec: number) => `${pos(sec)}%`;
  const track = useRef<HTMLDivElement>(null);
  const lastScroll = useRef(0);
  const [scrub, setScrub] = useState(readScrub);
  const scrubbing = useRef(false);

  const setScrubOn = (on: boolean) => {
    setScrub(on);
    try {
      localStorage.setItem(SCRUB_KEY, on ? 'on' : 'off');
    } catch {
      // ohne Speicher gilt die Wahl bis zum Neuladen
    }
  };
  const zoom = (factor: number, around = time) => {
    const nextSpan = Math.min(total, Math.max(2, span * factor));
    const ratio = span > 0 ? (around - start) / span : 0.5;
    setView({ span: nextSpan, start: around - ratio * nextSpan });
  };

  // Mausrad: verschieben (Strg: zoomen) – die Abspielposition bleibt
  const wheelState = useRef({ start, span, total, time });
  useEffect(() => {
    wheelState.current = { start, span, total, time };
  });
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const { start: s, span: sp, total: tot } = wheelState.current;
      e.preventDefault();
      lastScroll.current = performance.now();
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        const around = s + ((e.clientX - rect.left) / rect.width) * sp;
        const nextSpan = Math.min(tot, Math.max(2, sp * (e.deltaY > 0 ? 1.25 : 0.8)));
        const ratio = (around - s) / sp;
        setView({ span: nextSpan, start: around - ratio * nextSpan });
        return;
      }
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      setView({ span: sp, start: s + (delta / rect.width) * sp });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // beim Abspielen mitlaufen, wenn der Abspielstand den Ausschnitt verlässt (nicht direkt nach dem Scrollen)
  useEffect(() => {
    if (!playing || span >= total) return;
    if (performance.now() - lastScroll.current < HOLD_MS) return;
    if (time >= start && time <= start + span * 0.9) return;
    const id = requestAnimationFrame(() => setView({ span, start: time - span * 0.1 }));
    return () => cancelAnimationFrame(id);
  }, [time, playing, span, start, total]);

  const timeAt = (clientX: number) => {
    const rect = track.current!.getBoundingClientRect();
    return Math.min(total, Math.max(0, Math.round((start + ((clientX - rect.left) / rect.width) * span) * 10) / 10));
  };
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    onSeek(timeAt(e.clientX));
    if (scrub) {
      scrubbing.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (scrubbing.current && onSeek) onSeek(timeAt(e.clientX));
  };
  const up = () => {
    scrubbing.current = false;
  };

  const { beats } = parseTimeSignature(signature);
  const end = start + span;
  const bars: { at: number; number: number }[] = [];
  const beatTicks: number[] = [];
  if (bpm && bpm > 0) {
    const beatLen = 60 / bpm;
    const barLen = beatLen * beats;
    const anchor = offset ?? 0;
    // erste „1“ im Ausschnitt (Taktnummer ab der „1“ bei anchor)
    const firstIndex = Math.ceil((start - anchor) / barLen - 1e-9);
    const lastIndex = Math.floor((end - anchor) / barLen + 1e-9);
    const count = lastIndex - firstIndex + 1;
    const every = Math.max(1, Math.ceil(count / MAX_BARS));
    for (let i = firstIndex; i <= lastIndex; i++) {
      const at = anchor + i * barLen;
      if (at >= 0 && at <= total && (i - firstIndex) % every === 0) bars.push({ at, number: i + 1 });
    }
    if (span / beatLen <= MAX_BEATS) {
      for (let i = Math.ceil((start - anchor) / beatLen); anchor + i * beatLen <= end; i++) {
        const at = anchor + i * beatLen;
        if (at >= 0 && at <= total) beatTicks.push(at);
      }
    }
  }
  const labelEvery = Math.max(1, Math.ceil(bars.length / 32));
  const timed = lines.filter((l) => l.line.atSec !== undefined);
  const step = span > 600 ? 120 : span > 240 ? 60 : span > 90 ? 30 : span > 30 ? 10 : span > 10 ? 5 : 1;
  const labels: number[] = [];
  for (let s = Math.ceil(start / step) * step; s <= end; s += step) labels.push(s);
  const zoomed = span < total - 0.01;

  return (
    <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]" aria-label={t.timeline} data-testid="lead-timeline">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="font-semibold tracking-wide uppercase">{t.timeline}</span>
          <span className="hidden truncate sm:inline">{t.timelineHint}</span>
          <span className="flex-1" />
          <label className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 ${scrub ? 'border-amber-500 bg-amber-500/15 text-amber-200' : 'border-slate-700'}`} title={t.scrubHint}>
            <input type="checkbox" className="sr-only" checked={scrub} onChange={(e) => setScrubOn(e.target.checked)} aria-label={t.scrub} />
            <Hand size={14} aria-hidden /> {t.scrub}: {scrub ? t.on : t.off}
          </label>
          <button type="button" className="rounded p-1 hover:bg-slate-800 disabled:opacity-40" aria-label={t.zoomOut} title={t.zoomOut} disabled={!zoomed} onClick={() => zoom(1.5)}>
            <ZoomOut {...ICON} />
          </button>
          <button type="button" className="rounded p-1 hover:bg-slate-800 disabled:opacity-40" aria-label={t.zoomIn} title={t.zoomIn} disabled={span <= 2} onClick={() => zoom(1 / 1.5)}>
            <ZoomIn {...ICON} />
          </button>
          {zoomed && (
            <button type="button" className="rounded px-1.5 py-0.5 hover:bg-slate-800" onClick={() => setView(null)}>
              {t.zoomAll}
            </button>
          )}
        </div>
        <div
          ref={track}
          className={`relative overflow-hidden rounded-xl border border-slate-700 bg-slate-900 select-none ${onSeek ? (scrub ? 'cursor-ew-resize' : 'cursor-pointer') : ''} touch-none`}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          data-testid="lead-timeline-track"
          data-start={start.toFixed(2)}
          data-span={span.toFixed(2)}
        >
          {/* Szenen oben */}
          <div className="border-b border-slate-800 bg-slate-950/60">
            <SceneRow scenes={lightScenes} total={total} pos={pos} label={t.sides.light} color="bg-amber-600" testId="lead-light-scenes" />
            <SceneRow scenes={soundScenes} total={total} pos={pos} label={t.sides.sound} color="bg-violet-600" testId="lead-sound-scenes" />
          </div>
          <div className="relative h-32">
            {beatTicks.map((at) => (
              <div key={`b${at.toFixed(3)}`} className="pointer-events-none absolute top-6 bottom-0 w-px bg-slate-700/60" style={{ left: pct(at) }} />
            ))}
            {bars.map((b, i) => (
              <div key={`t${b.number}`} className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-slate-400/70" style={{ left: pct(b.at) }} data-testid="lead-bar-line">
                {i % labelEvery === 0 && <span className="absolute top-0.5 left-1 text-[11px] font-semibold text-slate-400 tabular-nums">{b.number}</span>}
              </div>
            ))}
            {timed.map((l, i) => {
              const at = l.line.atSec!;
              const until = timed[i + 1]?.line.atSec ?? total;
              if (until < start || at > end) return null;
              const current = l.line.id === currentLineId;
              return (
                <div
                  key={l.line.id}
                  className={`pointer-events-none absolute top-12 h-14 overflow-hidden rounded border px-1.5 py-1 text-xs leading-tight ${current ? 'border-sky-400 bg-sky-700/80 text-white' : 'border-sky-800 bg-sky-950/80 text-sky-200'}`}
                  style={{ left: pct(at), width: `calc(${pos(Math.min(until, total)) - pos(at)}% - 2px)` }}
                  title={l.line.text}
                >
                  <span className="line-clamp-2" style={{ marginLeft: pos(at) < 0 ? `${(-pos(at) / (pos(Math.min(until, total)) - pos(at))) * 100}%` : 0 }}>
                    {l.line.text}
                  </span>
                </div>
              );
            })}
          </div>
          {/* Abspielstand über alles */}
          {time >= start && time <= end && (
            <div className="pointer-events-none absolute top-0 bottom-0 z-10 w-1 -translate-x-1/2 rounded bg-red-500 shadow-[0_0_12px_rgb(239_68_68/0.8)]" style={{ left: pct(time) }} data-testid="lead-playhead" />
          )}
        </div>
        <div className="relative h-4 text-[11px] text-slate-500 tabular-nums">
          {labels.map((s) => (
            <span key={s} className="absolute -translate-x-1/2" style={{ left: pct(s) }}>
              {clock(s)}
            </span>
          ))}
        </div>
      </div>

      {/* Szenenliste: Klick springt dorthin */}
      <aside className="max-h-64 min-h-0 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-1 lg:max-h-56" aria-label={t.sceneList} data-testid="lead-scene-list">
        {lightScenes.length + soundScenes.length === 0 ? (
          <p className="p-2 text-sm text-slate-500">{t.noScenes}</p>
        ) : (
          (
            [
              ['light', lightScenes],
              ['sound', soundScenes],
            ] as const
          ).map(([kind, list]) =>
            list.length === 0 ? null : (
              <div key={kind}>
                <div className="px-2 pt-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{t.sides[kind]}</div>
                <ol>
                  {list.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className={`flex w-full cursor-pointer items-baseline gap-2 rounded px-2 py-1 text-left text-sm hover:bg-slate-800 ${s.current ? (kind === 'light' ? 'bg-amber-600/30 font-semibold text-amber-100' : 'bg-violet-600/30 font-semibold text-violet-100') : 'text-slate-300'}`}
                        onClick={() => onScene?.(kind, s)}
                        disabled={!onScene}
                        data-testid="lead-scene-item"
                        data-current={s.current || undefined}
                      >
                        <span className="w-5 shrink-0 text-right tabular-nums text-slate-500">{s.number}</span>
                        <span className="min-w-0 flex-1 truncate">{s.name || '–'}</span>
                        <span className="shrink-0 text-xs tabular-nums text-slate-500">{s.at !== undefined ? formatSceneTime(s.at) : ''}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            ),
          )
        )}
      </aside>
    </section>
  );
}
