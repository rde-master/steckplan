// Takt-Anzeige der Vorstellung: Kreis mit einem Punkt je Zählzeit, der aktuelle leuchtet (die „1“ betont), ein Bogen
// läuft im Takt um, in der Mitte die Zählzeit. Daneben Tempo und Taktart, darunter „Tap“ (zwei volle Takte tippen).
import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { beatAt, parseTimeSignature } from '@steckplan/core';
import { texts } from '../../texts';

const t = texts.regie.performance;

/** Läuft die Wiedergabe, jede Bildschirmaktualisierung neu zeichnen */
export function useFrame(running: boolean): void {
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

function point(c: number, fraction: number, radius: number): { x: number; y: number } {
  const a = fraction * 2 * Math.PI - Math.PI / 2;
  return { x: c + Math.cos(a) * radius, y: c + Math.sin(a) * radius };
}

/** Bogen von oben (0) bis fraction (0 … 1) */
function arc(c: number, fraction: number, radius: number): string {
  if (fraction <= 0) return '';
  const end = point(c, Math.min(fraction, 0.9999), radius);
  const large = fraction > 0.5 ? 1 : 0;
  return `M ${c} ${c - radius} A ${radius} ${radius} 0 ${large} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export function BeatPanel({
  bpm,
  signature,
  offset,
  getTime,
  playing,
  onTap,
  tap,
  big = false,
  manual = false,
  standardBpm,
  onReset,
  onBeatStep,
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
  /** Führen-Ansicht: großer Kreis und großer Tap-Knopf */
  big?: boolean;
  /** Tempo vom Tappen (manuell) statt des gespeicherten */
  manual?: boolean;
  /** gespeichertes Tempo des Lieds */
  standardBpm?: number | undefined;
  /** manuelles Tempo verwerfen */
  onReset?: (() => void) | undefined;
  /** einen Schlag vor (1) bzw. zurück (-1) springen */
  onBeatStep?: ((dir: 1 | -1) => void) | undefined;
}) {
  const SIZE = big ? 210 : 132;
  const C = SIZE / 2;
  const R = big ? 84 : 52;
  const dot = big ? 1.6 : 1;
  useFrame(playing && !!bpm);
  const { beats } = parseTimeSignature(signature);
  const pos = bpm ? beatAt(getTime(), bpm, beats, offset ?? 0) : null;
  // kurzes Aufleuchten zu Beginn jedes Schlags
  const pulse = pos && playing ? Math.max(0, 1 - pos.phase * 3) : 0;
  const tapping = !!tap && tap.count > 0;
  return (
    <div className={`flex shrink-0 items-center ${big ? 'gap-5' : 'gap-3'}`} data-testid="beat-panel">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
          <defs>
            <radialGradient id="beat-glow">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx={C} cy={C} r={R + 8} fill="url(#beat-glow)" opacity={0.4 + pulse * 0.6} />
          <circle cx={C} cy={C} r={R} fill="none" stroke="#1e293b" strokeWidth={big ? 9 : 6} />
          {/* umlaufender Bogen: Fortschritt im Takt */}
          {pos && <path d={arc(C, pos.barPhase, R)} fill="none" stroke={pos.count === 1 ? '#f59e0b' : '#38bdf8'} strokeWidth={big ? 9 : 6} strokeLinecap="round" opacity={0.85} />}
          {/* je Zählzeit ein Punkt; der aktuelle groß und hell, die „1“ bernsteinfarben */}
          {Array.from({ length: beats }, (_, i) => {
            const p = point(C, i / beats, R);
            const active = pos?.count === i + 1;
            const color = i === 0 ? '#f59e0b' : '#38bdf8';
            return (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={(active ? 9 + pulse * 3 : 5) * dot}
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
            className={`${big ? 'text-8xl' : 'text-5xl'} leading-none font-black tabular-nums ${pos?.count === 1 ? 'text-amber-400' : 'text-sky-300'}`}
            style={{ transform: `scale(${1 + pulse * 0.18})` }}
            data-testid="beat-count"
          >
            {tapping ? tap.count : (pos?.count ?? '–')}
          </span>
        </div>
      </div>
      <div className="flex min-w-24 flex-col gap-1.5">
        <div className="leading-none" data-testid="beat-bpm">
          <span className={`${big ? 'text-6xl' : 'text-4xl'} font-bold tabular-nums`}>{bpm ? String(Math.round(bpm * 10) / 10).replace('.', ',') : '–'}</span>
          <span className="ml-1 text-sm text-slate-400">BPM</span>
        </div>
        {manual && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs" data-testid="beat-manual">
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-semibold text-amber-300" title={t.manualHint}>
              {t.manual}
            </span>
            {onReset && (
              <button type="button" className="rounded border border-slate-600 px-1.5 py-0.5 text-slate-300 hover:bg-slate-800" title={t.resetTempoHint} onClick={onReset} data-testid="beat-reset">
                {t.resetTempo(standardBpm !== undefined ? String(Math.round(standardBpm * 10) / 10).replace('.', ',') : undefined)}
              </button>
            )}
          </div>
        )}
        <div className={`${big ? 'text-2xl' : 'text-lg'} font-semibold text-slate-300 tabular-nums`} data-testid="beat-signature">
          {beats}/{parseTimeSignature(signature).unit}
        </div>
        {onTap && (
          <button
            type="button"
            onClick={onTap}
            title={t.tapTitle}
            className={`rounded-md border font-semibold transition-colors active:scale-95 ${big ? 'min-h-20 min-w-40 px-6 text-3xl' : 'px-3 py-1.5 text-sm'} ${tapping ? 'border-amber-400 bg-amber-500/20 text-amber-200' : 'border-slate-600 hover:bg-slate-800'}`}
            data-testid="beat-tap"
          >
            {tapping ? t.tapProgress(tap.remaining) : t.tap}
          </button>
        )}
        {onBeatStep && !!bpm && (
          <div className="flex gap-2" data-testid="beat-step">
            {([-1, 1] as const).map((dir) => (
              <button
                key={dir}
                type="button"
                onClick={() => onBeatStep(dir)}
                title={dir < 0 ? t.beatBackHint : t.beatForwardHint}
                aria-label={dir < 0 ? t.beatBack : t.beatForward}
                className={`flex flex-1 items-center justify-center gap-1 rounded-md border border-slate-600 font-semibold hover:bg-slate-800 active:scale-95 ${big ? 'min-h-14 px-3 text-lg' : 'px-2 py-1 text-xs'}`}
              >
                {dir < 0 ? <ChevronsLeft size={big ? 22 : 14} aria-hidden /> : null}
                {t.beatShort}
                {dir > 0 ? <ChevronsRight size={big ? 22 : 14} aria-hidden /> : null}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
