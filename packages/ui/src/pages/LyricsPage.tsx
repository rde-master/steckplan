// Textfenster als eigene Seite: zentrierter Text, fünf Zeilen, Vollbild per Antippen.
// Folgt der Person, die in der Vorstellung führt; im selben Browser auch der eigenen Vorstellung.
import { useEffect, useMemo, useState } from 'react';
import { cueLevels, currentLineId, type CuePause, effectiveBackground, itemTimedLines, itemSections, lyricsRange, sectionBackground } from '@steckplan/core';
import { LyricsBackgroundView } from '../components/regie/LyricsBackgroundView';
import { LyricsDisplay, useCueSource, useLocalCue, type ReceivedCue } from '../components/regie/LyricsWindow';
import { api } from '../lib/api';
import { backgroundPreloadIds } from '../lib/backgroundPreload';
import { FADE_SWITCH_MS, useFadeSwitch } from '../lib/fadeSwitch';
import { usePreloadImages } from '../lib/imagePreload';
import { usePlayerValue } from '../lib/playerTime';
import { useProjectData } from '../lib/useProjectData';
import { useProjectDoc } from '../lib/useProjectDoc';
import { texts } from '../texts';

const t = texts.regie.lyricsPage;

function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  // Bildschirm anlassen (Tablet)
  void (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<unknown> } }).wakeLock?.request('screen').catch(() => undefined);
}

function useFullscreen(): boolean {
  const [on, setOn] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const update = () => setOn(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  return on;
}

/** Im Steckplan Player: mehrere Textfenster vorgeladen, sichtbar nur das, in dem geführt wird (bzw. zuletzt wurde) */
export interface PlayerEmbedding {
  visible: boolean;
  onLead: (projectId: string, leading: boolean) => void;
}

export function LyricsPage({ id, player }: { id: string; player?: PlayerEmbedding }) {
  const project = useProjectDoc(id);
  const data = useProjectData(project?.doc);
  const state = project?.state;
  const local = useLocalCue(id);
  const lead = state?.lead ?? null;
  const leadReceivedAt = state?.leadReceivedAt ?? 0;
  const liveCue: ReceivedCue | null = useMemo(() => (lead ? { ...lead, receivedAt: leadReceivedAt } : local), [lead, leadReceivedAt, local]);
  const fullscreen = useFullscreen();
  const onLead = player?.onLead;
  const leading = lead !== null;
  useEffect(() => {
    onLead?.(id, leading);
  }, [onLead, id, leading]);

  const status = state?.status;
  const statusMessage = status === 'kicked' ? (state?.notice ?? texts.project.kicked) : status === 'unauthorized' || status === 'notFound' ? t.noAccess : null;
  // Ansicht: Hinweis, ohne Text (Player, niemand führt), Pause oder ein Eintrag – Wechsel weich (erst aus-, dann einblenden)
  const liveItem = liveCue ? data.show.items.find((i) => i.id === liveCue.itemId) : undefined;
  const view = statusMessage ? 'status' : player && !lead ? 'idle' : liveCue?.pause ? 'pause' : liveItem ? `item:${liveItem.id}` : 'message';
  const { shown, visible: viewVisible } = useFadeSwitch(view);
  // während des Ausblendens bleibt die bisherige Stelle stehen (sonst blendet schon der neue Text aus)
  const [frozen, setFrozen] = useState(liveCue);
  const switching = shown !== view;
  if (!switching && frozen !== liveCue) setFrozen(liveCue);
  const cue = switching ? frozen : liveCue;
  const idle = shown === 'idle';

  // Uhr der Stelle: geprüft wird je Bild, neu gezeichnet nur beim Wechsel der Zeile bzw. am Ende
  const clock = useCueSource(cue);
  const hasTime = cue?.at !== undefined;
  const pause = shown === 'pause' ? cue?.pause : undefined;
  const item = cue && !idle && !pause ? data.show.items.find((i) => i.id === cue.itemId) : undefined;
  const lines = item ? itemTimedLines(data.show.sections, item) : [];
  const scene = cue?.sceneId ? data.lightScenes.find((s) => s.id === cue.sceneId) : undefined;
  const lineByTime = usePlayerValue(clock, (time) => currentLineId(lines, time));
  const current = hasTime ? lineByTime : scene?.lineId;
  const title = item?.title || (item ? texts.regie.untitled : '');
  const showTitle = data.showSettings.lyricsShowTitle !== false;
  const roleNames = new Map((item?.roles ?? []).map((r) => [r.id, r.name]));
  const roleColors = new Map((item?.roles ?? []).flatMap((r) => (r.color ? [[r.id, r.color] as const] : [])));

  const visible = player ? player.visible : true;
  useEffect(() => {
    if (visible) document.title = title ? `${t.title} – ${title}` : t.title;
  }, [title, visible]);

  const message = statusMessage ?? (shown === 'message' ? (lead || local ? t.waiting : t.nobodyLeads) : null);

  // Ende des Punkts erreicht (Dauer) → Text ausblenden, sofern nicht abgeschaltet
  const durationSec = item?.durationSec;
  const pastEnd = usePlayerValue(clock, (time) => durationSec !== undefined && time >= durationSec - 0.05);
  const ended = !!item && item.lyricsHideAtEnd !== false && hasTime && pastEnd;
  // Hintergrund: Bild des aktuellen Abschnitts (bzw. vor dem Start: des ersten), sonst der des Eintrags bzw. der Standard;
  // in der Pause und ohne Führen der Standard
  const sections = item ? itemSections(data.show.sections, item.id) : [];
  const sectionId = (lines.find((l) => l.line.id === current) ?? lines[0])?.sectionId;
  const sectionImage = sectionBackground(sections, sectionId, undefined);
  const { background, own } = effectiveBackground(data.showSettings, item);
  // kommende Bilder schon laden und decodieren (auch im Player, solange das Fenster unsichtbar ist)
  usePreloadImages(
    backgroundPreloadIds({ items: data.show.items, sections: data.show.sections, settings: data.showSettings, media: data.media, itemId: item?.id ?? liveItem?.id, sectionId }).map((m) => api.mediaUrl(id, m)),
  );
  // beim Führen: Helligkeit von Hintergrund (darunter schwarz) und Text, übergeblendet in der mitgeschickten Zeit
  const fade = cueLevels(cue);
  const textLevel = message ? 1 : fade.text;
  // Player ohne Führen: Bild ohne Text bzw. schwarz (Einstellung)
  const backgroundLevel = idle ? (data.showSettings.lyricsIdle === 'black' ? 0 : 1) : fade.background;
  const backgroundFade = idle ? IDLE_FADE_SEC : fade.fadeSec;
  const shadow = data.showSettings.lyricsShadow !== false;

  // im Player: unsichtbare Fenster halten nur die Verbindung (Texte aktuell), zeigen aber nichts
  if (!visible) return null;
  return (
    <div
      className={`dark fixed inset-0 overflow-hidden bg-slate-950 text-slate-100 select-none ${player ? 'steckplan-fade-in cursor-none bg-black' : 'cursor-pointer'}`}
      onClick={player ? undefined : toggleFullscreen}
      title={player ? undefined : t.fullscreenHint}
      data-testid="lyrics-page"
      data-view={shown}
    >
      {/* eigener Hintergrund des Eintrags beginnt mit dem Eintrag neu (und blendet ein) */}
      <div key={own ? `item-${item?.id}` : 'standard'} className="steckplan-fade-in absolute inset-0">
        <LyricsBackgroundView projectId={id} media={data.media} background={background} own={own} sectionImage={sectionImage} level={backgroundLevel} fadeSec={backgroundFade} />
      </div>
      <div
        className="relative h-full transition-opacity ease-in-out motion-reduce:transition-none"
        style={{ opacity: textLevel, transitionDuration: `${fade.fadeSec}s`, ...(shadow ? { textShadow: TEXT_SHADOW } : {}) }}
        data-testid={textLevel === 0 ? 'lyrics-text-off' : 'lyrics-text-layer'}
        data-level={textLevel}
      >
        <div className="h-full transition-opacity ease-in-out motion-reduce:transition-none" style={{ opacity: viewVisible ? 1 : 0, transitionDuration: `${FADE_SWITCH_MS}ms` }}>
          {message ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center text-[3vw] text-slate-500">
              <p>{message}</p>
              {status === 'kicked' && (
                <button
                  type="button"
                  className="rounded-md bg-sky-600 px-4 py-2 text-base text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    project?.reconnect();
                  }}
                >
                  {texts.project.reconnect}
                </button>
              )}
            </div>
          ) : idle ? (
            <div data-testid="lyrics-idle" />
          ) : pause ? (
            <PauseScreen key={`${pause.leftSec}-${cue?.receivedAt}`} pause={pause} receivedAt={cue?.receivedAt ?? 0} />
          ) : !item ? null : lines.length === 0 ? (
            <p className="flex h-full items-center justify-center p-8 text-center text-[6vw] font-semibold">{showTitle ? title : ''}</p>
          ) : item.lyricsVisible === false ? (
            <div data-testid="lyrics-hidden" />
          ) : (
            // am Ende der Dauer weich ausblenden (abschaltbar je Punkt)
            <div className={`h-full transition-opacity duration-1000 ${ended ? 'opacity-0' : 'opacity-100'}`} data-testid={ended ? 'lyrics-ended' : 'lyrics-active'}>
              <LyricsDisplay
                activeColor={data.showSettings.lyricsActiveColor}
                activeBg={data.showSettings.lyricsActiveBg}
                mode={item.lyricsMode ?? data.showSettings.lyricsMode ?? 'lines'}
                highlight={data.showSettings.lyricsHighlight !== false}
                translation={data.showSettings.lyricsTranslation === true}
                title={showTitle ? title : ''}
                lines={lines} currentLineId={current} roleNames={roleNames} roleColors={roleColors} {...lyricsRange(data.showSettings)} />
            </div>
          )}
        </div>
      </div>
      {!fullscreen && !player && <div className="pointer-events-none absolute right-0 bottom-2 left-0 text-center text-sm text-slate-500">{t.fullscreenHint}</div>}
    </div>
  );
}

/** Ohne Führen (Player): so weich blendet das Bild ein bzw. auf Schwarz (Sekunden) */
const IDLE_FADE_SEC = 1.5;
/** Schatten hinter dem Text: lesbar auch auf hellen Bildern (wächst mit der Schrift) */
const TEXT_SHADOW = '0 0.04em 0.12em rgb(0 0 0 / 0.85), 0 0 0.5em rgb(0 0 0 / 0.55)';

/** Pause: Titel groß, darunter die Restzeit (zählt selbst herunter); danach „Es geht gleich weiter“ */
function PauseScreen({ pause, receivedAt }: { pause: CuePause; receivedAt: number }) {
  const left = useCountdownSec(pause.leftSec, receivedAt);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[3vh] p-[4vw] text-center" data-testid="lyrics-pause">
      <p className="text-[8vw] leading-tight font-semibold" data-testid="lyrics-pause-title">
        {pause.title || t.pauseTitle}
      </p>
      {left !== undefined && (
        <p className="text-[3.6vw] text-slate-200" data-testid="lyrics-pause-left">
          {left > 0 ? (
            <>
              {t.pauseUntil} <span className="inline-block min-w-[5ch] text-left font-semibold tabular-nums">{formatClock(left)}</span>
            </>
          ) : (
            t.pauseSoon
          )}
        </p>
      )}
    </div>
  );
}

/** Restzeit in ganzen Sekunden ab dem Empfang (aufgerundet); undefined ohne Zeit. Neue Pause: neu einhängen (key). */
function useCountdownSec(leftSec: number | undefined, receivedAt: number): number | undefined {
  const [left, setLeft] = useState(() => remaining(leftSec, receivedAt));
  useEffect(() => {
    if (leftSec === undefined) return;
    const timer = window.setInterval(() => setLeft(remaining(leftSec, receivedAt)), 250);
    return () => window.clearInterval(timer);
  }, [leftSec, receivedAt]);
  return left;
}

function remaining(leftSec: number | undefined, receivedAt: number): number | undefined {
  return leftSec === undefined ? undefined : Math.max(0, Math.ceil(leftSec - (performance.now() - receivedAt) / 1000));
}

/** „12:05“ bzw. „1:02:03“ */
function formatClock(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
