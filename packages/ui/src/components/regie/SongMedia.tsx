// Lied: Audiodateien (hochladen, Standard, Bezeichnung), Player-Leiste und Text zum Mitlesen/Mitschreiben.
import { Pause, Play, Square, Star, Trash2, Upload, Volume2, X } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type * as Y from 'yjs';
import {
  addItemMedia,
  currentLineId,
  defaultItemMedia,
  formatDuration,
  formatTimecode,
  remainRange,
  removeItemMedia,
  setLineTime,
  updateItemMedia,
  updateShowItem,
  type MediaRef,
  type ShowItem,
  type ShowSettings,
  type TimedLine,
} from '@steckplan/core';
import { api, errorMessage } from '../../lib/api';
import { readAudioDuration, uploadMedia } from '../../lib/mediaUpload';
import { useSession } from '../../lib/session';
import { setTimecodeSync, type Playback } from '../../lib/transport';
import { texts } from '../../texts';
import { ICON } from '../icons';
import { Button } from '../ui';

const t = texts.regie.media;

// ---------- laufende Uploads (über Komponenten hinweg) ----------

interface RunningUpload {
  key: string;
  itemId: string;
  name: string;
  received: number;
  total: number;
  error?: string;
  retry?: () => void;
  cancel: () => void;
}

let uploads: RunningUpload[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function setUploads(next: RunningUpload[]): void {
  uploads = next;
  emit();
}
function patchUpload(key: string, patch: Partial<RunningUpload>): void {
  setUploads(uploads.map((u) => (u.key === key ? { ...u, ...patch } : u)));
}
function useUploads(itemId: string): RunningUpload[] {
  const all = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => uploads,
  );
  return all.filter((u) => u.itemId === itemId);
}

function startUpload(projectId: string, doc: Y.Doc, origin: object, item: ShowItem, file: File, by: string): void {
  const key = `${item.id}:${file.name}:${file.size}:${file.lastModified}`;
  if (uploads.some((u) => u.key === key && !u.error)) return;
  const run = () => {
    const controller = new AbortController();
    setUploads([...uploads.filter((u) => u.key !== key), { key, itemId: item.id, name: file.name, received: 0, total: file.size, cancel: () => controller.abort() }]);
    void (async () => {
      try {
        const duration = await readAudioDuration(file);
        const info = await uploadMedia(projectId, file, { signal: controller.signal, onProgress: (received) => patchUpload(key, { received }) });
        const ref: MediaRef = {
          id: info.id,
          name: file.name,
          mime: file.type,
          sizeBytes: info.sizeBytes,
          ...(duration !== undefined ? { durationSec: Math.round(duration * 10) / 10 } : {}),
          sha256: info.sha256,
          addedAt: new Date().toISOString(),
          addedBy: by,
        };
        addItemMedia(doc, item.id, ref, file.name.replace(/\.[^.]+$/, ''), origin);
        // Dauer des Lieds aus der ersten Datei übernehmen, wenn noch keine eingetragen ist
        const current = (doc.getMap('showItems').get(item.id) as Y.Map<unknown> | undefined)?.get('durationSec');
        if (current === undefined && duration !== undefined) updateShowItem(doc, item.id, { durationSec: Math.round(duration) }, origin);
        setUploads(uploads.filter((u) => u.key !== key));
      } catch (error) {
        if ((error as Error).name === 'AbortError') setUploads(uploads.filter((u) => u.key !== key));
        else patchUpload(key, { error: errorMessage(error), retry: run });
      }
    })();
  };
  run();
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} GB`;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(n / 1024))} kB`;
}

// ---------- Audiodateien am Lied ----------

export function MediaSection({ projectId, doc, origin, item, media, editable }: { projectId: string; doc: Y.Doc; origin: object; item: ShowItem; media: MediaRef[]; editable: boolean }) {
  const running = useUploads(item.id);
  const by = useSession((s) => s.session?.name ?? '');
  const input = useRef<HTMLInputElement>(null);
  const refs = new Map(media.map((m) => [m.id, m]));
  const list = item.media ?? [];
  return (
    <section className="space-y-2" aria-label={t.title} data-testid="regie-media">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{t.title}</h3>
        <div className="flex-1" />
        {editable && (
          <>
            <input
              ref={input}
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac"
              multiple
              className="hidden"
              aria-label={t.add}
              onChange={(e) => {
                for (const file of Array.from(e.target.files ?? [])) startUpload(projectId, doc, origin, item, file, by);
                e.target.value = '';
              }}
            />
            <Button variant="ghost" className="text-xs" onClick={() => input.current?.click()}>
              <Upload {...ICON} /> {t.add}
            </Button>
          </>
        )}
      </div>
      {list.length === 0 && running.length === 0 && <p className="text-sm text-slate-500">{t.none}</p>}
      <ul className="space-y-1">
        {list.map((m) => {
          const ref = refs.get(m.mediaId);
          return (
            <li key={m.mediaId} className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 px-2 py-1 text-sm dark:border-slate-700" data-testid="regie-media-file">
              <button
                type="button"
                aria-label={`${t.default}: ${m.label}`}
                aria-pressed={!!m.isDefault}
                title={t.default}
                disabled={!editable}
                onClick={() => updateItemMedia(doc, item.id, m.mediaId, { isDefault: true }, origin)}
                className={m.isDefault ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'}
              >
                <Star size={16} fill={m.isDefault ? 'currentColor' : 'none'} aria-hidden />
              </button>
              <input
                aria-label={t.label}
                className="min-w-28 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-slate-300 focus:border-sky-500 focus:outline-none disabled:hover:border-transparent dark:hover:border-slate-600"
                value={m.label}
                disabled={!editable}
                onChange={(e) => updateItemMedia(doc, item.id, m.mediaId, { label: e.target.value }, origin)}
              />
              <span className="truncate text-xs text-slate-500" title={ref?.name}>
                {ref?.name} · {ref ? formatBytes(ref.sizeBytes) : '?'}
                {ref?.durationSec !== undefined ? ` · ${formatDuration(ref.durationSec)}` : ''}
              </span>
              {editable && (
                <Button variant="ghost" className="min-h-8 px-1.5" aria-label={`${t.remove}: ${m.label}`} onClick={() => removeItemMedia(doc, item.id, m.mediaId, origin)}>
                  <Trash2 {...ICON} />
                </Button>
              )}
            </li>
          );
        })}
        {running.map((u) => (
          <li key={u.key} className="space-y-1 rounded-md border border-dashed border-slate-300 px-2 py-1 text-sm dark:border-slate-600" data-testid="regie-upload">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{u.name}</span>
              <span className="text-xs tabular-nums text-slate-500">
                {formatBytes(u.received)} / {formatBytes(u.total)}
              </span>
              {u.error && u.retry && (
                <Button variant="ghost" className="min-h-7 px-1.5 text-xs" onClick={u.retry}>
                  {t.retry}
                </Button>
              )}
              <Button variant="ghost" className="min-h-7 px-1.5" aria-label={`${t.cancel}: ${u.name}`} onClick={() => (u.error ? setUploads(uploads.filter((x) => x.key !== u.key)) : u.cancel())}>
                <X {...ICON} />
              </Button>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-label={u.name} aria-valuemin={0} aria-valuemax={u.total} aria-valuenow={u.received}>
              <div className={`h-full ${u.error ? 'bg-red-500' : 'bg-sky-600'}`} style={{ width: `${u.total ? (u.received / u.total) * 100 : 0}%` }} />
            </div>
            {u.error && <div className="text-xs text-red-700 dark:text-red-400">{t.failed(u.error)}</div>}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- Player ----------

/** Abspielposition setzen (außerhalb der Komponenten: Transport bzw. Element gehören nicht dem React-Zustand) */
export function seekAudio(el: Playback | null, sec: number): void {
  if (el) el.currentTime = Math.max(0, sec);
}
/** Lautstärke des Audio-Elements im Player */
function setAudioVolume(container: HTMLElement | null, volume: number): void {
  const el = container?.querySelector('audio');
  if (el) el.volume = volume;
}

/** Aktuelle Abspielzeit (flüssig per requestAnimationFrame, solange abgespielt wird). */
export function usePlayerTime(el: Playback | null): number {
  const [time, setTime] = useState(0);
  useEffect(() => {
    if (!el) return;
    let frame = 0;
    const tick = () => {
      setTime(el.currentTime);
      if (!el.paused) frame = requestAnimationFrame(tick);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    };
    const update = () => setTime(el.currentTime);
    update();
    el.addEventListener('play', start);
    el.addEventListener('seeked', update);
    el.addEventListener('timeupdate', update);
    el.addEventListener('pause', update);
    el.addEventListener('loadedmetadata', update);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('play', start);
      el.removeEventListener('seeked', update);
      el.removeEventListener('timeupdate', update);
      el.removeEventListener('pause', update);
      el.removeEventListener('loadedmetadata', update);
    };
  }, [el]);
  return time;
}

/** Läuft der Transport? Ende (Dauer) – für die Anzeige */
function usePlaybackState(playback: Playback | null): { playing: boolean; duration: number } {
  const [state, setState] = useState({ playing: false, duration: Number.POSITIVE_INFINITY });
  useEffect(() => {
    if (!playback) return;
    const sync = () => setState({ playing: !playback.paused, duration: playback.duration });
    sync();
    const events = ['play', 'pause', 'ended', 'durationchange', 'loadedmetadata'];
    for (const e of events) playback.addEventListener(e, sync);
    return () => {
      for (const e of events) playback.removeEventListener(e, sync);
    };
  }, [playback]);
  return state;
}

/**
 * Timecode-Feld: „Mit Musik“, eigene Knöpfe (Stopp, Start/Pause, Spulen), grüne Uhr und darunter rot die Restzeit
 * bis zur geplanten Dauer. Mit Musik wirken die Knöpfe auch auf die Musik, sonst nur auf den Timecode.
 */
export function TimecodePanel({
  tc,
  sync,
  large = false,
  follow,
}: {
  tc: Playback & { stop(): void };
  sync: boolean;
  large?: boolean;
  /** beim Folgen: Timecode der führenden Vorstellung anzeigen (eigene Knöpfe aus) */
  follow?: { time: number; playing: boolean };
}) {
  const ownTime = usePlayerTime(tc);
  const own = usePlaybackState(tc);
  const time = follow ? follow.time : ownTime;
  const playing = follow ? follow.playing : own.playing;
  const duration = own.duration;
  const remaining = Number.isFinite(duration) ? Math.max(0, duration - time) : undefined;
  const button = `rounded tabular-nums text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 ${large ? 'min-h-9 min-w-9 px-2 py-1.5 text-sm' : 'px-1.5 py-1 text-xs'}`;
  const icon = large ? 20 : 16;
  return (
    <div className="flex shrink-0 flex-col items-end gap-1" data-testid="timecode-panel">
      <div className={`flex flex-wrap items-center justify-end gap-0.5 ${follow ? 'hidden' : ''}`}>
        <label className={`mr-1 flex items-center gap-1 text-slate-600 dark:text-slate-300 ${large ? 'text-sm' : 'text-xs'}`} title={t.tcSyncHint}>
          <input type="checkbox" checked={sync} onChange={(e) => setTimecodeSync(e.target.checked)} />
          {t.tcSync}
        </label>
        <button type="button" className={button} aria-label={t.tcStop} title={t.tcStop} onClick={() => tc.stop()}>
          <Square size={icon - 2} aria-hidden />
        </button>
        {[-5, -1].map((d) => (
          <button key={d} type="button" className={button} aria-label={t.tcBack(-d)} title={t.tcBack(-d)} onClick={() => seekAudio(tc, tc.currentTime + d)}>
            {d}
          </button>
        ))}
        <button type="button" className={`${button} text-emerald-600 dark:text-emerald-400`} aria-label={playing ? t.tcPause : t.tcStart} title={playing ? t.tcPause : t.tcStart} onClick={() => (playing ? tc.pause() : void tc.play())}>
          {playing ? <Pause size={icon} aria-hidden /> : <Play size={icon} aria-hidden />}
        </button>
        {[1, 5].map((d) => (
          <button key={d} type="button" className={button} aria-label={t.tcForward(d)} title={t.tcForward(d)} onClick={() => seekAudio(tc, tc.currentTime + d)}>
            +{d}
          </button>
        ))}
      </div>
      <TimecodeClock time={time} className={large ? 'px-4 py-2 text-3xl sm:text-5xl' : ''} />
      {remaining !== undefined && (
        <span className={`font-mono font-bold tabular-nums text-red-500 ${large ? 'text-xl sm:text-3xl' : 'text-base'}`} title={t.tcRemaining} data-testid="timecode-remaining">
          −{formatTimecode(remaining)}
        </span>
      )}
    </div>
  );
}

/** Große Timecode-Uhr (HH:MM:SS:FF, grün): gelaufene Zeit des Ablaufpunkts, jeder beginnt bei 00:00:00:00 */
export function TimecodeClock({ time, className = '' }: { time: number; className?: string }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-md bg-black px-2.5 py-1 font-mono text-2xl leading-none font-bold tracking-wider text-emerald-400 tabular-nums [text-shadow:0_0_8px_rgb(52_211_153/0.6)] ${className}`}
      title={t.timecode}
      data-testid="timecode"
    >
      {formatTimecode(time)}
    </span>
  );
}

export function PlayerBar({
  projectId,
  item,
  media,
  setAudio,
  playback,
  time,
  recording,
  onNextLine,
  nextLineText,
  onClearTimes,
  markers = [],
  settings = {},
  aside,
}: {
  markers?: { id: string; at: number; label: string }[];
  /** Regie-Einstellungen (Schwellen der Restzeit) */
  settings?: Pick<ShowSettings, 'remainWarnSec' | 'remainBlinkSec'>;
  projectId: string;
  item: ShowItem;
  media: MediaRef[];
  /** Audio-Element des Punkts (für den Transport) */
  setAudio: (el: HTMLAudioElement | null) => void;
  /** Transport des Ablaufpunkts */
  playback: Playback | null;
  time: number;
  recording: boolean;
  onNextLine: () => void;
  nextLineText: string | undefined;
  onClearTimes: () => void;
  /** rechts daneben (z. B. das Timecode-Feld) */
  aside?: ReactNode;
}) {
  const list = item.media ?? [];
  const [selected, setSelected] = useState<string | undefined>(defaultItemMedia(item)?.mediaId);
  const current = list.find((m) => m.mediaId === selected) ?? defaultItemMedia(item);
  const { playing, duration: end } = usePlaybackState(playback);
  const duration = Number.isFinite(end) ? end : 0;
  const [volume, setVolume] = useState(1);
  const container = useRef<HTMLDivElement>(null);
  usePlayPauseKey(playback, !recording);
  // beim Wechsel des Punkts bzw. der Datei die Musik anhalten (ohne „Mit Musik“ hängt sie nicht am Timecode)
  const mediaId = current?.mediaId;
  useEffect(() => {
    const el = container.current?.querySelector('audio');
    return () => el?.pause();
  }, [mediaId]);
  const toggle = () => {
    if (!playback) return;
    if (playback.paused) void playback.play();
    else playback.pause();
  };
  const nudge = (d: number) => playback && seekAudio(playback, playback.currentTime + d);
  return (
    <div ref={container} className="sticky bottom-0 z-10 -mx-4 space-y-1.5 border-t border-slate-200 bg-white/95 px-4 py-2 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95" data-testid="regie-player">
      {current && <audio ref={setAudio} src={api.mediaUrl(projectId, current.mediaId)} preload="metadata" />}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex shrink-0 items-center gap-0.5">
          {[-5, -1, -0.5].map((d) => (
            <Button key={d} variant="ghost" className="min-h-8 px-1 text-xs tabular-nums" aria-label={t.back(-d)} title={`${t.back(-d)}${d === -1 ? ` (${t.nudgeKey})` : ''}`} onClick={() => nudge(d)}>
              {String(d).replace('.', ',')}
            </Button>
          ))}
          <Button variant="primary" className="h-10 w-10 shrink-0 rounded-full p-0" aria-label={playing ? t.pause : t.play} title={t.playKey} onClick={toggle}>
            {playing ? <Pause size={18} aria-hidden /> : <Play size={18} aria-hidden />}
          </Button>
          {[0.5, 1, 5].map((d) => (
            <Button key={d} variant="ghost" className="min-h-8 px-1 text-xs tabular-nums" aria-label={t.forward(d)} title={`${t.forward(d)}${d === 1 ? ` (${t.nudgeKey})` : ''}`} onClick={() => nudge(d)}>
              +{String(d).replace('.', ',')}
            </Button>
          ))}
        </span>
        <div className="relative min-w-32 flex-1">
          <input
            type="range"
            aria-label={t.position}
            className="w-full accent-sky-600"
            min={0}
            max={duration || Math.max(1, time)}
            step={0.1}
            value={duration ? Math.min(time, duration) : time}
            onChange={(e) => {
              seekAudio(playback, Number(e.target.value));
            }}
          />
          {/* Lichtszenen als Marken auf der Zeitleiste */}
          {duration > 0 &&
            markers
              .filter((m) => m.at <= duration)
              .map((m) => (
                <button
                  key={m.id}
                  type="button"
                  title={m.label}
                  aria-label={`${t.marker}: ${m.label}`}
                  data-testid="scene-marker"
                  onClick={() => seekAudio(playback, m.at)}
                  className="absolute -top-1.5 h-2.5 w-1.5 -translate-x-1/2 rounded-sm bg-amber-500 hover:bg-amber-600"
                  style={{ left: `${(m.at / duration) * 100}%` }}
                />
              ))}
        </div>
        <span className="shrink-0 text-xs tabular-nums text-slate-600 dark:text-slate-300" data-testid="regie-time">
          {formatDuration(time)}
          {duration > 0 ? ` / ${formatDuration(duration)}` : ''}
        </span>
        {duration > 0 && <RemainingTime remaining={Math.max(0, duration - time)} playing={playing} {...remainRange(settings)} />}
        {current && (
          <label className="hidden items-center gap-1 sm:flex" title={t.volume}>
            <Volume2 size={16} className="text-slate-500" aria-hidden />
            <input
              type="range"
              aria-label={t.volume}
              className="w-20 accent-sky-600"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => {
                setVolume(Number(e.target.value));
                setAudioVolume(container.current, Number(e.target.value));
              }}
            />
          </label>
        )}
        {aside && <div className="ml-auto">{aside}</div>}
      </div>
      {(list.length > 1 || recording) && (
        <div className="flex flex-wrap items-center gap-2">
          {list.length > 1 && current && (
            <select
              aria-label={t.file}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800"
              value={current.mediaId}
              // Position und Wiedergabe übernimmt der Transport (z. B. von Playback auf Klick wechseln)
              onChange={(e) => setSelected(e.target.value)}
            >
              {list.map((m) => (
                <option key={m.mediaId} value={m.mediaId}>
                  {m.label || media.find((r) => r.id === m.mediaId)?.name}
                </option>
              ))}
            </select>
          )}
          {recording && (
            <>
              <Button variant="primary" className="min-h-9 flex-1 text-sm" disabled={!nextLineText} onClick={onNextLine} title={t.nextLineKey}>
                {t.nextLine}
                {nextLineText ? <span className="ml-1 truncate font-normal opacity-80">„{nextLineText}“</span> : null}
              </Button>
              <Button variant="ghost" className="text-xs" onClick={onClearTimes}>
                {t.clearTimes}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Text zum Mitlesen / Mitschreiben ----------

function formatAt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

export function LyricsView({
  doc,
  origin,
  lines,
  time,
  recording,
  editable,
  onSeek,
}: {
  doc: Y.Doc;
  origin: object;
  lines: TimedLine[];
  time: number;
  recording: boolean;
  editable: boolean;
  onSeek: (sec: number) => void;
}) {
  const current = currentLineId(lines, time);
  const refs = useRef(new Map<string, HTMLLIElement>());
  useEffect(() => {
    if (current) refs.current.get(current)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [current]);
  if (lines.length === 0) return <p className="text-sm text-slate-500">{texts.regie.noText}</p>;
  return (
    <ol className="space-y-0.5" data-testid="regie-lyrics">
      {lines.map(({ sectionId, sectionLabel, line }, index) => {
        const header = index === 0 || lines[index - 1]!.sectionId !== sectionId ? sectionLabel : null;
        const isCurrent = line.id === current;
        return (
          <li key={line.id} ref={(el) => void (el ? refs.current.set(line.id, el) : refs.current.delete(line.id))} data-current={isCurrent || undefined}>
            {header !== null && <div className="mt-3 mb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">{header}</div>}
            <div className={`flex items-center gap-2 rounded-md px-2 py-1 transition-colors ${isCurrent ? 'bg-sky-100 text-sky-950 dark:bg-sky-900 dark:text-white' : ''}`}>
              {recording && (
                <span className="w-14 shrink-0 text-xs tabular-nums text-slate-500">{line.atSec !== undefined ? formatAt(line.atSec) : '–'}</span>
              )}
              <button
                type="button"
                className={`min-w-0 flex-1 text-left ${isCurrent ? 'text-lg font-semibold' : 'text-base'} ${line.direction ? 'italic text-slate-500' : ''}`}
                title={recording ? t.setHere : line.atSec !== undefined ? t.jump : undefined}
                onClick={() => {
                  if (recording && editable) setLineTime(doc, sectionId, line.id, time, origin);
                  else if (line.atSec !== undefined) onSeek(line.atSec);
                }}
              >
                {line.direction ? `(${line.text})` : line.text || ' '}
              </button>
              {recording && editable && line.atSec !== undefined && (
                <span className="flex shrink-0">
                  <Button variant="ghost" className="min-h-7 px-1.5 text-xs" aria-label={`${t.earlier}: ${line.text}`} onClick={() => setLineTime(doc, sectionId, line.id, line.atSec! - 0.5, origin)}>
                    −0,5
                  </Button>
                  <Button variant="ghost" className="min-h-7 px-1.5 text-xs" aria-label={`${t.later}: ${line.text}`} onClick={() => setLineTime(doc, sectionId, line.id, line.atSec! + 0.5, origin)}>
                    +0,5
                  </Button>
                  <Button variant="ghost" className="min-h-7 px-1.5" aria-label={`${t.clearTime}: ${line.text}`} onClick={() => setLineTime(doc, sectionId, line.id, undefined, origin)}>
                    <X {...ICON} />
                  </Button>
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Restzeit des Titels als Countdown: in den letzten warn Sekunden allmählich rot, in den letzten blink Sekunden blinkend */
function RemainingTime({ remaining, warn, blink, playing }: { remaining: number; warn: number; blink: number; playing: boolean }) {
  const red = warn > 0 && remaining <= warn ? (warn - remaining) / warn : 0;
  // blinken nur, solange es läuft
  const blinking = playing && blink > 0 && remaining > 0 && remaining <= blink;
  return (
    <span
      className={`shrink-0 text-xl font-semibold tabular-nums ${blinking ? 'animate-[steckplan-blink_1s_step-end_infinite]' : ''}`}
      style={red > 0 ? { color: `color-mix(in srgb, #ef4444 ${Math.round(red * 100)}%, currentColor)` } : undefined}
      title={t.remaining}
      data-testid="remaining"
      data-state={blinking ? 'blink' : red > 0 ? 'warn' : 'normal'}
    >
      −{formatDuration(Math.ceil(remaining))}
    </span>
  );
}

/**
 * Leertaste startet und stoppt die Wiedergabe (außer beim Tippen in Feldern; beim Mitschreiben setzt sie die Zeile).
 * Auch auf einem fokussierten Knopf: der Knopf wird dann nicht zusätzlich ausgelöst.
 */
function usePlayPauseKey(audio: Playback | null, active: boolean): void {
  useEffect(() => {
    if (!audio || !active) return;
    const isSpace = (e: KeyboardEvent) => e.code === 'Space' && !e.ctrlKey && !e.metaKey && !e.altKey;
    const typing = (e: KeyboardEvent) => !!(e.target as HTMLElement | null)?.closest('textarea, select, [contenteditable="true"], input:not([type=range]), dialog');
    const onDown = (e: KeyboardEvent) => {
      if (!isSpace(e) || e.defaultPrevented || typing(e)) return;
      e.preventDefault();
      if (e.repeat) return;
      if (audio.paused) void audio.play().catch(() => undefined);
      else audio.pause();
    };
    const onUp = (e: KeyboardEvent) => {
      if (isSpace(e) && !typing(e)) e.preventDefault(); // Knopf-Klick per Leertaste unterdrücken
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [audio, active]);
}

/** Mitschreiben: Leertaste setzt die nächste Zeile (außer beim Tippen in Feldern). */
export function useRecordKey(active: boolean, onNext: () => void): void {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.code !== 'Space' || e.repeat || target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onNext]);
}

