// Zeitstrahl der Führen-Ansicht: die ganze Dauer des Punkts auf voller Breite – Taktstriche aus Tempo und Taktart
// (die „1“ jedes Takts kräftig, mit Taktnummer), Zählzeiten fein, Textzeilen als Blöcke, Abspielstand als rote Linie.
// Klick springt dorthin.
import { parseTimeSignature, type TimedLine } from '@steckplan/core';
import { texts } from '../../texts';
import { useFrame } from './BeatPanel';

const t = texts.regie.performance;

function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec - m * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** höchstens so viele Striche zeichnen (sonst nur jeden n-ten) */
const MAX_BARS = 160;
const MAX_BEATS = 600;

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
}) {
  useFrame(playing);
  const time = getTime();
  const total = duration > 0 ? duration : 1;
  const pct = (sec: number) => `${(Math.min(total, Math.max(0, sec)) / total) * 100}%`;
  const { beats } = parseTimeSignature(signature);
  // Taktstriche: ab der Lage der „1“ in beide Richtungen
  const bars: { at: number; number: number }[] = [];
  const beatTicks: number[] = [];
  if (bpm && bpm > 0) {
    const beatLen = 60 / bpm;
    const barLen = beatLen * beats;
    const first = (((offset ?? 0) % barLen) + barLen) % barLen;
    const barCount = Math.floor((total - first) / barLen) + 1;
    const every = Math.max(1, Math.ceil(barCount / MAX_BARS));
    const firstNumber = Math.round(((first - (offset ?? 0)) / barLen)) + 1;
    for (let i = 0; i < barCount; i++) if (i % every === 0) bars.push({ at: first + i * barLen, number: firstNumber + i });
    const beatCount = Math.floor(total / beatLen);
    if (beatCount <= MAX_BEATS) {
      const firstBeat = first % beatLen;
      for (let at = firstBeat; at <= total; at += beatLen) beatTicks.push(at);
    }
  }
  const labelEvery = Math.max(1, Math.ceil(bars.length / 32));
  const timed = lines.filter((l) => l.line.atSec !== undefined);
  const minuteStep = total > 600 ? 120 : total > 240 ? 60 : total > 90 ? 30 : 10;

  return (
    <section className="space-y-1" aria-label={t.timeline} data-testid="lead-timeline">
      <div
        className={`relative h-36 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 select-none ${onSeek ? 'cursor-pointer' : ''}`}
        onClick={(e) => {
          if (!onSeek) return;
          const rect = e.currentTarget.getBoundingClientRect();
          onSeek(Math.round(((e.clientX - rect.left) / rect.width) * total * 10) / 10);
        }}
        data-testid="lead-timeline-track"
      >
        {/* Zählzeiten fein, Takte kräftig mit Nummer */}
        {beatTicks.map((at) => (
          <div key={`b${at.toFixed(3)}`} className="pointer-events-none absolute top-6 bottom-0 w-px bg-slate-700/60" style={{ left: pct(at) }} />
        ))}
        {bars.map((b, i) => (
          <div key={`t${b.number}`} className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-slate-400/70" style={{ left: pct(b.at) }} data-testid="lead-bar-line">
            {i % labelEvery === 0 && <span className="absolute top-0.5 left-1 text-[11px] font-semibold text-slate-400 tabular-nums">{b.number}</span>}
          </div>
        ))}
        {/* Textzeilen */}
        {timed.map((l, i) => {
          const at = l.line.atSec!;
          const end = timed[i + 1]?.line.atSec ?? total;
          const current = l.line.id === currentLineId;
          return (
            <div
              key={l.line.id}
              className={`pointer-events-none absolute top-14 h-14 overflow-hidden rounded border px-1.5 py-1 text-xs leading-tight ${current ? 'border-sky-400 bg-sky-700/80 text-white' : 'border-sky-800 bg-sky-950/80 text-sky-200'}`}
              style={{ left: pct(at), width: `calc(${((Math.min(end, total) - at) / total) * 100}% - 2px)` }}
              title={l.line.text}
            >
              <span className="line-clamp-2">{l.line.text}</span>
            </div>
          );
        })}
        {/* Abspielstand */}
        <div className="pointer-events-none absolute top-0 bottom-0 z-10 w-1 -translate-x-1/2 rounded bg-red-500 shadow-[0_0_12px_rgb(239_68_68/0.8)]" style={{ left: pct(time) }} data-testid="lead-playhead" />
      </div>
      <div className="relative h-4 text-[11px] text-slate-500 tabular-nums">
        {Array.from({ length: Math.floor(total / minuteStep) + 1 }, (_, i) => i * minuteStep).map((s) => (
          <span key={s} className="absolute -translate-x-1/2" style={{ left: pct(s) }}>
            {clock(s)}
          </span>
        ))}
      </div>
    </section>
  );
}
