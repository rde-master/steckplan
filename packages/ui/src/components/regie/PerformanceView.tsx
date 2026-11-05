// Vorstellung (Regie, M11e): Vollbild, dunkel. Aktueller Eintrag mit mitlaufendem Text, aktuelle und nächste Lichtszene,
// Player, große Knöpfe und Pfeiltasten. „Führen“ sendet die Stelle an alle, „Folgen“ springt mit (nicht gespeichert).
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Monitor, Radio, UserRound, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  currentLineId,
  currentSceneId,
  formatDuration,
  gridLayout,
  itemLines,
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
import { KIND_ICONS } from './RegieView';
import { SceneGrid } from './SceneGrid';
import { formatSceneTime } from './ScenesSection';
import { PlayerBar, seekAudio, usePlayerTime } from './SongMedia';

const t = texts.regie.performance;

type Mode = 'free' | 'lead' | 'follow';

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
  const [sceneChoice, setSceneChoice] = useState<string | null>(null);

  const followIndex = following ? items.findIndex((i) => i.id === lead.itemId) : -1;
  const itemIndex = followIndex >= 0 ? followIndex : Math.min(index, Math.max(0, items.length - 1));
  const item = items[itemIndex];
  const scenes = item ? itemScenes(data.lightScenes, item.id) : [];
  const lines = item ? itemLines(data.show.sections, item.id) : [];
  const plainLines = lines.map((l) => l.line);

  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const time = usePlayerTime(audio);
  const playing = !!audio && !audio.paused;
  const timeScene = playing ? currentSceneId(scenes, plainLines, time) : undefined;
  const sceneId = following ? lead.sceneId : (timeScene ?? (scenes.some((s) => s.id === sceneChoice) ? sceneChoice : scenes[0]?.id) ?? undefined);
  const sceneIndex = scenes.findIndex((s) => s.id === sceneId);
  const scene = scenes[sceneIndex];
  const nextScene = scenes[sceneIndex + 1];
  const nextItem = items[itemIndex + 1];
  // mit Audio die Abspielposition (auch angehalten, z. B. nach dem Spulen), sonst die Zeile der Szene
  const currentLine = playing || (audio && time > 0) ? currentLineId(lines, time) : scene?.lineId;

  // Stelle mit Abspielposition senden: beim Führen an alle (Server), immer an Textfenster im selben Browser.
  // Bei Eintrag/Szene, Start, Pause, Spulen und alle zwei Sekunden während der Wiedergabe.
  const itemId = item?.id;
  const localCue = useLocalCueSender(projectId);
  const cueState = useRef({ mode, itemId, sceneId, audio, sendCue, localCue });
  useEffect(() => {
    cueState.current = { mode, itemId, sceneId, audio, sendCue, localCue };
  });
  useEffect(() => {
    const send = () => {
      const c = cueState.current;
      if (!c.itemId) return;
      const cue: Cue = { itemId: c.itemId, ...(c.sceneId ? { sceneId: c.sceneId } : {}), ...(c.audio ? { at: c.audio.currentTime, playing: !c.audio.paused } : {}) };
      c.localCue(cue);
      if (c.mode === 'lead') c.sendCue(cue);
    };
    send();
    const events = ['play', 'pause', 'seeked', 'ratechange'];
    for (const e of events) audio?.addEventListener(e, send);
    const timer = window.setInterval(() => {
      if (audio && !audio.paused) send();
    }, 2000);
    return () => {
      for (const e of events) audio?.removeEventListener(e, send);
      window.clearInterval(timer);
    };
  }, [mode, itemId, sceneId, audio]);
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
      setSceneChoice(sceneId ?? null);
      setMode('free');
    }
  };
  const goItem = (delta: number) => {
    takeOver();
    const next = Math.max(0, Math.min(items.length - 1, itemIndex + delta));
    setIndex(next);
    setSceneChoice(null);
  };
  const goScene = (delta: number) => {
    takeOver();
    const target = scenes[sceneIndex + delta];
    if (target) {
      setSceneChoice(target.id);
      const at = sceneTime(target, plainLines);
      if (at !== undefined && audio) seekAudio(audio, at);
      return;
    }
    // über das Ende hinaus: nächster/voriger Eintrag
    const nextIndex = itemIndex + delta;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const nextScenes = itemScenes(data.lightScenes, items[nextIndex]!.id);
    setIndex(nextIndex);
    setSceneChoice(delta > 0 ? (nextScenes[0]?.id ?? null) : (nextScenes[nextScenes.length - 1]?.id ?? null));
  };

  // Spulen (um im Live den Text an den Gesang anzupassen)
  const nudge = (sec: number) => {
    if (audio) seekAudio(audio, audio.currentTime + sec);
  };

  // Tasten: ←/→ Szene, Umschalt+←/→ eine Sekunde spulen, ↑/↓ bzw. Bild↑/Bild↓ Eintrag, Esc beendet
  const keys = useRef({ goItem, goScene, nudge, onClose });
  useEffect(() => {
    keys.current = { goItem, goScene, nudge, onClose };
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
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-800 px-3 py-2">
        <Button variant="ghost" aria-label={t.close} title={t.close} onClick={onClose}>
          <X size={22} aria-hidden />
        </Button>
        <span className="text-sm tabular-nums text-slate-400" data-testid="performance-position">
          {items.length ? `${itemIndex + 1} / ${items.length}` : ''}
        </span>
        {Icon && <Icon size={20} className="text-slate-400" aria-hidden />}
        <h2 className="min-w-[10rem] flex-1 truncate text-lg font-semibold" data-testid="performance-title">
          {item?.title || (item ? texts.regie.untitled : t.empty)}
        </h2>
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
        <main className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:overflow-hidden">
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

          <section className="min-h-0 space-y-3 lg:overflow-y-auto" aria-label={texts.light.scenes.title}>
            {scenes.length > 0 ? (
              <>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{t.currentScene}</span>
                  <span className="text-xl font-semibold" data-testid="performance-scene">
                    {sceneIndex + 1}. {scene?.name || '–'}
                  </span>
                  {scene && sceneTime(scene, plainLines) !== undefined && <span className="tabular-nums text-slate-400">{formatSceneTime(sceneTime(scene, plainLines)!)}</span>}
                </div>
                {scene?.notes && <p className="text-slate-300">{scene.notes}</p>}
                <SceneGrid grid={data.lightGrid} layout={layout} states={states} targets={data.lightTargets} templates={templates} selected={new Set()} onToggle={undefined} />
                <p className="text-sm text-slate-400" data-testid="performance-next">
                  {nextScene ? t.nextScene(`${sceneIndex + 2}. ${nextScene.name}`) : nextItem ? t.nextItem(nextItem.title || texts.regie.untitled) : t.end}
                </p>
              </>
            ) : (
              <p className="text-slate-500">{nextItem ? t.nextItem(nextItem.title || texts.regie.untitled) : t.end}</p>
            )}
            <p className="text-sm text-slate-500">{item.durationSec !== undefined ? `${t.duration}: ${formatDuration(item.durationSec)}` : ''}</p>
          </section>
        </main>
      )}

      <footer className="shrink-0 border-t border-slate-800 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {item && (item.media?.length ?? 0) > 0 && (
          <div className="mx-auto max-w-4xl [&>[data-testid=regie-player]]:static [&>[data-testid=regie-player]]:mx-0 [&>[data-testid=regie-player]]:border-0">
            <PlayerBar
              key={item.id}
              projectId={projectId}
              item={item}
              media={data.media}
              audio={audio}
              setAudio={setAudio}
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
