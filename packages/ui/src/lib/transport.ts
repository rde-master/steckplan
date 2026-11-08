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

/** größte Abweichung der eigenen Uhr vom Audio, bevor nachgeführt wird (Sekunden) */
const DRIFT_SEC = 0.08;

export class Transport extends EventTarget implements Playback {
  private audio: HTMLAudioElement | null = null;
  private playing = false;
  /** Position beim letzten Anker (Sekunden) und Zeitpunkt des Ankers (performance.now) */
  private base = 0;
  private anchor = 0;
  private itemDuration: number | undefined;
  private frame = 0;
  private lastUpdate = 0;
  /** Abspielgeschwindigkeit (1 = Original): die Zeit des Punkts läuft so viel schneller, das Audio ebenso */
  private rate = 1;

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
    const clock = Math.min(this.duration, this.base + ((performance.now() - this.anchor) / 1000) * this.rate);
    if (a && !a.paused && !a.ended) {
      // das Audio meldet seine Position in unregelmäßigen Schritten: gleichmäßige eigene Uhr, solange sie nah dran ist
      const audioAt = a.currentTime + this.offset;
      return Math.abs(clock - audioAt) <= DRIFT_SEC ? clock : audioAt;
    }
    return clock;
  }

  set currentTime(sec: number) {
    this.seek(sec);
  }

  /** Versatz: das Audio beginnt bei dieser Zeit des Punkts (Sekunden; negativ = der Punkt beginnt mitten in der Datei) */
  setOffset(sec: number | undefined): void {
    const next = Math.max(-3600, Math.min(3600, sec ?? 0));
    if (next === this.offset) return;
    const at = this.currentTime;
    this.offset = next;
    this.rebase(at);
    this.syncAudio();
    this.emit('durationchange');
  }

  /** Geschwindigkeit setzen (0,5 … 2; Tonhöhe bleibt) */
  setRate(rate: number): void {
    const next = Number.isFinite(rate) ? Math.min(2, Math.max(0.5, rate)) : 1;
    if (next === this.rate) return;
    const at = this.currentTime;
    this.rate = next;
    this.rebase(at);
    if (this.audio) this.audio.playbackRate = next;
    this.emit('ratechange');
  }

  get playbackRate(): number {
    return this.rate;
  }

  get audioOffset(): number {
    return this.offset;
  }

  /** Länge der gekoppelten Audiodatei (0, solange unbekannt) */
  get audioLength(): number {
    const a = this.audio;
    return a && Number.isFinite(a.duration) ? a.duration : 0;
  }

  /** Position in der Audiodatei (Zeit des Punkts minus Versatz, begrenzt auf die Datei) */
  get audioTime(): number {
    const t = this.currentTime - this.offset;
    const len = this.audioLength;
    return Math.max(0, len ? Math.min(t, len) : t);
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
      audio.playbackRate = this.rate;
      audio.addEventListener('ended', this.onAudioEnded);
      audio.addEventListener('loadedmetadata', this.onAudioMeta);
      if (audio.readyState >= 1) this.syncAudio();
    }
    this.emit('durationchange');
  }

  async play(): Promise<void> {
    if (this.playing) return;
    const restart = this.base >= this.duration; // am Ende: von vorn
    if (restart) this.base = 0;
    this.playing = true;
    this.anchor = performance.now();
    this.syncAudio();
    this.loop();
    if (restart) this.emit('seeked');
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

  /**
   * Audio an die Position des Transports bringen: Position im Audio = Zeit des Punkts minus Versatz.
   * Vor dem Versatz wartet das Audio am Anfang, danach spielt es, solange die Position in der Datei liegt.
   */
  private syncAudio(): void {
    const a = this.audio;
    if (!a) return;
    const length = Number.isFinite(a.duration) ? a.duration : undefined;
    const target = this.base - this.offset;
    const inside = target >= 0 && (length === undefined || target < length - 0.05);
    const wanted = Math.max(0, length === undefined ? target : Math.min(target, length));
    if (Math.abs(a.currentTime - wanted) > 0.05) a.currentTime = wanted;
    if (this.playing && inside) {
      if (a.paused && !this.starting) {
        this.starting = true;
        void a
          .play()
          .catch(() => undefined)
          .finally(() => {
            this.starting = false;
          });
      }
    } else a.pause();
  }

  private starting = false;
  private offset = 0;

  private onAudioEnded = () => {
    // Audio zu Ende, der Punkt läuft weiter (eigene Uhr ab dem Ende des Audios)
    if (this.playing && this.audio) this.rebase(this.offset + this.audio.duration);
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
      if (a && !a.paused && !a.ended) {
        // nur nachführen, wenn die eigene Uhr merklich abweicht (sonst ruckelt die Anzeige mit dem Audio)
        const audioAt = a.currentTime + this.offset;
        if (Math.abs(this.base + ((now - this.anchor) / 1000) * this.rate - audioAt) > DRIFT_SEC) this.rebase(audioAt);
      }
      // Versatz erreicht: Audio einsetzen lassen
      else if (a && !a.ended && this.currentTime >= this.offset) {
        const len = Number.isFinite(a.duration) ? a.duration : undefined;
        if (len === undefined || this.currentTime - this.offset < len - 0.05) {
          this.rebase(this.currentTime);
          this.syncAudio();
        }
      }
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
export function useTransport(itemId: string | undefined, itemDuration: number | undefined, audio: HTMLAudioElement | null, sync = true, offset = 0, rate = 1): Transport {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- je Punkt ein eigener Transport
  const transport = useMemo(() => new Transport(), [itemId]);
  useEffect(() => () => transport.dispose(), [transport]);
  useEffect(() => transport.setItemDuration(itemDuration), [transport, itemDuration]);
  useEffect(() => transport.setOffset(offset), [transport, offset]);
  useEffect(() => transport.setRate(rate), [transport, rate]);
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

/** Geschwindigkeit eines Audio-Elements setzen (0,5 … 2) */
function applyRate(audio: HTMLAudioElement | null, rate: number): void {
  if (audio) audio.playbackRate = Math.min(2, Math.max(0.5, rate));
}

/**
 * Timecode und Musik eines Punkts: tc = Timecode (Transport), music = was der Player steuert und wonach Text und
 * Szenen laufen – mit Musik gekoppelt der Transport selbst, sonst das Audio-Element (ohne Audio: der Timecode).
 */
export function usePointPlayback(itemId: string | undefined, itemDuration: number | undefined, audio: HTMLAudioElement | null, offset = 0, rate = 1): { tc: Transport; music: Playback; sync: boolean } {
  const sync = useTimecodeSync();
  const tc = useTransport(itemId, itemDuration, audio, sync, offset, rate);
  // ohne Kopplung spielt das Audio-Element selbst – auch dann mit der Geschwindigkeit
  useEffect(() => applyRate(audio, rate), [audio, rate]);
  return { tc, music: sync || !audio ? tc : audio, sync };
}
