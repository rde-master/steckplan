// Transport je Ablaufpunkt: Start, Pause, Position und Ende gehören zum Punkt, nicht zum Lied.
// „Mit Musik“ (Standard): Das Lied hängt daran – solange das Audio läuft, gibt es den Takt vor (genau); ist es zu Ende
// oder gibt es keins, läuft die Zeit mit eigener Uhr weiter. Ohne „Mit Musik“ läuft der Timecode nur mit eigener Uhr,
// die Musik unabhängig davon. Die Länge kommt allein aus der Dauer des Punkts im Projekt (ohne Dauer: bis Stopp).
// Nach außen wie ein Audio-Element (currentTime, paused, duration, play/pause, Ereignisse) – Leertaste, Spulen,
// Szenen, Textfenster und Führen funktionieren damit unverändert.
import { useEffect, useMemo, useSyncExternalStore } from 'react';

/** Was Player, Tasten und Anzeigen von der Wiedergabe brauchen (Transport und Audio-Element erfüllen es) */
export interface Playback extends EventTarget {
  currentTime: number;
  readonly paused: boolean;
  readonly duration: number;
  play(): Promise<void>;
  pause(): void;
}

export class Transport extends EventTarget implements Playback {
  private audio: HTMLAudioElement | null = null;
  private playing = false;
  /** Position beim letzten Anker (Sekunden) und Zeitpunkt des Ankers (performance.now) */
  private base = 0;
  private anchor = 0;
  private itemDuration: number | undefined;
  private frame = 0;
  private lastUpdate = 0;

  constructor(itemDuration?: number) {
    super();
    this.itemDuration = itemDuration;
  }

  /** Ende: Dauer des Punkts im Projekt; ohne Dauer läuft er, bis man anhält */
  get duration(): number {
    return this.itemDuration && this.itemDuration > 0 ? this.itemDuration : Number.POSITIVE_INFINITY;
  }

  get paused(): boolean {
    return !this.playing;
  }

  get currentTime(): number {
    if (!this.playing) return this.base;
    const a = this.audio;
    if (a && !a.paused && !a.ended) return a.currentTime;
    return Math.min(this.duration, this.base + (performance.now() - this.anchor) / 1000);
  }

  set currentTime(sec: number) {
    this.seek(sec);
  }

  setItemDuration(sec: number | undefined): void {
    if (sec === this.itemDuration) return;
    this.itemDuration = sec;
    this.emit('durationchange');
  }

  /**
   * Audio-Element des Punkts koppeln (wechselt z. B. zwischen Playback und Klick) – übernimmt die laufende Position.
   * null entkoppelt; pauseOld = false lässt die Musik dabei weiterlaufen („Mit Musik“ aus).
   */
  attach(audio: HTMLAudioElement | null, pauseOld = true): void {
    if (audio === this.audio) return;
    const at = this.currentTime;
    if (this.audio) {
      this.audio.removeEventListener('ended', this.onAudioEnded);
      this.audio.removeEventListener('loadedmetadata', this.onAudioMeta);
      if (pauseOld) this.audio.pause();
    }
    this.audio = audio;
    this.rebase(at);
    if (audio) {
      audio.addEventListener('ended', this.onAudioEnded);
      audio.addEventListener('loadedmetadata', this.onAudioMeta);
      if (audio.readyState >= 1) this.syncAudio();
    }
    this.emit('durationchange');
  }

  async play(): Promise<void> {
    if (this.playing) return;
    if (this.base >= this.duration) this.base = 0; // am Ende: von vorn
    this.playing = true;
    this.anchor = performance.now();
    this.syncAudio();
    this.loop();
    this.emit('play');
  }

  pause(): void {
    if (!this.playing) return;
    this.base = this.currentTime;
    this.playing = false;
    this.audio?.pause();
    cancelAnimationFrame(this.frame);
    this.emit('pause');
  }

  /** Stopp: anhalten und zurück auf 0 */
  stop(): void {
    this.pause();
    this.seek(0);
  }

  seek(sec: number): void {
    this.rebase(Math.min(Math.max(0, sec), this.duration));
    this.syncAudio();
    this.emit('seeked');
    this.emit('timeupdate');
  }

  dispose(): void {
    this.pause();
    this.attach(null);
  }

  // ---------- intern ----------

  private rebase(at: number): void {
    this.base = at;
    this.anchor = performance.now();
  }

  /** Audio an die Position des Transports bringen (abspielen, solange die Position im Audio liegt) */
  private syncAudio(): void {
    const a = this.audio;
    if (!a) return;
    const length = Number.isFinite(a.duration) ? a.duration : undefined;
    const inside = length === undefined || this.base < length - 0.05;
    if (Math.abs(a.currentTime - this.base) > 0.05 && (length === undefined || this.base <= length)) a.currentTime = this.base;
    if (this.playing && inside) void a.play().catch(() => undefined);
    else a.pause();
  }

  private onAudioEnded = () => {
    // Audio zu Ende, der Punkt läuft weiter (eigene Uhr ab dem Ende des Audios)
    if (this.playing && this.audio) this.rebase(this.audio.duration);
  };

  private onAudioMeta = () => {
    this.syncAudio();
    this.emit('durationchange');
  };

  private loop(): void {
    cancelAnimationFrame(this.frame);
    const tick = () => {
      if (!this.playing) return;
      const now = performance.now();
      const a = this.audio;
      // läuft das Audio, ist seine Zeit maßgeblich – Anker nachführen, damit die eigene Uhr nahtlos übernimmt
      if (a && !a.paused && !a.ended) this.rebase(a.currentTime);
      if (this.currentTime >= this.duration) {
        this.base = this.duration;
        this.playing = false;
        a?.pause();
        this.emit('timeupdate');
        this.emit('pause');
        this.emit('ended');
        return;
      }
      if (now - this.lastUpdate > 250) {
        this.lastUpdate = now;
        this.emit('timeupdate');
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private emit(type: string): void {
    this.dispatchEvent(new Event(type));
  }
}

/** Transport (Timecode) für einen Ablaufpunkt (neu je Punkt), mit dessen Dauer; „Mit Musik“ koppelt das Audio */
export function useTransport(itemId: string | undefined, itemDuration: number | undefined, audio: HTMLAudioElement | null, sync = true): Transport {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- je Punkt ein eigener Transport
  const transport = useMemo(() => new Transport(), [itemId]);
  useEffect(() => () => transport.dispose(), [transport]);
  useEffect(() => transport.setItemDuration(itemDuration), [transport, itemDuration]);
  // entkoppeln lässt die Musik weiterlaufen
  useEffect(() => transport.attach(sync ? audio : null, false), [transport, audio, sync]);
  return transport;
}

// ---------- „Timecode mit Musik“ (je Gerät gemerkt) ----------

const SYNC_KEY = 'steckplan.timecodeSync';
const syncListeners = new Set<() => void>();
function readSync(): boolean {
  try {
    return localStorage.getItem(SYNC_KEY) !== 'off';
  } catch {
    return true;
  }
}
let syncValue = typeof window === 'undefined' ? true : readSync();

export function setTimecodeSync(on: boolean): void {
  syncValue = on;
  try {
    localStorage.setItem(SYNC_KEY, on ? 'on' : 'off');
  } catch {
    // ohne Speicher gilt die Wahl bis zum Neuladen
  }
  for (const l of syncListeners) l();
}

export function useTimecodeSync(): boolean {
  return useSyncExternalStore(
    (l) => {
      syncListeners.add(l);
      return () => syncListeners.delete(l);
    },
    () => syncValue,
  );
}

/**
 * Timecode und Musik eines Punkts: tc = Timecode (Transport), music = was der Player steuert und wonach Text und
 * Szenen laufen – mit Musik gekoppelt der Transport selbst, sonst das Audio-Element (ohne Audio: der Timecode).
 */
export function usePointPlayback(itemId: string | undefined, itemDuration: number | undefined, audio: HTMLAudioElement | null): { tc: Transport; music: Playback; sync: boolean } {
  const sync = useTimecodeSync();
  const tc = useTransport(itemId, itemDuration, audio, sync);
  return { tc, music: sync || !audio ? tc : audio, sync };
}
