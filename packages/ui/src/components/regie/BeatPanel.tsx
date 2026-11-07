// Takt-Anzeige der Vorstellung: Kreis mit einem Punkt je Zählzeit, der aktuelle leuchtet (die „1“ betont), ein Bogen
// läuft im Takt um, in der Mitte die Zählzeit. Daneben Tempo und Taktart, darunter „Tap“ (zwei volle Takte tippen).
import { useEffect, useState } from 'react';
import { beatAt, parseTimeSignature } from '@steckplan/core';
import { texts } from '../../texts';

const t = texts.regie.performance;

/** Läuft die Wiedergabe, jede Bildschirmaktualisierung neu zeichnen */
function useFrame(running: boolean): void {
  const [, setFrame] = useState(0);
  useEffect(() => {
    if (!running) return;
    let id = 0;
    const tick = () => {
      setFrame((f) => (f + 1) % 1_000_000);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [running]);
}

const SIZE = 132;
const C = SIZE / 2;
const R = 52;

function point(fraction: number, radius: number): { x: number; y: number } {
  const a = fraction * 2 * Math.PI - Math.PI / 2;
  return { x: C + Math.cos(a) * radius, y: C + Math.sin(a) * radius };
}

/** Bogen von oben (0) bis fraction (0 … 1) */
function arc(fraction: number, radius: number): string {
  if (fraction <= 0) return '';
  const end = point(Math.min(fraction, 0.9999), radius);
  const large = fraction > 0.5 ? 1 : 0;
  return `M ${C} ${C - radius} A ${radius} ${radius} 0 ${large} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export function BeatPanel({
  bpm,
  signature,
  offset,
  getTime,
  playing,
  onTap,
  tap,
}: {
  bpm: number | undefined;
  signature: string | undefined;
  offset: number | undefined;
  /** Abspielzeit des Punkts (genau, je Bild gelesen) */
  getTime: () => number;
  playing: boolean;
  /** Tap-Tempo (fehlt beim Folgen) */
  onTap?: () => void;
  /** Fortschritt der laufenden Tap-Folge */
  tap: { count: number; remaining: number } | null;
}) {
  useFrame(playing && !!bpm);
  const { beats } = parseTimeSignature(signature);
  const pos = bpm ? beatAt(getTime(), bpm, beats, offset ?? 0) : null;
  // kurzes Aufleuchten zu Beginn jedes Schlags
  const pulse = pos && playing ? Math.max(0, 1 - pos.phase * 3) : 0;
  const tapping = !!tap && tap.count > 0;
  return (
    <div className="flex shrink-0 items-center gap-3" data-testid="beat-panel">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
          <defs>
            <radialGradient id="beat-glow">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx={C} cy={C} r={R + 8} fill="url(#beat-glow)" opacity={0.4 + pulse * 0.6} />
          <circle cx={C} cy={C} r={R} fill="none" stroke="#1e293b" strokeWidth={6} />
          {/* umlaufender Bogen: Fortschritt im Takt */}
          {pos && <path d={arc(pos.barPhase, R)} fill="none" stroke={pos.count === 1 ? '#f59e0b' : '#38bdf8'} strokeWidth={6} strokeLinecap="round" opacity={0.85} />}
          {/* je Zählzeit ein Punkt; der aktuelle groß und hell, die „1“ bernsteinfarben */}
          {Array.from({ length: beats }, (_, i) => {
            const p = point(i / beats, R);
            const active = pos?.count === i + 1;
            const color = i === 0 ? '#f59e0b' : '#38bdf8';
            return (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={active ? 9 + pulse * 3 : 5}
                fill={active ? color : '#0f172a'}
                stroke={color}
                strokeWidth={active ? 0 : 2}
                data-testid="beat-dot"
                data-active={active || undefined}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`text-5xl leading-none font-black tabular-nums ${pos?.count === 1 ? 'text-amber-400' : 'text-sky-300'}`}
            style={{ transform: `scale(${1 + pulse * 0.18})` }}
            data-testid="beat-count"
          >
            {tapping ? tap.count : (pos?.count ?? '–')}
          </span>
        </div>
      </div>
      <div className="flex min-w-24 flex-col gap-1.5">
        <div className="leading-none" data-testid="beat-bpm">
          <span className="text-4xl font-bold tabular-nums">{bpm ? String(Math.round(bpm * 10) / 10).replace('.', ',') : '–'}</span>
          <span className="ml-1 text-sm text-slate-400">BPM</span>
        </div>
        <div className="text-lg font-semibold text-slate-300 tabular-nums" data-testid="beat-signature">
          {beats}/{parseTimeSignature(signature).unit}
        </div>
        {onTap && (
          <button
            type="button"
            onClick={onTap}
            title={t.tapTitle}
            className={`rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors active:scale-95 ${tapping ? 'border-amber-400 bg-amber-500/20 text-amber-200' : 'border-slate-600 hover:bg-slate-800'}`}
            data-testid="beat-tap"
          >
            {tapping ? t.tapProgress(tap.remaining) : t.tap}
          </button>
        )}
      </div>
    </div>
  );
}
