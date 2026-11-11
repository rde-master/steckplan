// Vorstellung (Regie, M11e): Vollbild, dunkel. Aktueller Eintrag mit mitlaufendem Text, aktuelle und nächste Lichtszene,
// Player, große Knöpfe und Pfeiltasten. „Führen“ sendet die Stelle an alle, „Folgen“ springt mit (nicht gespeichert).
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, EyeOff, Image as ImageIcon, Keyboard, ListMusic, Monitor, Radio, Type, UserRound, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  addTap,
  DEFAULT_TIME_SIGNATURE,
  parseTimeSignature,
  TAP_RESET_SEC,
  tapProgress,
  tapTempo,
  itemTempo,
  beatStep,
  beatAt,
  beatInBar,
  updateShowItem,
  type Tap,
  currentLineId,
  currentSceneId,
  formatDuration,
  gridLayout,
  itemTimedLines,
  itemNumbers,
  itemSoundScenes,
  stickyNote,
  itemScenes,
  lightDevices,
  sceneStates,
  sceneTime,
  type Cue,
  type Library,
  type RemoteCommand,
  type SyncClientState,
  isBreakLine,
  itemLightEvents,
  triggerCommands,
} from '@steckplan/core';
import type { ProjectData } from '../../lib/useProjectData';
import { api } from '../../lib/api';
import { texts } from '../../texts';
import { Button } from '../ui';
import { openLyricsWindow, useCueSource, useLocalCueSender, type ReceivedCue } from './LyricsWindow';
import { ItemColors, ItemNumber, KIND_ICONS } from './RegieView';
import { BeatPanel } from './BeatPanel';
import { Apc40Settings } from './Apc40Settings';
import { APC40_CONTROLS, type Apc40Input } from '../../lib/midi/apc40';
import { ledFor, useMidiMapping, type MidiAction, type PerformanceLedState } from '../../lib/midi/mapping';
import { midiSupported, useApc40 } from '../../lib/midi/useApc40';
import { setClickSettings, useClickSettings } from '../../lib/click';
import { LeadTimeline } from './LeadTimeline';
import { itemAudioSrc } from './Waveform';
import { DeskCuePanel } from './DeskCuePanel';
import { PlayersPanel } from './PlayersPanel';
import { OscLeadPanel, readOscAuto, writeOscAuto } from './OscLeadPanel';
import { LightEventCountdown } from './LightEvents';
import type * as Y from 'yjs';
import { RichTextView } from './RichTextEditor';
import { SceneProgress, type SceneMark } from './SceneProgress';
import { hasRichText } from '../../lib/richText';
import { SceneGrid } from './SceneGrid';
import { formatSceneTime } from './ScenesSection';
import { BreakMark, PlayerBar, seekAudio, TimecodePanel } from './SongMedia';
import { usePointPlayback, type Playback } from '../../lib/transport';
import { usePlayerTime, usePlayerValue, usePlaying, type TimeSource } from '../../lib/playerTime';

const t = texts.regie.performance;

type Mode = 'free' | 'lead' | 'follow';

type LightView = 'current' | 'next';

/** Einstellung je Gerät (localStorage), nur erlaubte Werte */
function useLocalOption<T extends string>(key: string, fallback: T, allowed: T[]): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key) as T | null;
      return saved && allowed.includes(saved) ? saved : fallback;
    } catch {
      return fallback;
    }
  });
  const set = (next: T) => {
    setValue(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      // ohne Speicher gilt die Wahl bis zum Neuladen
    }
  };
  return [value, set];
}

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

/** Herkunft der Änderungen aus der Vorstellung (Tap-Tempo) */
const PERFORMANCE_ORIGIN = { source: 'performance' };
function readHidden(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

/** Bereich der Vorstellung (Text bzw. Licht/Ton) ein- bzw. ausgeklappt – je Gerät gemerkt */
function useHidden(key: string): [boolean, (hidden: boolean) => void] {
  const [hidden, setHidden] = useState(() => readHidden(key));
  const set = (next: boolean) => {
    setHidden(next);
    try {
      if (next) localStorage.setItem(key, '1');
      else localStorage.removeItem(key);
    } catch {
      // ohne Speicher gilt die Wahl bis zum Neuladen
    }
  };
  return [hidden, set];
}

/** Zeitpunkt eines Taps (Sekunden, monoton) */
function tapClock(): number {
  return performance.now() / 1000;
}

export function PerformanceView({
  projectId,
  doc,
  data,
  library,
  sync,
  sendCue,
  onRemote,
  canLead,
  onClose,
}: {
  projectId: string;
  /** zum Speichern des getappten Tempos (nur wer die Regie bearbeiten darf) */
  doc?: Y.Doc;
  data: ProjectData;
  library: Library | null;
  sync: SyncClientState;
  sendCue: (cue: Cue | null) => void;
  /** Fernsteuerung (OSC/HTTP) abonnieren */
  onRemote: (listener: (command: RemoteCommand) => void) => () => void;
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
  const lines = item ? itemTimedLines(data.show.sections, item) : [];
  const plainLines = lines.map((l) => l.line);

  // Transport des Ablaufpunkts (Timecode); das Audio des Lieds hängt daran
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  // tc = Timecode des Punkts; audio = Musik (mit „Mit Musik“ dasselbe), danach laufen Text und Szenen
  // Tempo: manuell vor gespeichert; gibt es beide, läuft das Lied um manuell ÷ gespeichert schneller bzw. langsamer
  const tempo = itemTempo(item ?? {});
  const { tc, music: audio, sync: withMusic } = usePointPlayback(item?.id, item?.durationSec, audioEl, item?.audioOffsetSec, tempo.rate);
  // Folgen: Zeit der führenden Vorstellung (Abspielposition + seit Empfang vergangene Zeit) – ohne eigenen Ton
  const leadCue: ReceivedCue | null = following && lead ? { ...lead, receivedAt: sync.leadReceivedAt ?? 0 } : null;
  const leadClock = useCueSource(leadCue);
  const leadTcClock = useCueSource(leadCue?.tc ? { at: leadCue.tc.at, playing: leadCue.tc.playing, receivedAt: leadCue.receivedAt } : leadCue);
  // Zeitquelle für Text, Szenen und Anzeigen. Diese Ansicht rechnet nicht je Bild neu: Sie fragt nur ab, was sich
  // selten ändert (Zeile, Szene, läuft/steht); Uhr, Balken und Abspielstrich aktualisieren sich in kleinen Bausteinen.
  const clock: TimeSource = leadCue && leadCue.at !== undefined ? leadClock : audio;
  const ownPlaying = usePlaying(audio);
  const playing = leadCue ? !!leadCue.playing : ownPlaying;
  const numbers = itemNumbers(items);
  const lightEvents = item ? itemLightEvents(data.lightEvents, item.id) : [];
  const number = item ? (numbers.get(item.id) ?? itemIndex + 1) : undefined;
  const timeScene = usePlayerValue(clock, (time) => {
    const choiceHolds = !!sceneChoice && !playing && Math.abs(time - choice.at) < 0.05;
    return choiceHolds ? undefined : currentSceneId(scenes, plainLines, time);
  });
  const sceneId = following ? lead.sceneId : (timeScene ?? (scenes.some((s) => s.id === sceneChoice) ? sceneChoice : scenes[0]?.id) ?? undefined);
  const sceneIndex = scenes.findIndex((s) => s.id === sceneId);
  const scene = scenes[sceneIndex];
  const nextItem = items[itemIndex + 1];
  // mit Audio die Abspielposition (auch angehalten, z. B. nach dem Spulen), sonst die Zeile der Szene
  const timed = usePlayerValue(clock, (time) => playing || time > 0);
  const lineByTime = usePlayerValue(clock, (time) => currentLineId(lines, time));
  const currentLine = timed ? lineByTime : scene?.lineId;

  // Stelle mit Abspielposition senden: beim Führen an alle (Server), immer an Textfenster im selben Browser.
  // Bei Eintrag/Szene, Start, Pause, Spulen und alle zwei Sekunden während der Wiedergabe.
  const itemId = item?.id;
  const localCue = useLocalCueSender(projectId);
  // OSC der Regie automatisch senden (Schalter beim Führen, je Gerät gemerkt) – geht mit der Stelle an den Server
  const [oscAuto, setOscAutoState] = useState(readOscAuto);
  const setOscAuto = (on: boolean) => {
    setOscAutoState(on);
    writeOscAuto(on);
  };
  // Textfenster: Text bzw. Hintergrund aus-/einblenden (beim Führen, geht mit der Stelle an alle Textfenster)
  const [hideText, setHideText] = useState(false);
  const [hideBackground, setHideBackground] = useState(false);
  const cueState = useRef({ mode, itemId, sceneId, audio, tc, sendCue, localCue, oscAuto, hideText, hideBackground });
  useEffect(() => {
    cueState.current = { mode, itemId, sceneId, audio, tc, sendCue, localCue, oscAuto, hideText, hideBackground };
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
        ...(c.oscAuto ? { osc: true } : {}),
        ...(c.hideText ? { hideText: true } : {}),
        ...(c.hideBackground ? { hideBackground: true } : {}),
        ...(c.tc.playbackRate !== 1 ? { rate: c.tc.playbackRate } : {}),
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
  }, [mode, itemId, sceneId, audio, tc, oscAuto, hideText, hideBackground]);
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


  // Tap-Tempo: zwei volle Takte tippen (Knopf, Taste T, OSC /steckplan/tap) – dann übernimmt das Lied das Tempo,
  // beim Abspielen auch die Lage der „1“ (der erste Tap); mit jedem weiteren vollen Takt erneut. Gespeichert im Lied.
  const [textHidden, setTextHidden] = useHidden('steckplan.performanceTextHidden');
  const [sideHidden, setSideHidden] = useHidden('steckplan.performanceSideHidden');
  // Führen: Einstellungen rechts (Textfenster, Player, Lichtpult, OSC) einklappbar, je Gerät gemerkt
  const [toolsHidden, setToolsHidden] = useHidden('steckplan.leadToolsHidden');
  const [tapState, setTapState] = useState<{ itemId: string; taps: Tap[] } | null>(null);
  const taps = tapState && tapState.itemId === item?.id ? tapState.taps : [];
  const beats = parseTimeSignature(item?.timeSignature).beats;
  /** manuelles Tempo verwerfen: wieder das gespeicherte */
  /** einen Schlag vor bzw. zurück (im Raster aus Tempo und „1“) */
  const stepBeat = (dir: 1 | -1) => {
    if (!tempo.gridBpm) return;
    perform({ action: 'seek', value: beatStep(audio.currentTime, tempo.gridBpm, tempo.offset ?? 0, dir) });
  };
  const resetTempo = doc && canLead && item?.manualBpm !== undefined ? () => updateShowItem(doc, item.id, { manualBpm: undefined, manualBeatOffsetSec: undefined }, PERFORMANCE_ORIGIN) : undefined;
  useEffect(() => {
    if (!tapState) return;
    const timer = window.setTimeout(() => setTapState(null), TAP_RESET_SEC * 1000);
    return () => window.clearTimeout(timer);
  }, [tapState]);
  const doTap = () => {
    if (!item) return;
    const next = addTap(taps, { wall: tapClock(), ...(audio.paused ? {} : { at: audio.currentTime }) });
    setTapState({ itemId: item.id, taps: next });
    // Lage der „1“ im Raster der Aufnahme (gespeichertes Tempo), das getappte wird das manuelle
    const result = tapTempo(next, beats, item.bpm);
    if (result && doc && canLead) {
      // das gespeicherte Tempo bleibt: getappt wird das manuelle (hat Vorrang)
      updateShowItem(doc, item.id, { manualBpm: result.bpm, ...(result.offset !== undefined ? { manualBeatOffsetSec: result.offset } : {}), ...(item.timeSignature ? {} : { timeSignature: DEFAULT_TIME_SIGNATURE }) }, PERFORMANCE_ORIGIN);
    }
  };

  // Fernsteuerung (OSC/HTTP): ausführen, wenn diese Vorstellung führt – führt niemand, wenn sie nicht folgt.
  // Ohne „Mit Musik“ wirken Start/Pause/Stopp/Spulen auf Timecode und Musik gemeinsam.
  const [remoteNote, setRemoteNote] = useState('');
  const noteTimer = useRef<number | undefined>(undefined);
  /** Befehl ausführen (Fernsteuerung und Tastenkürzel) */
  const perform = (command: RemoteCommand) => {
    const both = (fn: (p: Playback) => void) => {
      fn(tc);
      if (audio !== tc) fn(audio);
    };
    const v = command.value ?? 0;
    switch (command.action) {
      case 'play':
        both((p) => void p.play());
        break;
      case 'pause':
        both((p) => p.pause());
        break;
      case 'toggle':
        if (tc.paused) both((p) => void p.play());
        else both((p) => p.pause());
        break;
      case 'stop':
        both((p) => {
          p.pause();
          seekAudio(p, 0);
        });
        break;
      case 'forward':
      case 'back':
        both((p) => seekAudio(p, p.currentTime + (command.action === 'back' ? -v : v)));
        break;
      case 'seek':
        both((p) => seekAudio(p, v));
        break;
      case 'item': {
        const index = items.findIndex((i) => numbers.get(i.id) === v);
        if (index >= 0) goTo(index);
        break;
      }
      case 'next':
      case 'prev':
        goItem(command.action === 'next' ? 1 : -1);
        break;
      case 'sceneNext':
      case 'scenePrev':
        goScene(command.action === 'sceneNext' ? 1 : -1);
        break;
      case 'tcForward':
      case 'tcBack':
        // nur der Timecode (mit „Mit Musik“ hängt die Musik daran)
        seekAudio(tc, tc.currentTime + (command.action === 'tcBack' ? -v : v));
        break;
      case 'tap':
        doTap();
        break;
    }
  };
  const runRemote = (command: RemoteCommand) => {
    if (lead ? !iLead : mode === 'follow') return;
    perform(command);
    setRemoteNote(t.remote(command.action, command.value));
    window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setRemoteNote(''), 2000);
  };
  const remoteRef = useRef(runRemote);
  useEffect(() => {
    remoteRef.current = runRemote;
  });
  useEffect(() => onRemote((command) => remoteRef.current(command)), [onRemote]);

  // APC40 (MIDI): Tasten lösen die belegten Aktionen aus, die LEDs zeigen den Zustand (je Gerät belegt).
  // Beim Folgen wirkt nur „Führen übernehmen“; mit offenen Einstellungen wählt eine gedrückte Taste sie dort aus.
  const midiMapping = useMidiMapping();
  const clickSettings = useClickSettings();
  const [midiOpen, setMidiOpen] = useState(false);
  const [midiSelected, setMidiSelected] = useState<string | null>(null);
  // Metronom auf dem APC40: laufender Schlag (neu gezeichnet nur beim Wechsel des Schlags)
  const beatCount = useBeatCount(() => audio.currentTime, tempo.gridBpm, beats, tempo.offset ?? 0, playing);
  const ledState: PerformanceLedState = {
    playing,
    currentNumber: item ? numbers.get(item.id) : undefined,
    nextNumber: nextItem ? numbers.get(nextItem.id) : undefined,
    numbers: new Set(numbers.values()),
    hasPrevItem: itemIndex > 0,
    hasNextItem: !!nextItem,
    hasPrevScene: sceneIndex > 0,
    hasNextScene: sceneIndex < scenes.length - 1,
    click: clickSettings.click,
    preroll: clickSettings.preroll,
    leading: mode === 'lead',
    hasTempo: tempo.gridBpm !== undefined,
    hideText,
    hideBackground,
    ...(tempo.gridBpm !== undefined && beatCount !== null ? { beat: beatCount, beatsPerBar: beats } : {}),
  };
  const midiLeds = Object.fromEntries(APC40_CONTROLS.map((c) => [c.id, ledFor(midiMapping[c.id], ledState)]));
  const showNote = (text: string) => {
    setRemoteNote(text);
    window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setRemoteNote(''), 2000);
  };
  const runMidi = (a: MidiAction) => {
    switch (a.action) {
      case 'none':
        return;
      case 'beatBack':
      case 'beatForward':
        stepBeat(a.action === 'beatForward' ? 1 : -1);
        break;
      case 'click':
        setClickSettings({ click: !clickSettings.click });
        break;
      case 'preroll':
        setClickSettings({ preroll: !clickSettings.preroll });
        break;
      case 'lead':
        if (!canLead) return;
        takeOver();
        choose('lead');
        break;
      case 'lyricsText':
        setHideText(!hideText);
        break;
      case 'beat':
        // Metronom: im laufenden Takt auf diesen Schlag springen
        if (following || tempo.gridBpm === undefined || a.value === undefined || a.value > beats) return;
        perform({ action: 'seek', value: beatInBar(audio.currentTime, tempo.gridBpm, beats, tempo.offset ?? 0, a.value) });
        break;
      case 'lyricsBackground':
        setHideBackground(!hideBackground);
        break;
      default:
        perform({ action: a.action, ...(a.value !== undefined ? { value: a.value } : {}) });
    }
    showNote(texts.regie.midi.remote(`${texts.regie.midi.actions[a.action]}${a.value !== undefined ? ` ${String(a.value).replace('.', ',')}` : ''}`));
  };
  const onMidi = (input: Apc40Input) => {
    if (input.kind === 'encoder') {
      // Cue Level: fein spulen (0,1 s je Raste)
      if (!following && !midiOpen) perform({ action: input.delta > 0 ? 'forward' : 'back', value: Math.round(Math.abs(input.delta)) / 10 });
      return;
    }
    if (!input.pressed) return;
    if (midiOpen) {
      setMidiSelected(input.id);
      return;
    }
    const a = midiMapping[input.id];
    if (!a || (following && a.action !== 'lead')) return;
    runMidi(a);
  };
  const midi = useApc40(midiSupported(), midiLeds, onMidi);

  // Tastenkürzel (Übersicht: Knopf im Kopf bzw. „?“). Bedienen beim Folgen übernimmt bewusst (wie die Pfeiltasten).
  // Esc schließt Liedliste bzw. Übersicht – die Vorstellung ist ein eigener Tab (schließen mit ✕)
  const [keysOpen, setKeysOpen] = useState(false);
  const keyAction = (e: KeyboardEvent): boolean => {
    const k = e.key;
    if (k === 'Escape') {
      setListOpen(false);
      setKeysOpen(false);
      return true;
    }
    if (k === '?') {
      setKeysOpen(!keysOpen);
      return true;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return false; // Browser-Kürzel nicht stören
    const lower = k.toLowerCase();
    const command: RemoteCommand | null =
      e.shiftKey && (k === 'ArrowRight' || k === 'ArrowLeft')
        ? { action: k === 'ArrowRight' ? 'forward' : 'back', value: 1 }
        : lower === 'j'
          ? { action: 'back', value: 5 }
          : lower === 'l'
            ? { action: 'forward', value: 5 }
            : k === ','
              ? { action: 'back', value: 0.5 }
              : k === '.'
                ? { action: 'forward', value: 0.5 }
                : k === '['
                  ? { action: 'tcBack', value: 0.1 }
                  : k === ']'
                    ? { action: 'tcForward', value: 0.1 }
                    : lower === 'k'
                      ? { action: 'toggle' }
                      : lower === 's' || k === 'Home'
                        ? { action: 'stop' }
                        : lower === 't'
                          ? { action: 'tap' }
                          : null;
    if (command) {
      takeOver();
      perform(command);
      return true;
    }
    if (k === 'ArrowRight') goScene(1);
    else if (k === 'ArrowLeft') goScene(-1);
    else if (k === 'ArrowDown' || k === 'PageDown') goItem(1);
    else if (k === 'ArrowUp' || k === 'PageUp') goItem(-1);
    else if (lower === 'z' && !following) setListOpen(true);
    else return false;
    return true;
  };
  const keys = useRef(keyAction);
  useEffect(() => {
    keys.current = keyAction;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
      if (keys.current(e)) e.preventDefault();
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
  // Licht: Bild der aktuellen oder Vorschau der nächsten Szene; Ton: Vorschau ein/aus (je Gerät)
  const [lightView, setLightView] = useLocalOption<LightView>('steckplan.lightView', 'current', ['current', 'next']);
  const [soundPreviewSetting, setSoundPreviewSetting] = useLocalOption<'on' | 'off'>('steckplan.soundPreview', 'off', ['on', 'off']);
  const soundPreview = soundPreviewSetting === 'on';
  const setSoundPreview = (on: boolean) => setSoundPreviewSetting(on ? 'on' : 'off');
  const nextLightScene = scenes[sceneIndex + 1];
  const showNext = lightView === 'next' && !!nextLightScene;
  const nextStates = nextLightScene ? sceneStates(data.sceneStates, nextLightScene.id) : new Map();
  // Szenen-Marken (Nummer, Name, Startpunkt) für Licht und Ton; Notizen bleiben stehen, bis eine neue kommt
  const lightMark = (i: number): SceneMark | undefined => (scenes[i] ? { number: i + 1, name: scenes[i]!.name, at: sceneTime(scenes[i]!, plainLines) } : undefined);
  const lightNote = sceneIndex >= 0 ? stickyNote(scenes, sceneIndex) : undefined;
  const soundScenes = item ? itemSoundScenes(data.soundScenes, item.id) : [];
  const soundCurrent = usePlayerValue(clock, (time) => currentSceneId(soundScenes, plainLines, time));
  const soundIndex = soundScenes.length ? Math.max(0, soundScenes.findIndex((s) => s.id === soundCurrent)) : -1;
  const soundMark = (i: number): SceneMark | undefined => (soundScenes[i] ? { number: i + 1, name: soundScenes[i]!.name, at: sceneTime(soundScenes[i]!, plainLines) } : undefined);
  const soundNote = soundIndex >= 0 ? stickyNote(soundScenes, soundIndex, hasRichText) : undefined;
  const Icon = item ? KIND_ICONS[item.kind] : null;
  const roleNames = new Map((item?.roles ?? []).map((r) => [r.id, r.name]));
  const roleColors = new Map((item?.roles ?? []).flatMap((r) => (r.color ? [[r.id, r.color] as const] : [])));
  // Countdown bis zu den nächsten fünf Zeilen (mit Audio), sonst die feste Zeit
  const currentIndex = lines.findIndex((l) => l.line.id === currentLine);
  // Fortschritt bis zur nächsten Zeile (mit Audio): grüner Balken über der aktuellen, roter über der nächsten
  const nextIndex = lines.findIndex((l, i) => i > currentIndex && l.line.atSec !== undefined);
  const nextAt = nextIndex >= 0 ? lines[nextIndex]!.line.atSec! : undefined;
  const startAt = currentIndex >= 0 ? (lines[currentIndex]!.line.atSec ?? 0) : 0;
  const hasProgress = nextAt !== undefined && nextAt > startAt;
  // Führen: eigene Oberfläche (ohne Licht/Ton, Zeitstrahl, Tap und Timecode groß)
  const leadLayout = mode === 'lead';
  const lastLineAt = lines.reduce((m, l) => Math.max(m, l.line.atSec ?? 0), 0);
  const timelineLength = Number.isFinite(tc.duration) && tc.duration > 0 ? tc.duration : (item?.durationSec ?? Math.max(60, lastLineAt + 10));
  /** Balken über der aktuellen (grün) bzw. nächsten Zeile (rot) */
  const progressBar = (i: number) => (hasProgress && (i === currentIndex || i === nextIndex) ? <LineBar source={clock} kind={i === currentIndex ? 'current' : 'next'} startAt={startAt} nextAt={nextAt} /> : null);
  /** Countdown nur für die nächsten fünf Zeilen */
  const counts = (i: number) => i - currentIndex >= 1 && i - currentIndex <= 5;

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
          {item && <ItemColors item={item} size="lg" />}
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
        {midiSupported() && (
          <Button variant="ghost" className="px-2 text-sm" title={texts.regie.midi.title} onClick={() => setMidiOpen(true)} data-testid="apc40-open">
            <span className={`h-2 w-2 rounded-full ${midi.status === 'connected' ? 'bg-emerald-500' : 'bg-slate-500'}`} aria-hidden />
            {texts.regie.midi.button}
          </Button>
        )}
        {midiOpen && (
          <Apc40Settings
            status={midi.status}
            port={midi.port}
            selected={midiSelected}
            onSelect={setMidiSelected}
            leds={midiLeds}
            ledState={ledState}
            onClose={() => setMidiOpen(false)}
          />
        )}
        <div className="relative">
          <Button variant="ghost" className="px-2 text-sm" aria-expanded={keysOpen} aria-label={t.keys} title={`${t.keys} (?)`} onClick={() => setKeysOpen(!keysOpen)}>
            <Keyboard size={18} aria-hidden />
          </Button>
          {keysOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setKeysOpen(false)} aria-hidden />
              <div className="absolute right-0 z-20 mt-1 w-[28rem] max-w-[90vw] rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm shadow-xl" role="dialog" aria-label={t.keys} data-testid="performance-keys">
                <div className="mb-2 font-semibold">{t.keys}</div>
                <table className="w-full">
                  <tbody>
                    {t.keyList.map(([key, meaning]) => (
                      <tr key={key}>
                        <td className="py-1 pr-3 align-top whitespace-nowrap">
                          {key.split(' · ').map((part, i) => (
                            <span key={part}>
                              {i > 0 && <span className="mx-1 text-slate-500">/</span>}
                              <kbd className="rounded border border-slate-600 bg-slate-800 px-1.5 font-mono text-xs">{part}</kbd>
                            </span>
                          ))}
                        </td>
                        <td className="py-0.5 text-slate-300">{meaning}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-slate-500">{t.keysHint}</p>
              </div>
            </>
          )}
        </div>
        <div className={`relative ${following ? 'hidden' : ''}`}>
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
                        <ItemColors item={entry} />
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
        {remoteNote && (
          <span className="rounded bg-sky-900 px-2 py-0.5 text-xs text-sky-100" role="status" data-testid="performance-remote">
            {remoteNote}
          </span>
        )}
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
      ) : leadLayout ? (
        // Führen: ohne Licht/Ton – Text klein (vorige, aktuelle, nächste), Zeitstrahl, Tap und Timecode groß
        // links die Bedienung (passt ohne Scrollen), rechts eine feste Spalte mit Textfenster, Player, Lichtpult und OSC
        <main className={`grid min-h-0 flex-1 gap-5 overflow-y-auto px-6 py-4 lg:overflow-hidden ${toolsHidden ? 'lg:grid-cols-[minmax(0,1fr)_2.75rem]' : 'lg:grid-cols-[minmax(0,1fr)_19rem]'}`} data-testid="lead-view">
          <div className="flex min-h-0 flex-col gap-3" data-testid="lead-main">
          <section className="shrink-0 space-y-1" aria-label={texts.regie.text} data-testid="lead-text">
            {lines.length === 0 ? (
              <p className="text-slate-500">{texts.regie.noText}</p>
            ) : (
              (currentIndex < 0 ? [0] : [currentIndex - 1, currentIndex, currentIndex + 1])
                .filter((i) => i >= 0 && i < lines.length)
                .map((i) => {
                  const { line } = lines[i]!;
                  const isCurrent = i === currentIndex;
                  return (
                    <div key={line.id} data-current={isCurrent || undefined} data-testid="lead-line">
                      <div className="mb-0.5 ml-[4.5rem] h-1 overflow-hidden rounded-full">{progressBar(i)}</div>
                      <div className="flex items-baseline gap-2">
                        <LineTime source={clock} atSec={line.atSec} countdown={counts(i)} small />
                        <p className={`min-w-0 flex-1 truncate rounded px-2 py-0.5 ${isCurrent ? 'bg-sky-900 text-lg font-semibold text-white' : 'text-base text-slate-400'} ${line.direction ? 'italic' : ''}`}>
                          {line.direction ? `(${line.text})` : isBreakLine(line) ? <BreakMark /> : line.text}
                        </p>
                      </div>
                    </div>
                  );
                })
            )}
          </section>
          <LeadTimeline
            duration={timelineLength}
            lines={lines}
            currentLineId={currentLine}
            bpm={tempo.gridBpm}
            signature={item.timeSignature}
            offset={tempo.offset}
            source={audio}
            onSeek={(sec) => perform({ action: 'seek', value: sec })}
            waveSrc={itemAudioSrc(projectId, item)}
            audioOffset={item.audioOffsetSec ?? 0}
            events={lightEvents}
            lightScenes={scenes.map((s, i) => ({ id: s.id, number: i + 1, name: s.name, at: sceneTime(s, plainLines), current: i === sceneIndex }))}
            soundScenes={soundScenes.map((s, i) => ({ id: s.id, number: i + 1, name: s.name, at: sceneTime(s, plainLines), current: i === soundIndex }))}
            onScene={(kind, s) => {
              // dorthin springen; Lichtszene ohne Startpunkt: nur wählen
              if (s.at !== undefined) perform({ action: 'seek', value: s.at });
              if (kind === 'light') pick(s.id, s.at ?? audio.currentTime);
            }}
          />
          {/* Tempo und Timecode: nehmen den freien Platz, mittig */}
          <FitBox className="min-h-0 flex-1" testId="lead-center">
          <div className="flex w-max items-center justify-center gap-x-8 2xl:gap-x-12">
            {(item.kind === 'song' || tempo.bpm !== undefined) && (
              <BeatPanel big bpm={tempo.gridBpm} displayBpm={tempo.bpm} rate={tempo.rate} manual={tempo.manual} standardBpm={item.bpm} onReset={resetTempo} onBeatStep={stepBeat} signature={item.timeSignature} offset={tempo.offset} getTime={() => audio.currentTime} playing={playing} onTap={doTap} tap={taps.length ? tapProgress(taps, beats) : null} />
            )}
            <div className="flex flex-col items-center gap-1">
              <TimecodePanel tc={tc} sync={withMusic} huge />
              {data.showSettings.artnet?.enabled && (
                <span className="text-sm text-emerald-400" data-testid="artnet-state">
                  {t.artnetSending(data.showSettings.artnet.host)}
                </span>
              )}
              {data.showSettings.oscBpm?.enabled && (
                <span className="text-sm text-emerald-400" data-testid="osc-bpm-state">
                  {t.oscBpmSending(data.showSettings.oscBpm.host, data.showSettings.oscBpm.port)}
                </span>
              )}
            </div>
          </div>
          </FitBox>
          {/* nur zur Orientierung beim Weiterschalten: welche Szene dran ist und welche als Nächstes kommt */}
          {scene && (
            <p className="shrink-0 text-center text-sm text-slate-400" data-testid="lead-scene">
              {texts.light.scenes.title}: <span className="font-semibold text-slate-200" data-testid="performance-scene">{sceneIndex + 1}. {scene.name || '–'}</span>
              {scenes[sceneIndex + 1] && (
                <span className="ml-3">
                  → {sceneIndex + 2}. {scenes[sceneIndex + 1]!.name || '–'}
                </span>
              )}
            </p>
          )}
          <div className="mx-auto grid w-full max-w-4xl shrink-0 grid-cols-4 gap-3">
            <NavButton label={t.prevItem} onClick={() => goItem(-1)} disabled={itemIndex <= 0}>
              <ChevronsLeft size={30} aria-hidden />
            </NavButton>
            <NavButton label={t.prevScene} onClick={() => goScene(-1)} disabled={itemIndex <= 0 && sceneIndex <= 0}>
              <ChevronLeft size={30} aria-hidden />
            </NavButton>
            <NavButton label={t.nextSceneButton} onClick={() => goScene(1)} disabled={itemIndex >= items.length - 1 && sceneIndex >= scenes.length - 1}>
              <ChevronRight size={30} aria-hidden />
            </NavButton>
            <NavButton label={t.nextItemButton} onClick={() => goItem(1)} disabled={itemIndex >= items.length - 1}>
              <ChevronsRight size={30} aria-hidden />
            </NavButton>
          </div>
          </div>
          {toolsHidden ? (
            <ToolsShowButton onShow={() => setToolsHidden(false)} watchPlayers={canLead} />
          ) : (
          <aside className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto" data-testid="lead-side">
            <button type="button" onClick={() => setToolsHidden(true)} title={t.hideToolsTitle} className="flex shrink-0 items-center justify-end gap-1 self-end rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-800" data-testid="lead-side-hide">
              {t.hideTools} <ChevronsRight size={16} aria-hidden />
            </button>
            <LyricsControl hideText={hideText} hideBackground={hideBackground} onText={setHideText} onBackground={setHideBackground} />
            {canLead && <PlayersPanel />}
            <DeskCuePanel cues={sync.deskCues} />
            <OscLeadPanel projectId={projectId} auto={oscAuto} onAuto={setOscAuto} manual={triggerCommands(data.oscCommands, item.id, 'manual')} log={sync.oscLog} />
          </aside>
          )}
        </main>
      ) : (
        <main className={`grid min-h-0 flex-1 gap-4 overflow-y-auto py-4 pr-6 pl-4 lg:overflow-hidden ${textHidden && sideHidden ? 'lg:grid-cols-[2.75rem_2.75rem]' : textHidden ? 'lg:grid-cols-[2.75rem_minmax(0,1fr)]' : sideHidden ? 'lg:grid-cols-[minmax(0,1fr)_2.75rem]' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'}`}>
          {/* Text nach links einklappbar (je Gerät gemerkt) – eingeklappt wird er gar nicht erst gezeichnet */}
          {textHidden ? (
            <button
              type="button"
              onClick={() => setTextHidden(false)}
              title={t.showText}
              aria-label={t.showText}
              className="flex items-center justify-center gap-2 rounded-md border border-slate-700 py-2 text-sm text-slate-300 hover:bg-slate-800 lg:flex-col lg:justify-start lg:py-4"
              data-testid="performance-text-show"
            >
              <ChevronsRight size={20} aria-hidden />
              <span className="lg:[writing-mode:vertical-rl]">{texts.regie.text}</span>
            </button>
          ) : (
          <section className="min-h-0 space-y-3 lg:overflow-y-auto" aria-label={texts.regie.text}>
            <div className="flex justify-end">
              <button type="button" onClick={() => setTextHidden(true)} title={t.hideText} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-800" data-testid="performance-text-hide">
                <ChevronsLeft size={16} aria-hidden /> {t.hideText}
              </button>
            </div>
            {item.notes && <p className="rounded-md bg-slate-900 p-3 text-slate-300">{item.notes}</p>}
            {lines.length === 0 ? (
              item.kind === 'break' || item.kind === 'announcement' ? <p className="text-3xl font-semibold text-slate-300">{item.title}</p> : <p className="text-slate-500">{texts.regie.noText}</p>
            ) : (
              <ol className="space-y-1 lg:pb-24" data-testid="performance-text">
                {lines.map(({ sectionId, sectionLabel, line }, i) => {
                  const header = i === 0 || lines[i - 1]!.sectionId !== sectionId ? sectionLabel : null;
                  const isCurrent = line.id === currentLine;
                  const speaker = line.roleId && (i === 0 || lines[i - 1]!.line.roleId !== line.roleId || lines[i - 1]!.line.direction) ? roleNames.get(line.roleId) : undefined;
                  return (
                    <li key={line.id} ref={(el) => void (el ? lineRefs.current.set(line.id, el) : lineRefs.current.delete(line.id))} data-current={isCurrent || undefined}>
                      {header !== null && <div className="mt-4 mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{header}</div>}
                      {/* kleiner Balken oben am Rand (nur hier, nicht im Textfenster) */}
                      <div className="mt-2.5 mb-0.5 ml-[4.5rem] h-1 overflow-hidden rounded-full">{progressBar(i)}</div>
                      <div className="flex items-baseline gap-2">
                        <LineTime source={clock} atSec={line.atSec} countdown={counts(i)} />
                        <p className={`min-w-0 flex-1 rounded-md px-2 py-1 leading-snug transition-colors ${isCurrent ? 'bg-sky-900 text-2xl font-semibold text-white' : 'text-xl text-slate-200'} ${line.direction ? 'italic text-slate-400' : ''}`}>
                          {speaker && (
                            <span className={`mr-2 font-semibold ${roleColors.get(line.roleId!) ? '' : 'text-sky-300'}`} style={roleColors.get(line.roleId!) ? { color: roleColors.get(line.roleId!) } : undefined} data-testid="performance-speaker">
                              {speaker}:
                            </span>
                          )}
                          {line.direction ? `(${line.text})` : isBreakLine(line) ? <BreakMark /> : line.text}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
          )}

          {/* Licht/Ton nach rechts einklappbar (je Gerät gemerkt) – eingeklappt nicht gezeichnet */}
          {sideHidden ? (
            <button
              type="button"
              onClick={() => setSideHidden(false)}
              title={t.showSide}
              aria-label={t.showSide}
              className="flex items-center justify-center gap-2 rounded-md border border-slate-700 py-2 text-sm text-slate-300 hover:bg-slate-800 lg:flex-col lg:justify-start lg:py-4"
              data-testid="performance-side-show"
            >
              <ChevronsLeft size={20} aria-hidden />
              <span className="lg:[writing-mode:vertical-rl]">{t.sideShort}</span>
            </button>
          ) : (
          <section className="min-h-0 space-y-3 lg:overflow-y-auto" aria-label={side === 'light' ? texts.light.scenes.title : texts.regie.sound.title} data-testid="performance-side">
            <div className="flex items-center gap-2">
              <div className="flex w-fit overflow-hidden rounded-md border border-slate-700 text-sm" role="tablist" aria-label={t.sideLabel}>
                {(['light', 'sound'] as Side[]).map((s) => (
                  <button key={s} type="button" role="tab" aria-selected={side === s} onClick={() => chooseSide(s)} className={`px-4 py-1.5 ${side === s ? 'bg-sky-600 text-white' : 'hover:bg-slate-800'}`}>
                    {t.sides[s]}
                  </button>
                ))}
              </div>
              <span className="flex-1" />
              <button type="button" onClick={() => setSideHidden(true)} title={t.hideSide} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-800" data-testid="performance-side-hide">
                {t.hideSide} <ChevronsRight size={16} aria-hidden />
              </button>
            </div>
            {side === 'sound' ? (
              <>
                {soundScenes.length > 0 && (
                  <SceneProgress current={soundMark(soundIndex)} next={soundMark(soundIndex + 1)} source={clock} nextItemTitle={nextItem ? nextItem.title || texts.regie.untitled : undefined} testPrefix="sound" />
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
                {/* Vorschau auf die nächste Tonszene (je Gerät ein-/ausschaltbar) */}
                {soundScenes.length > 0 && (
                  <div className="space-y-2 border-t border-slate-800 pt-3" data-testid="sound-preview">
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <input type="checkbox" checked={soundPreview} onChange={(e) => setSoundPreview(e.target.checked)} />
                      {t.showPreview}
                    </label>
                    {soundPreview &&
                      (soundScenes[soundIndex + 1] ? (
                        <div className="space-y-1 rounded-lg border-2 border-dashed border-amber-500/70 p-3">
                          <div className="text-xs font-semibold tracking-wide text-amber-400 uppercase">
                            {t.previewOf(`${soundIndex + 2}. ${soundScenes[soundIndex + 1]!.name || '–'}`)}
                          </div>
                          {hasRichText(soundScenes[soundIndex + 1]!.notes) ? (
                            <RichTextView html={soundScenes[soundIndex + 1]!.notes} className="rounded-lg bg-white/90 p-3 text-lg text-slate-900" />
                          ) : (
                            <p className="text-sm text-slate-400">{t.previewNoNote}</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500">{t.previewNone}</p>
                      ))}
                  </div>
                )}
              </>
            ) : scenes.length > 0 ? (
              <>
                <DeskCuePanel cues={sync.deskCues} />
                <LightEventCountdown events={lightEvents} source={clock} />
                <SceneProgress current={lightMark(sceneIndex)} next={lightMark(sceneIndex + 1)} source={clock} nextItemTitle={nextItem ? nextItem.title || texts.regie.untitled : undefined} testPrefix="performance" />
                {lightNote && <p className="text-lg text-slate-200" data-testid="performance-scene-note">{lightNote}</p>}
                {/* Bild: aktuelle Szene oder Vorschau auf die nächste (je Gerät gemerkt) */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex w-fit overflow-hidden rounded-md border border-slate-700 text-xs" role="radiogroup" aria-label={t.lightView}>
                    {(['current', 'next'] as LightView[]).map((v) => (
                      <button key={v} type="button" role="radio" aria-checked={lightView === v} onClick={() => setLightView(v)} className={`px-3 py-1 ${lightView === v ? 'bg-sky-600 text-white' : 'hover:bg-slate-800'}`}>
                        {t.lightViews[v]}
                      </button>
                    ))}
                  </div>
                  {showNext && <span className="text-sm font-semibold text-amber-400" data-testid="light-preview-label">{t.previewOf(`${sceneIndex + 2}. ${scenes[sceneIndex + 1]!.name || '–'}`)}</span>}
                  {lightView === 'next' && !scenes[sceneIndex + 1] && <span className="text-sm text-slate-500">{t.previewNone}</span>}
                </div>
                <div className={showNext ? 'rounded-lg border-2 border-dashed border-amber-500/70 p-2' : ''} data-testid={showNext ? 'light-preview' : 'light-current'}>
                  <SceneGrid grid={data.lightGrid} layout={layout} states={showNext ? nextStates : states} targets={data.lightTargets} templates={templates} selected={new Set()} onToggle={undefined} center />
                </div>
              </>
            ) : (
              <>
                <DeskCuePanel cues={sync.deskCues} />
                <LightEventCountdown events={lightEvents} source={clock} />
                <p className="text-slate-500">{nextItem ? t.nextItem(nextItem.title || texts.regie.untitled) : t.end}</p>
              </>
            )}
          </section>
          )}
        </main>
      )}

      <footer className="flex shrink-0 items-end gap-3 border-t border-slate-800 pt-2 pr-6 pl-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {/* Tempo und Takt links neben dem Player (Führen: groß in der Mitte) */}
        {item && !leadLayout && (item.kind === 'song' || tempo.bpm !== undefined) && (
          <BeatPanel
            bpm={tempo.gridBpm}
            displayBpm={tempo.bpm}
            rate={tempo.rate}
            manual={tempo.manual}
            standardBpm={item.bpm}
            {...(!following && resetTempo ? { onReset: () => (takeOver(), resetTempo()) } : {})}
            signature={item.timeSignature}
            offset={tempo.offset}
            getTime={() => clock.currentTime}
            playing={playing}
            {...(!following ? { onTap: () => (takeOver(), doTap()) } : {})}
            tap={taps.length ? tapProgress(taps, beats) : null}
          />
        )}
        <div className="min-w-0 flex-1">
        {/* Folgen: keine eigenen Bedienknöpfe (Audio, Szenen, Timecode) – „Frei“ wählen, um selbst zu bedienen */}
        {item && !following && (
          <div className="mx-auto max-w-4xl [&>[data-testid=regie-player]]:static [&>[data-testid=regie-player]]:mx-0 [&>[data-testid=regie-player]]:border-0">
            <PlayerBar
              record={doc && canLead ? { doc, origin: PERFORMANCE_ORIGIN } : undefined}
              settings={data.showSettings}
              key={item.id}
              projectId={projectId}
              item={item}
              media={data.media}
              playback={audio}
              setAudio={setAudioEl}
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
        {!following && !leadLayout && (
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
        )}
        </div>
        {/* Timecode unten rechts: gelaufene Zeit des Punkts, läuft mit dem Transport (Führen: groß in der Mitte) */}
        {item && !leadLayout && (
          <div className="flex shrink-0 flex-col items-end gap-1">
            <TimecodePanel tc={tc} sync={withMusic} large follow={leadCue && (leadCue.tc || leadCue.at !== undefined) ? leadTcClock : undefined} />
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

/** Füllung eines Balkens in der Textfarbe (Breite über background-size) */
const FILL = 'linear-gradient(currentColor, currentColor)';

/** Fortschritt bis zur nächsten Zeile: grün über der aktuellen (füllt sich), rot über der nächsten (läuft ab) */
function LineBar({ source, kind, startAt, nextAt }: { source: TimeSource; kind: 'current' | 'next'; startAt: number; nextAt: number }) {
  const time = usePlayerTime(source);
  const progress = Math.min(1, Math.max(0, (time - startAt) / (nextAt - startAt)));
  const width = kind === 'current' ? progress : 1 - progress;
  // als Hintergrund auf eigener Ebene gezeichnet: je Bild ändert sich nur die Füllung – kein neues Layout, und der
  // Browser malt nur diese kleine Ebene neu. Nicht ganz deckend (/99): bei deckenden Flächen, deren Größe sich
  // ändert, teilt Chromium die ganze Seite je Bild neu in Ebenen auf (gemessen: teurer als alles andere).
  return <div className={`h-full w-full bg-no-repeat will-change-transform ${kind === 'current' ? 'text-emerald-500/99' : 'text-red-500/99'}`} style={{ backgroundImage: FILL, backgroundSize: `${width * 100}% 100%` }} data-testid={`line-progress-${kind}`} data-progress={width.toFixed(2)} />;
}

/** Zeit einer Zeile; bei den nächsten Zeilen läuft stattdessen der Countdown (neu gezeichnet je Zehntelsekunde) */
function LineTime({ source, atSec, countdown, small = false }: { source: TimeSource; atSec: number | undefined; countdown: boolean; small?: boolean }) {
  const remaining = usePlayerValue(countdown ? source : null, (time) => (countdown && atSec !== undefined && atSec > time ? texts.regie.performance.countdown(atSec - time) : null));
  return (
    <span className={`w-16 shrink-0 text-right tabular-nums ${small ? 'text-xs' : 'text-sm'} ${remaining !== null ? 'font-semibold text-amber-400' : 'text-slate-500'}`} data-testid={small ? undefined : remaining !== null ? 'line-countdown' : 'line-time'}>
      {remaining ?? (atSec !== undefined ? formatSceneTime(atSec) : '')}
    </span>
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

/** Führen: Text und Hintergrund im Textfenster aus- bzw. einblenden */
function LyricsControl({ hideText, hideBackground, onText, onBackground }: { hideText: boolean; hideBackground: boolean; onText: (hide: boolean) => void; onBackground: (hide: boolean) => void }) {
  const t = texts.regie.performance;
  const toggle = (label: string, hidden: boolean, set: (hide: boolean) => void, Icon: typeof Type, testId: string) => (
    <button
      type="button"
      onClick={() => set(!hidden)}
      aria-pressed={!hidden}
      className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border px-2 py-1 text-sm font-semibold active:scale-95 ${hidden ? 'border-red-500 bg-red-500/15 text-red-200' : 'border-emerald-600 bg-emerald-500/10 text-emerald-200'}`}
      title={t.lyricsControlHint}
      data-testid={testId}
      data-hidden={hidden || undefined}
    >
      {hidden ? <EyeOff size={18} className="shrink-0" aria-hidden /> : <Icon size={18} className="shrink-0" aria-hidden />}
      <span className="flex flex-col items-start leading-tight">
        <span>{label}</span>
        <span className="text-xs font-normal opacity-80">{hidden ? t.lyricsHiddenState : t.lyricsShown}</span>
      </span>
    </button>
  );
  return (
    <section className="space-y-2 rounded-xl border border-slate-700 bg-slate-900 p-3" aria-label={t.lyricsControl} data-testid="lyrics-control">
      <span className="text-xs font-semibold tracking-wide text-slate-400 uppercase">{t.lyricsControl}</span>
      <div className="flex gap-2">
        {toggle(t.lyricsText, hideText, onText, Type, 'lyrics-toggle-text')}
        {toggle(t.lyricsBackground, hideBackground, onBackground, ImageIcon, 'lyrics-toggle-background')}
      </div>
    </section>
  );
}

/**
 * Inhalt so groß wie möglich, aber nie größer als der Platz: wird verkleinert (nicht umgebrochen), damit im Führen
 * nichts überlappt und nichts gescrollt werden muss – auf großen Bildschirmen in voller Größe.
 */
function FitBox({ children, className = '', testId }: { children: ReactNode; className?: string; testId?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const fit = () => {
      // offsetWidth/-Height ohne Transformation = natürliche Größe
      const s = Math.min(1, o.clientWidth / Math.max(1, i.offsetWidth), o.clientHeight / Math.max(1, i.offsetHeight));
      setScale(Number.isFinite(s) && s > 0 ? s : 1);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(o);
    observer.observe(i);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={outer} className={`relative overflow-hidden ${className}`} data-testid={testId} data-scale={scale.toFixed(2)}>
      <div ref={inner} className="absolute top-1/2 left-1/2 w-max" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

/** Eingeklappte Einstellungen im Führen: schmale Leiste; wartet ein Player auf „Zulassen“, wird das angezeigt */
function ToolsShowButton({ onShow, watchPlayers }: { onShow: () => void; watchPlayers: boolean }) {
  const t = texts.regie.performance;
  const [pairing, setPairing] = useState(0);
  useEffect(() => {
    if (!watchPlayers) return;
    let alive = true;
    const poll = () =>
      void api
        .players()
        .then((o) => alive && setPairing(o.pairing.length))
        .catch(() => undefined);
    poll();
    const timer = window.setInterval(poll, 3000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [watchPlayers]);
  return (
    <button
      type="button"
      onClick={onShow}
      title={pairing ? t.toolsPairing(pairing) : t.showTools}
      aria-label={t.showTools}
      className={`flex items-center justify-center gap-2 rounded-md border py-2 text-sm hover:bg-slate-800 lg:flex-col lg:justify-start lg:py-4 ${pairing ? 'border-amber-500 text-amber-200' : 'border-slate-700 text-slate-300'}`}
      data-testid="lead-side-show"
    >
      <ChevronsLeft size={20} aria-hidden />
      {pairing > 0 && <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-400" data-testid="lead-side-pairing" aria-hidden />}
      <span className="lg:[writing-mode:vertical-rl]">{pairing ? t.toolsPairing(pairing) : t.toolsShort}</span>
    </button>
  );
}

/** Laufender Schlag im Takt (1 …); läuft die Wiedergabe, je Bild geprüft – geändert wird nur beim Wechsel */
function useBeatCount(getTime: () => number, bpm: number | undefined, beats: number, offset: number, running: boolean): number | null {
  const [, setTick] = useState(0);
  const last = useRef<number | null>(null);
  const timeRef = useRef(getTime);
  useEffect(() => {
    timeRef.current = getTime;
  });
  useEffect(() => {
    if (!running || !bpm) return;
    let frame = 0;
    const loop = () => {
      const count = beatAt(timeRef.current(), bpm, beats, offset).count;
      if (count !== last.current) {
        last.current = count;
        setTick((n) => n + 1);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [running, bpm, beats, offset]);
  return bpm ? beatAt(getTime(), bpm, beats, offset).count : null;
}
