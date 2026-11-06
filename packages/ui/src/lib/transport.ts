// Transport je Ablaufpunkt: Start, Pause, Position und Ende gehören zum Punkt, nicht zum Lied.
// Das Lied hängt daran: Solange das Audio läuft, gibt es den Takt vor (genau); ist es zu Ende oder gibt es keins,
// läuft die Zeit mit eigener Uhr weiter. Am Ende der Dauer (Dauer des Punkts bzw. des Audios, die längere) hält er an.
// Nach außen wie ein Audio-Element (currentTime, paused, duration, play/pause, Ereignisse) – Leertaste, Spulen,
// Szenen, Textfenster und Führen funktionieren damit unverändert.
import { useEffect, useMemo } from 'react';

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

  /** Ende: die längere von Dauer des Punkts und Länge des Audios; ohne beides läuft er, bis man anhält */
  get duration(): number {
    const audio = this.audio && Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
    const limit = Math.max(this.itemDuration ?? 0, audio);
    return limit > 0 ? limit : Number.POSITIVE_INFINITY;
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

  /** Audio-Element des Punkts (wechselt z. B. zwischen Playback und Klick) – übernimmt die laufende Position */
  attach(audio: HTMLAudioElement | null): void {
    if (audio === this.audio) return;
    const at = this.currentTime;
    if (this.audio) {
      this.audio.removeEventListener('ended', this.onAudioEnded);
      this.audio.removeEventListener('loadedmetadata', this.onAudioMeta);
      this.audio.pause();
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

/** Transport für einen Ablaufpunkt (neu je Punkt), mit dessen Audio-Element und Dauer */
export function useTransport(itemId: string | undefined, itemDuration: number | undefined, audio: HTMLAudioElement | null): Transport {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- je Punkt ein eigener Transport
  const transport = useMemo(() => new Transport(), [itemId]);
  useEffect(() => () => transport.dispose(), [transport]);
  useEffect(() => transport.setItemDuration(itemDuration), [transport, itemDuration]);
  useEffect(() => transport.attach(audio), [transport, audio]);
  return transport;
}
