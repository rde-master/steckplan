// Vorstellung (Regie, M11e): Vollbild, dunkel. Aktueller Eintrag mit mitlaufendem Text, aktuelle und nächste Lichtszene,
// Player, große Knöpfe und Pfeiltasten. „Führen“ sendet die Stelle an alle, „Folgen“ springt mit (nicht gespeichert).
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ListMusic, Monitor, Radio, UserRound, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  currentLineId,
  currentSceneId,
  formatDuration,
  gridLayout,
  itemLines,
  itemNumbers,
  itemSoundScenes,
  stickyNote,
  itemScenes,
  lightDevices,
  sceneStates,
  sceneTime,
  type Cue,
  type Library,
  type SyncClientState,
} from '@steckplan/core';
import type { ProjectData } from '../../lib/useProjectData';
import { texts } from '../../texts';
import { Button } from '../ui';
import { openLyricsWindow, useLocalCueSender } from './LyricsWindow';
import { ItemNumber, KIND_ICONS } from './RegieView';
import { RichTextView } from './RichTextEditor';
import { SceneProgress, type SceneMark } from './SceneProgress';
import { hasRichText } from '../../lib/richText';
import { SceneGrid } from './SceneGrid';
import { formatSceneTime } from './ScenesSection';
import { PlayerBar, seekAudio, TimecodePanel, usePlayerTime } from './SongMedia';
import { usePointPlayback } from '../../lib/transport';

const t = texts.regie.performance;

type Mode = 'free' | 'lead' | 'follow';

/** rechte Seite der Vorstellung: Licht oder Ton (je Gerät gemerkt) */
type Side = 'light' | 'sound';
const SIDE_KEY = 'steckplan.performanceSide';
function readSide(): Side {
  try {
    return localStorage.getItem(SIDE_KEY) === 'sound' ? 'sound' : 'light';
  } catch {
    return 'light';
  }
}

export function PerformanceView({
  projectId,
  data,
  library,
  sync,
  sendCue,
  canLead,
  onClose,
}: {
  projectId: string;
  data: ProjectData;
  library: Library | null;
  sync: SyncClientState;
  sendCue: (cue: Cue | null) => void;
  canLead: boolean;
  onClose: () => void;
}) {
  const items = data.show.items;
  const templates = useMemo(() => new Map((library?.templates ?? []).map((tp) => [tp.id, tp])), [library]);
  const lights = useMemo(() => lightDevices(data.devices, templates), [data.devices, templates]);
  const layout = gridLayout(lights, data.lightPlacements, data.lightGrid);

  const lead = sync.lead;
  const iLead = !!lead && lead.connectionId === sync.connectionId;
  const [mode, setMode] = useState<Mode>(lead && !iLead ? 'follow' : 'free');
  const following = mode === 'follow' && !!lead && !iLead;
  const [index, setIndex] = useState(0);
  // von Hand gewählte Szene und die Position, an der sie gewählt wurde: gilt, bis sich die Position ändert
  const [choice, setChoice] = useState<{ id: string | null; at: number }>({ id: null, at: 0 });
  const sceneChoice = choice.id;
  const pick = (id: string | null, at: number) => setChoice({ id, at });
  const [listOpen, setListOpen] = useState(false);
  const [side, setSide] = useState<Side>(readSide);
  const chooseSide = (next: Side) => {
    setSide(next);
    try {
      localStorage.setItem(SIDE_KEY, next);
    } catch {
      // ohne Speicher gilt die Wahl bis zum Neuladen
    }
  };

  const followIndex = following ? items.findIndex((i) => i.id === lead.itemId) : -1;
  const itemIndex = followIndex >= 0 ? followIndex : Math.min(index, Math.max(0, items.length - 1));
  const item = items[itemIndex];
  const scenes = item ? itemScenes(data.lightScenes, item.id) : [];
  const lines = item ? itemLines(data.show.sections, item.id) : [];
  const plainLines = lines.map((l) => l.line);

  // Transport des Ablaufpunkts (Timecode); das Audio des Lieds hängt daran
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  // tc = Timecode des Punkts; audio = Musik (mit „Mit Musik“ dasselbe), danach laufen Text und Szenen
  const { tc, music: audio, sync: withMusic } = usePointPlayback(item?.id, item?.durationSec, audioEl);
  const time = usePlayerTime(audio);
  const playing = !audio.paused;
  const numbers = itemNumbers(items);
  const number = item ? (numbers.get(item.id) ?? itemIndex + 1) : undefined;
  const choiceHolds = !!sceneChoice && !playing && Math.abs(time - choice.at) < 0.05;
  const timeScene = choiceHolds ? undefined : currentSceneId(scenes, plainLines, time);
  const sceneId = following ? lead.sceneId : (timeScene ?? (scenes.some((s) => s.id === sceneChoice) ? sceneChoice : scenes[0]?.id) ?? undefined);
  const sceneIndex = scenes.findIndex((s) => s.id === sceneId);
  const scene = scenes[sceneIndex];
  const nextItem = items[itemIndex + 1];
  // mit Audio die Abspielposition (auch angehalten, z. B. nach dem Spulen), sonst die Zeile der Szene
  const currentLine = playing || time > 0 ? currentLineId(lines, time) : scene?.lineId;

  // Stelle mit Abspielposition senden: beim Führen an alle (Server), immer an Textfenster im selben Browser.
  // Bei Eintrag/Szene, Start, Pause, Spulen und alle zwei Sekunden während der Wiedergabe.
  const itemId = item?.id;
  const localCue = useLocalCueSender(projectId);
  const cueState = useRef({ mode, itemId, sceneId, audio, tc, sendCue, localCue });
  useEffect(() => {
    cueState.current = { mode, itemId, sceneId, audio, tc, sendCue, localCue };
  });
  useEffect(() => {
    const send = () => {
      const c = cueState.current;
      if (!c.itemId) return;
      // at/playing: Musik (Text, Szenen); tc: Timecode (Art-Net) – getrennt, wenn „Mit Musik“ aus ist
      const cue: Cue = {
        itemId: c.itemId,
        ...(c.sceneId ? { sceneId: c.sceneId } : {}),
        at: c.audio.currentTime,
        playing: !c.audio.paused,
        tc: { at: c.tc.currentTime, playing: !c.tc.paused },
      };
      c.localCue(cue);
      if (c.mode === 'lead') c.sendCue(cue);
    };
    send();
    const events = ['play', 'pause', 'seeked', 'ratechange'];
    const sources = audio === tc ? [tc] : [audio, tc];
    for (const source of sources) for (const e of events) source.addEventListener(e, send);
    const timer = window.setInterval(() => {
      if (!audio.paused || !tc.paused) send();
    }, 2000);
    return () => {
      for (const source of sources) for (const e of events) source.removeEventListener(e, send);
      window.clearInterval(timer);
    };
  }, [mode, itemId, sceneId, audio, tc]);
  // beim Verlassen nicht weiter führen
  const leading = useRef(false);
  useEffect(() => {
    leading.current = mode === 'lead';
  }, [mode]);
  useEffect(
    () => () => {
      if (leading.current) sendCue(null);
    },
    [sendCue],
  );

  const choose = (next: Mode) => {
    if (mode === 'lead' && next !== 'lead') sendCue(null);
    if (mode === 'follow' && next !== 'follow') setIndex(itemIndex);
    setMode(next);
  };
  /** Bedienen beim Folgen verlässt das Folgen (an der aktuellen Stelle) */
  const takeOver = () => {
    if (following) {
      setIndex(itemIndex);
      pick(sceneId ?? null, audio.currentTime);
      setMode('free');
    }
  };
  /** Direkt zu einem Eintrag (Liedliste) */
  const goTo = (index: number) => {
    takeOver();
    setIndex(Math.max(0, Math.min(items.length - 1, index)));
    pick(null, 0);
    setListOpen(false);
  };
  const goItem = (delta: number) => {
    takeOver();
    const next = Math.max(0, Math.min(items.length - 1, itemIndex + delta));
    setIndex(next);
    pick(null, 0);
  };
  const goScene = (delta: number) => {
    takeOver();
    const target = scenes[sceneIndex + delta];
    if (target) {
      const at = sceneTime(target, plainLines);
      if (at !== undefined) seekAudio(audio, at);
      pick(target.id, at ?? audio.currentTime);
      return;
    }
    // über das Ende hinaus: nächster/voriger Eintrag
    const nextIndex = itemIndex + delta;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const nextScenes = itemScenes(data.lightScenes, items[nextIndex]!.id);
    setIndex(nextIndex);
    pick(delta > 0 ? (nextScenes[0]?.id ?? null) : (nextScenes[nextScenes.length - 1]?.id ?? null), 0);
  };

  // Spulen (um im Live den Text an den Gesang anzupassen)
  const nudge = (sec: number) => {
    if (audio) seekAudio(audio, audio.currentTime + sec);
  };

  // Tasten: ←/→ Szene, Umschalt+←/→ eine Sekunde spulen, ↑/↓ bzw. Bild↑/Bild↓ Eintrag, Esc beendet
  const closeOrList = () => (listOpen ? setListOpen(false) : onClose());
  const keys = useRef({ goItem, goScene, nudge, onClose: closeOrList });
  useEffect(() => {
    keys.current = { goItem, goScene, nudge, onClose: closeOrList };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
      const k = keys.current;
      if (e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) k.nudge(e.key === 'ArrowRight' ? 1 : -1);
      else if (e.key === 'ArrowRight') k.goScene(1);
      else if (e.key === 'ArrowLeft') k.goScene(-1);
      else if (e.key === 'ArrowDown' || e.key === 'PageDown') k.goItem(1);
      else if (e.key === 'ArrowUp' || e.key === 'PageUp') k.goItem(-1);
      else if (e.key === 'Escape') k.onClose();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // aktuelle Zeile mitscrollen
  const lineRefs = useRef(new Map<string, HTMLLIElement>());
  useEffect(() => {
    if (currentLine) lineRefs.current.get(currentLine)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [currentLine]);

  const states = scene ? sceneStates(data.sceneStates, scene.id) : new Map();
  // Szenen-Marken (Nummer, Name, Startpunkt) für Licht und Ton; Notizen bleiben stehen, bis eine neue kommt
  const lightMark = (i: number): SceneMark | undefined => (scenes[i] ? { number: i + 1, name: scenes[i]!.name, at: sceneTime(scenes[i]!, plainLines) } : undefined);
  const lightNote = sceneIndex >= 0 ? stickyNote(scenes, sceneIndex) : undefined;
  const soundScenes = item ? itemSoundScenes(data.soundScenes, item.id) : [];
  const soundCurrent = currentSceneId(soundScenes, plainLines, time);
  const soundIndex = soundScenes.length ? Math.max(0, soundScenes.findIndex((s) => s.id === soundCurrent)) : -1;
  const soundMark = (i: number): SceneMark | undefined => (soundScenes[i] ? { number: i + 1, name: soundScenes[i]!.name, at: sceneTime(soundScenes[i]!, plainLines) } : undefined);
  const soundNote = soundIndex >= 0 ? stickyNote(soundScenes, soundIndex, hasRichText) : undefined;
  const Icon = item ? KIND_ICONS[item.kind] : null;
  const roleNames = new Map((item?.roles ?? []).map((r) => [r.id, r.name]));
  // Countdown bis zu den nächsten fünf Zeilen (mit Audio), sonst die feste Zeit
  const currentIndex = lines.findIndex((l) => l.line.id === currentLine);
  // Fortschritt bis zur nächsten Zeile (mit Audio): grüner Balken über der aktuellen, roter über der nächsten
  const nextIndex = lines.findIndex((l, i) => i > currentIndex && l.line.atSec !== undefined);
  const nextAt = nextIndex >= 0 ? lines[nextIndex]!.line.atSec! : undefined;
  const startAt = currentIndex >= 0 ? (lines[currentIndex]!.line.atSec ?? 0) : 0;
  const progress = audio && nextAt !== undefined && nextAt > startAt ? Math.min(1, Math.max(0, (time - startAt) / (nextAt - startAt))) : undefined;
  const progressBar = (i: number): { color: string; width: number; testId: string } | null => {
    if (progress === undefined) return null;
    if (i === currentIndex) return { color: 'bg-emerald-500', width: progress, testId: 'line-progress-current' };
    if (i === nextIndex) return { color: 'bg-red-500', width: 1 - progress, testId: 'line-progress-next' };
    return null;
  };
  const timeLabel = (i: number, atSec: number | undefined): { text: string; countdown: boolean } | null => {
    if (atSec === undefined) return null;
    const ahead = i - currentIndex;
    if (audio && ahead >= 1 && ahead <= 5 && atSec > time) return { text: t.countdown(atSec - time), countdown: true };
    return { text: formatSceneTime(atSec), countdown: false };
  };

  return (
    <div className="dark fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-100" role="dialog" aria-label={t.title} data-testid="performance">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-800 py-2 pr-6 pl-3">
        <Button variant="ghost" aria-label={t.close} title={t.close} onClick={onClose}>
          <X size={22} aria-hidden />
        </Button>
        <span className="text-sm tabular-nums text-slate-400" data-testid="performance-position">
          {items.length ? `${itemIndex + 1} / ${items.length}` : ''}
        </span>
        {number !== undefined && <ItemNumber number={number} />}
        {Icon && <Icon size={20} className="text-slate-400" aria-hidden />}
        <div className="flex min-w-[10rem] flex-1 items-baseline gap-3 overflow-hidden">
          <h2 className="min-w-0 truncate text-lg font-semibold" data-testid="performance-title">
            {item?.title || (item ? texts.regie.untitled : t.empty)}
          </h2>
          {item?.durationSec !== undefined && (
            <span className="shrink-0 text-lg tabular-nums text-slate-400" data-testid="performance-duration">
              ({formatDuration(item.durationSec)})
            </span>
          )}
          {nextItem && (
            <span className="min-w-0 truncate text-sm text-slate-400" data-testid="performance-next-item">
              {t.nextUp} <ItemNumber number={numbers.get(nextItem.id)} /> {nextItem.title || texts.regie.untitled}
            </span>
          )}
        </div>
        <div className="relative">
          <Button variant="ghost" className="text-sm" aria-expanded={listOpen} aria-haspopup="true" title={t.listTitle} onClick={() => setListOpen(!listOpen)}>
            <ListMusic size={18} aria-hidden /> {t.list}
          </Button>
          {listOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setListOpen(false)} aria-hidden />
              <ol className="absolute right-0 z-20 mt-1 max-h-[70vh] w-80 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-xl" aria-label={t.list} data-testid="performance-list">
                {items.map((entry, i) => {
                  const EntryIcon = KIND_ICONS[entry.kind];
                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        aria-current={i === itemIndex ? 'true' : undefined}
                        onClick={() => goTo(i)}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${i === itemIndex ? 'bg-sky-900 text-white' : 'hover:bg-slate-800'}`}
                      >
                        <ItemNumber number={numbers.get(entry.id)} />
                        <EntryIcon size={16} className="shrink-0 text-slate-400" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{entry.title || texts.regie.untitled}</span>
                        <span className="shrink-0 text-xs tabular-nums text-slate-500">{entry.durationSec !== undefined ? formatDuration(entry.durationSec) : ''}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>
        <div className="flex overflow-hidden rounded-md border border-slate-700 text-sm" role="radiogroup" aria-label={t.modeLabel}>
          {(['free', ...(canLead ? (['lead'] as const) : []), 'follow'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              disabled={m === 'follow' && (!lead || iLead)}
              onClick={() => choose(m)}
              className={`px-3 py-1.5 disabled:opacity-40 ${mode === m ? 'bg-sky-600 text-white' : ''}`}
            >
              {t.modes[m]}
            </button>
          ))}
        </div>
        <Button variant="ghost" className="text-sm" title={t.lyricsWindowHint} onClick={() => openLyricsWindow(projectId)}>
          <Monitor size={18} aria-hidden /> {t.lyricsWindow}
        </Button>
        <span className="flex items-center gap-1 text-xs text-slate-400" data-testid="performance-lead">
          {lead ? (
            <>
              {iLead ? <Radio size={14} className="text-red-500" aria-hidden /> : <UserRound size={14} aria-hidden />}
              {iLead ? t.youLead : t.leads(lead.name)}
            </>
          ) : (
            t.nobodyLeads
          )}
        </span>
      </header>

      {!item ? (
        <p className="m-auto text-slate-400">{t.empty}</p>
      ) : (
        <main className="grid min-h-0 flex-1 gap-4 overflow-y-auto py-4 pr-6 pl-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:overflow-hidden">
          <section className="min-h-0 space-y-3 lg:overflow-y-auto" aria-label={texts.regie.text}>
            {item.notes && <p className="rounded-md bg-slate-900 p-3 text-slate-300">{item.notes}</p>}
            {lines.length === 0 ? (
              item.kind === 'break' || item.kind === 'announcement' ? <p className="text-3xl font-semibold text-slate-300">{item.title}</p> : <p className="text-slate-500">{texts.regie.noText}</p>
            ) : (
              <ol className="space-y-1 lg:pb-24" data-testid="performance-text">
                {lines.map(({ sectionId, sectionLabel, line }, i) => {
                  const header = i === 0 || lines[i - 1]!.sectionId !== sectionId ? sectionLabel : null;
                  const isCurrent = line.id === currentLine;
                  const speaker = line.roleId && (i === 0 || lines[i - 1]!.line.roleId !== line.roleId || lines[i - 1]!.line.direction) ? roleNames.get(line.roleId) : undefined;
                  const at = timeLabel(i, line.atSec);
                  const bar = progressBar(i);
                  return (
                    <li key={line.id} ref={(el) => void (el ? lineRefs.current.set(line.id, el) : lineRefs.current.delete(line.id))} data-current={isCurrent || undefined}>
                      {header !== null && <div className="mt-4 mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{header}</div>}
                      {/* kleiner Balken oben am Rand (nur hier, nicht im Textfenster) */}
                      <div className="mt-2.5 mb-0.5 ml-[4.5rem] h-1 overflow-hidden rounded-full">
                        {bar && <div className={`h-full rounded-full ${bar.color}`} style={{ width: `${bar.width * 100}%` }} data-testid={bar.testId} data-progress={bar.width.toFixed(2)} />}
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span
                          className={`w-16 shrink-0 text-right text-sm tabular-nums ${at?.countdown ? 'font-semibold text-amber-400' : 'text-slate-500'}`}
                          data-testid={at?.countdown ? 'line-countdown' : 'line-time'}
                        >
                          {at?.text ?? ''}
                        </span>
                        <p className={`min-w-0 flex-1 rounded-md px-2 py-1 leading-snug transition-colors ${isCurrent ? 'bg-sky-900 text-2xl font-semibold text-white' : 'text-xl text-slate-200'} ${line.direction ? 'italic text-slate-400' : ''}`}>
                          {speaker && <span className="mr-2 font-semibold text-sky-300">{speaker}:</span>}
                          {line.direction ? `(${line.text})` : line.text || ' '}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className="min-h-0 space-y-3 lg:overflow-y-auto" aria-label={side === 'light' ? texts.light.scenes.title : texts.regie.sound.title}>
            <div className="flex w-fit overflow-hidden rounded-md border border-slate-700 text-sm" role="tablist" aria-label={t.sideLabel}>
              {(['light', 'sound'] as Side[]).map((s) => (
                <button key={s} type="button" role="tab" aria-selected={side === s} onClick={() => chooseSide(s)} className={`px-4 py-1.5 ${side === s ? 'bg-sky-600 text-white' : 'hover:bg-slate-800'}`}>
                  {t.sides[s]}
                </button>
              ))}
            </div>
            {side === 'sound' ? (
              <>
                {soundScenes.length > 0 && (
                  <SceneProgress current={soundMark(soundIndex)} next={soundMark(soundIndex + 1)} time={time} nextItemTitle={nextItem ? nextItem.title || texts.regie.untitled : undefined} testPrefix="sound" />
                )}
                {soundNote ? (
                  <RichTextView html={soundNote} className="rounded-lg bg-white p-4 text-xl text-slate-900" />
                ) : (
                  soundScenes.length > 0 && <p className="text-slate-500">{texts.regie.sound.noSceneNote}</p>
                )}
                {hasRichText(item.soundNotes) && (
                  <div className="space-y-1">
                    <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{t.general}</div>
                    <RichTextView html={item.soundNotes} className="rounded-lg bg-white p-4 text-lg text-slate-900" />
                  </div>
                )}
                {soundScenes.length === 0 && !hasRichText(item.soundNotes) && <p className="text-slate-500">{texts.regie.sound.none}</p>}
              </>
            ) : scenes.length > 0 ? (
              <>
                <SceneProgress current={lightMark(sceneIndex)} next={lightMark(sceneIndex + 1)} time={time} nextItemTitle={nextItem ? nextItem.title || texts.regie.untitled : undefined} testPrefix="performance" />
                {lightNote && <p className="text-lg text-slate-200" data-testid="performance-scene-note">{lightNote}</p>}
                <SceneGrid grid={data.lightGrid} layout={layout} states={states} targets={data.lightTargets} templates={templates} selected={new Set()} onToggle={undefined} center />
              </>
            ) : (
              <p className="text-slate-500">{nextItem ? t.nextItem(nextItem.title || texts.regie.untitled) : t.end}</p>
            )}
          </section>
        </main>
      )}

      <footer className="flex shrink-0 items-end gap-3 border-t border-slate-800 pt-2 pr-6 pl-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="min-w-0 flex-1">
        {item && (
          <div className="mx-auto max-w-4xl [&>[data-testid=regie-player]]:static [&>[data-testid=regie-player]]:mx-0 [&>[data-testid=regie-player]]:border-0">
            <PlayerBar
              settings={data.showSettings}
              key={item.id}
              projectId={projectId}
              item={item}
              media={data.media}
              playback={audio}
              setAudio={setAudioEl}
              time={time}
              recording={false}
              onNextLine={() => undefined}
              nextLineText={undefined}
              onClearTimes={() => undefined}
              markers={scenes.flatMap((s, i) => {
                const at = sceneTime(s, plainLines);
                return at === undefined ? [] : [{ id: s.id, at, label: `${i + 1} ${s.name}` }];
              })}
            />
          </div>
        )}
        <div className="mx-auto grid max-w-4xl grid-cols-4 gap-2 py-1">
          <NavButton label={t.prevItem} onClick={() => goItem(-1)} disabled={itemIndex <= 0}>
            <ChevronsLeft size={26} aria-hidden />
          </NavButton>
          <NavButton label={t.prevScene} onClick={() => goScene(-1)} disabled={itemIndex <= 0 && sceneIndex <= 0}>
            <ChevronLeft size={26} aria-hidden />
          </NavButton>
          <NavButton label={t.nextSceneButton} onClick={() => goScene(1)} disabled={itemIndex >= items.length - 1 && sceneIndex >= scenes.length - 1}>
            <ChevronRight size={26} aria-hidden />
          </NavButton>
          <NavButton label={t.nextItemButton} onClick={() => goItem(1)} disabled={itemIndex >= items.length - 1}>
            <ChevronsRight size={26} aria-hidden />
          </NavButton>
        </div>
        </div>
        {/* Timecode unten rechts: gelaufene Zeit des Punkts, läuft mit dem Transport */}
        {item && (
          <div className="flex shrink-0 flex-col items-end gap-1">
            <TimecodePanel tc={tc} sync={withMusic} large />
            {data.showSettings.artnet?.enabled && (
              <span className={`text-xs ${iLead ? 'text-emerald-400' : 'text-amber-400'}`} data-testid="artnet-state">
                {iLead ? t.artnetSending(data.showSettings.artnet.host) : t.artnetLeadHint}
              </span>
            )}
          </div>
        )}
      </footer>
    </div>
  );
}

function NavButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg bg-slate-800 text-xs text-slate-200 hover:bg-slate-700 active:bg-sky-700 disabled:opacity-30"
    >
      {children}
      <span>{label}</span>
    </button>
  );
}
