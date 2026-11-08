// Klick (Metronom) zur Wiedergabe: auf jeden Schlag ein kurzer Ton, die „1“ höher und lauter. Dazu der Vorlauf
// (einen Takt früher starten bzw. am Anfang einen Takt einzählen). Beides je Gerät (Browser), weil jeder seinen
// Klick auf dem eigenen Kopfhörer hat. Töne per WebAudio, im Voraus eingeplant – genau im Takt der Wiedergabe.
import { useEffect, useSyncExternalStore } from 'react';
import { itemTempo, parseTimeSignature, type ShowItem } from '@steckplan/core';
import { Transport, type Playback } from './transport';

export interface ClickSettings {
  /** Klick auf jeden Schlag */
  click: boolean;
  /** Vorlauf: einen Takt früher starten bzw. einzählen */
  preroll: boolean;
  /** Lautstärke 0 … 1 */
  volume: number;
}

const KEY = 'steckplan.click';
const DEFAULTS: ClickSettings = { click: false, preroll: false, volume: 0.6 };

function load(): ClickSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<ClickSettings> | null;
    if (!raw) return DEFAULTS;
    const volume = typeof raw.volume === 'number' && raw.volume >= 0 && raw.volume <= 1 ? raw.volume : DEFAULTS.volume;
    return { click: raw.click === true, preroll: raw.preroll === true, volume };
  } catch {
    return DEFAULTS;
  }
}

let settings: ClickSettings | null = null;
const listeners = new Set<() => void>();
const current = () => (settings ??= load());

export function setClickSettings(patch: Partial<ClickSettings>): void {
  settings = { ...current(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // ohne Speicher gilt die Wahl bis zum Neuladen
  }
  for (const l of listeners) l();
}

export function useClickSettings(): ClickSettings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    current,
    () => DEFAULTS,
  );
}

// ---------- Töne ----------

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !window.AudioContext) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}

/** gespielte Klicks (für Tests): Zeitpunkt (AudioContext) und ob „1“ */
export const clickLog: { at: number; accent: boolean }[] = [];

/** Einen Klick zur Zeit when (AudioContext-Zeit) einplanen; die „1“ höher und lauter */
function playClick(c: AudioContext, when: number, accent: boolean, volume: number): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'square';
  osc.frequency.value = accent ? 1760 : 1100;
  const peak = Math.max(0.0001, volume * (accent ? 0.5 : 0.3));
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(peak, when + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + (accent ? 0.06 : 0.04));
  osc.connect(gain).connect(c.destination);
  osc.start(when);
  osc.stop(when + 0.08);
  clickLog.push({ at: when, accent });
  if (clickLog.length > 200) clickLog.shift();
}

/** so weit im Voraus einplanen (Sekunden echte Zeit) */
const LOOKAHEAD = 0.15;
/** so spät darf ein Schlag noch kommen (Sekunden) */
const LATE = 0.06;

/**
 * Klick und Vorlauf für die Wiedergabe eines Punkts. Raster aus Tempo der Aufnahme und Lage der „1“
 * (siehe itemTempo); läuft das Lied schneller, kommen die Klicks entsprechend schneller.
 */
export function useClickTrack(playback: Playback | null, item: Pick<ShowItem, 'bpm' | 'beatOffsetSec' | 'manualBpm' | 'manualBeatOffsetSec' | 'timeSignature'> | undefined): void {
  const { click, preroll, volume } = useClickSettings();
  const tempo = itemTempo(item ?? {});
  const gridBpm = tempo.gridBpm;
  const offset = tempo.offset ?? 0;
  const { beats } = parseTimeSignature(item?.timeSignature);
  const tr = playback instanceof Transport ? playback : null;

  // Vorlauf am Transport einstellen (ein Takt in der Zeit des Punkts)
  useEffect(() => {
    if (!tr) return;
    tr.setPreroll(preroll && gridBpm ? { barSec: (60 / gridBpm) * beats, beats } : null);
    return () => tr.setPreroll(null);
  }, [tr, preroll, gridBpm, beats]);

  // Einzählen: ein Takt Klicks (auch ohne Klick während des Lieds)
  useEffect(() => {
    if (!tr) return;
    const onCount = (e: Event) => {
      const { beats: n, beatSec } = (e as CustomEvent<{ beats: number; beatSec: number }>).detail;
      const c = audio();
      if (!c) return;
      const t0 = c.currentTime + 0.03;
      for (let i = 0; i < n; i++) playClick(c, t0 + i * beatSec, i === 0, current().volume);
    };
    tr.addEventListener('countin', onCount);
    return () => tr.removeEventListener('countin', onCount);
  }, [tr]);

  // Klick während der Wiedergabe: Schläge im Voraus einplanen
  useEffect(() => {
    if (!playback || !click || !gridBpm) return;
    const beatLen = 60 / gridBpm;
    let next: number | null = null; // Index des nächsten einzuplanenden Schlags
    const reset = () => {
      next = null;
    };
    // beim Start sofort einplanen (nicht erst beim nächsten Takt des Zeitgebers)
    const onPlay = () => {
      next = null;
      tick();
    };
    const tick = () => {
      if (playback.paused) {
        next = null;
        return;
      }
      const c = audio();
      if (!c) return;
      const rate = (playback as { playbackRate?: number }).playbackRate || 1;
      const now = playback.currentTime;
      // ein gerade erst erreichter Schlag (Start genau auf dem Schlag) zählt noch
      if (next === null) next = Math.ceil((now - offset - LATE) / beatLen);
      // Schläge bis LOOKAHEAD echte Sekunden voraus
      for (;;) {
        const at = offset + next * beatLen;
        const wait = (at - now) / rate;
        if (wait > LOOKAHEAD) break;
        if (wait >= -LATE && at >= 0) playClick(c, c.currentTime + Math.max(0, wait), ((next % beats) + beats) % beats === 0, volume);
        next++;
      }
    };
    const timer = window.setInterval(tick, 25);
    for (const ev of ['seeked', 'pause', 'ratechange']) playback.addEventListener(ev, reset);
    playback.addEventListener('play', onPlay);
    return () => {
      window.clearInterval(timer);
      for (const ev of ['seeked', 'pause', 'ratechange']) playback.removeEventListener(ev, reset);
      playback.removeEventListener('play', onPlay);
    };
  }, [playback, click, gridBpm, offset, beats, volume]);
}

/** für Tests im Browser: gespielte Klicks */
if (typeof window !== 'undefined') (window as unknown as { __steckplanClicks?: typeof clickLog }).__steckplanClicks = clickLog;
