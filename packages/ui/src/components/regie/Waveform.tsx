// Wellenform der Audiodatei für die Zeitleisten (Mitschreiben, Szenen, Führen). Standard aus; ein- und ausschalten
// und die Höhe (Verstärkung, damit leise Stellen sichtbar werden) gilt für alle Zeitleisten dieses Browsers.
// Die Datei wird einmal geladen und zu Spitzenwerten (100 je Sekunde) verdichtet; gezeichnet wird nur der Ausschnitt.
import { AudioLines } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { defaultItemMedia, type ShowItem } from '@steckplan/core';
import { api } from '../../lib/api';
import { texts } from '../../texts';

const t = texts.regie.waveform;

// ---------- Einstellung (je Browser, für alle Zeitleisten gemeinsam) ----------

export interface WaveformSettings {
  on: boolean;
  /** Verstärkung der Anzeige (1 = Originalhöhe) */
  gain: number;
}

const KEY = 'steckplan.waveform';
export const GAIN_MIN = 1;
export const GAIN_MAX = 12;
const DEFAULTS: WaveformSettings = { on: false, gain: 1 };

function load(): WaveformSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<WaveformSettings> | null;
    if (!raw) return DEFAULTS;
    const gain = typeof raw.gain === 'number' && Number.isFinite(raw.gain) ? Math.min(GAIN_MAX, Math.max(GAIN_MIN, raw.gain)) : 1;
    return { on: raw.on === true, gain };
  } catch {
    return DEFAULTS;
  }
}

let settings: WaveformSettings | null = null;
const listeners = new Set<() => void>();

function current(): WaveformSettings {
  settings ??= load();
  return settings;
}

export function setWaveformSettings(patch: Partial<WaveformSettings>): void {
  settings = { ...current(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // ohne Speicher gilt die Wahl bis zum Neuladen
  }
  for (const l of listeners) l();
}

export function useWaveformSettings(): WaveformSettings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    current,
    () => DEFAULTS,
  );
}

/** Schalter „Wellenform“ und – eingeschaltet – Regler für die Höhe */
export function WaveformControls({ dark = false }: { dark?: boolean }) {
  const { on, gain } = useWaveformSettings();
  return (
    <span className="flex items-center gap-1.5" data-testid="waveform-controls">
      <label
        className={`flex cursor-pointer items-center gap-1 rounded-md border px-2 py-0.5 ${on ? `border-emerald-500 bg-emerald-500/15 ${dark ? 'text-emerald-200' : 'text-emerald-700 dark:text-emerald-200'}` : dark ? 'border-slate-700' : 'border-slate-300 dark:border-slate-700'}`}
        title={t.hint}
      >
        <input type="checkbox" className="sr-only" checked={on} onChange={(e) => setWaveformSettings({ on: e.target.checked })} aria-label={t.toggle} data-testid="waveform-toggle" />
        <AudioLines size={14} aria-hidden /> {t.toggle}
      </label>
      {on && (
        <label className="flex items-center gap-1" title={t.gainHint}>
          <span className="sr-only sm:not-sr-only">{t.gain}</span>
          <input
            type="range"
            min={GAIN_MIN}
            max={GAIN_MAX}
            step={0.5}
            value={gain}
            onChange={(e) => setWaveformSettings({ gain: Number(e.target.value) })}
            className="w-20 accent-emerald-500"
            aria-label={t.gain}
            data-testid="waveform-gain"
          />
          <span className="w-8 tabular-nums">{String(gain).replace('.', ',')}×</span>
        </label>
      )}
    </span>
  );
}

// ---------- Spitzenwerte der Datei ----------

/** Adresse der Standard-Audiodatei eines Punkts */
export function itemAudioSrc(projectId: string, item: ShowItem | undefined): string | undefined {
  const media = item ? defaultItemMedia(item) : undefined;
  return media ? api.mediaUrl(projectId, media.mediaId) : undefined;
}

/** Spitzenwerte je Sekunde */
export const PEAK_RATE = 100;

export interface Peaks {
  /** Betrag der Spitze je Abschnitt (0 … 1) */
  data: Float32Array;
  rate: number;
}

const cache = new Map<string, Promise<Peaks | null>>();

/** Spitzenwerte aus Abtastwerten (alle Kanäle zusammen) */
export function computePeaks(channels: Float32Array[], sampleRate: number, rate = PEAK_RATE): Peaks {
  const length = channels[0]?.length ?? 0;
  const per = Math.max(1, Math.round(sampleRate / rate));
  const data = new Float32Array(Math.ceil(length / per));
  for (const ch of channels) {
    for (let i = 0; i < data.length; i++) {
      let max = data[i]!;
      const end = Math.min(length, (i + 1) * per);
      for (let j = i * per; j < end; j++) {
        const v = Math.abs(ch[j]!);
        if (v > max) max = v;
      }
      data[i] = max;
    }
  }
  return { data, rate: sampleRate / per };
}

async function decode(src: string): Promise<Peaks | null> {
  const res = await fetch(src, { credentials: 'same-origin' });
  if (!res.ok) return null;
  const buffer = await res.arrayBuffer();
  const Ctx = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx(1, 1, 44100);
  const audio = await ctx.decodeAudioData(buffer);
  const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
  return computePeaks(channels, audio.sampleRate);
}

export function loadPeaks(src: string): Promise<Peaks | null> {
  let p = cache.get(src);
  if (!p) {
    p = decode(src).catch(() => null);
    cache.set(src, p);
  }
  return p;
}

/** Spitzenwerte der Datei, sobald geladen (nur wenn eingeschaltet) */
function usePeaks(src: string | undefined, enabled: boolean): { peaks: Peaks | null; loading: boolean } {
  const [state, setState] = useState<{ src: string; peaks: Peaks | null } | null>(null);
  useEffect(() => {
    if (!src || !enabled) return;
    let alive = true;
    void loadPeaks(src).then((peaks) => {
      if (alive) setState({ src, peaks });
    });
    return () => {
      alive = false;
    };
  }, [src, enabled]);
  const ready = state && state.src === src;
  return { peaks: ready ? state.peaks : null, loading: !!src && enabled && !ready };
}

// ---------- Zeichnen ----------

/**
 * Wellenform des Ausschnitts start … start + span (Sekunden der Zeitleiste) über die ganze Fläche des Elternelements.
 * offset: die Datei beginnt bei diesem Zeitpunkt der Zeitleiste.
 */
export function Waveform({ src, offset = 0, start, span, className = '', color = 'rgb(16 185 129 / 0.45)', force = false }: { src: string | undefined; offset?: number; start: number; span: number; className?: string; color?: string; /** immer zeigen (unabhängig vom Schalter) */ force?: boolean }) {
  const settings = useWaveformSettings();
  const on = settings.on || force;
  const { gain } = settings;
  const { peaks, loading } = usePeaks(src, on);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = canvas.current?.parentElement;
    if (!el || !on) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [on]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !peaks || size.w === 0 || span <= 0) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = Math.round(size.w * ratio);
    c.height = Math.round(size.h * ratio);
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.clearRect(0, 0, size.w, size.h);
    g.fillStyle = color;
    const mid = size.h / 2;
    const perPx = span / size.w;
    for (let x = 0; x < size.w; x++) {
      const from = Math.floor((start + x * perPx - offset) * peaks.rate);
      const to = Math.max(from + 1, Math.floor((start + (x + 1) * perPx - offset) * peaks.rate));
      if (to <= 0 || from >= peaks.data.length) continue;
      let max = 0;
      for (let i = Math.max(0, from); i < Math.min(peaks.data.length, to); i++) if (peaks.data[i]! > max) max = peaks.data[i]!;
      const h = Math.min(1, max * gain) * mid;
      if (h > 0.25) g.fillRect(x, mid - h, 1, h * 2);
    }
  }, [peaks, size, start, span, offset, gain, color]);

  if (!on || !src) return null;
  return (
    <>
      <canvas ref={canvas} className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} data-testid="waveform" data-ready={peaks ? 'true' : undefined} aria-hidden />
      {loading && <span className="pointer-events-none absolute right-1 bottom-0.5 text-[10px] text-slate-400">{t.loading}</span>}
    </>
  );
}
