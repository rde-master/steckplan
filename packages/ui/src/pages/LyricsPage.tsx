// Textfenster als eigene Seite: zentrierter Text, fünf Zeilen, Vollbild per Antippen.
// Folgt der Person, die in der Vorstellung führt; im selben Browser auch der eigenen Vorstellung.
import { useEffect, useState } from 'react';
import { currentLineId, effectiveBackground, itemTimedLines, itemSections, lyricsRange, sectionBackground } from '@steckplan/core';
import { LyricsBackgroundView } from '../components/regie/LyricsBackgroundView';
import { LyricsDisplay, useCueClock, useLocalCue, type ReceivedCue } from '../components/regie/LyricsWindow';
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

/** Im Steckplan Player: mehrere Textfenster vorgeladen, sichtbar nur das, in dem geführt wird */
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
  const cue: ReceivedCue | null = lead ? { ...lead, receivedAt: state?.leadReceivedAt ?? 0 } : local;
  const time = useCueClock(cue);
  const fullscreen = useFullscreen();
  const onLead = player?.onLead;
  const leading = lead !== null;
  useEffect(() => {
    onLead?.(id, leading);
  }, [onLead, id, leading]);

  const item = cue ? data.show.items.find((i) => i.id === cue.itemId) : undefined;
  const lines = item ? itemTimedLines(data.show.sections, item) : [];
  const scene = cue?.sceneId ? data.lightScenes.find((s) => s.id === cue.sceneId) : undefined;
  const current = time !== undefined ? currentLineId(lines, time) : scene?.lineId;
  const title = item?.title || (item ? texts.regie.untitled : '');
  const showTitle = data.showSettings.lyricsShowTitle !== false;
  const roleNames = new Map((item?.roles ?? []).map((r) => [r.id, r.name]));
  const roleColors = new Map((item?.roles ?? []).flatMap((r) => (r.color ? [[r.id, r.color] as const] : [])));

  const visible = player ? player.visible : true;
  useEffect(() => {
    if (visible) document.title = title ? `${t.title} – ${title}` : t.title;
  }, [title, visible]);

  const status = state?.status;
  const message = status === 'kicked' ? (state?.notice ?? texts.project.kicked) : status === 'unauthorized' || status === 'notFound' ? t.noAccess : !item ? (lead || local ? t.waiting : t.nobodyLeads) : null;

  // Ende des Punkts erreicht (Dauer) → Text ausblenden, sofern nicht abgeschaltet
  const ended = !!item && item.lyricsHideAtEnd !== false && item.durationSec !== undefined && time !== undefined && time >= item.durationSec - 0.05;
  // Hintergrund: Bild des aktuellen Abschnitts (bzw. vor dem Start: des ersten), sonst der des Eintrags bzw. der Standard
  const sections = item ? itemSections(data.show.sections, item.id) : [];
  const sectionId = (lines.find((l) => l.line.id === current) ?? lines[0])?.sectionId;
  const sectionImage = sectionBackground(sections, sectionId, undefined);
  const { background, own } = effectiveBackground(data.showSettings, item);
  // beim Führen ausgeblendet: Hintergrund (schwarz) bzw. Text – weich
  const backgroundOff = cue?.hideBackground === true;
  const textOff = cue?.hideText === true;

  // im Player: unsichtbare Fenster halten nur die Verbindung (Texte aktuell), zeigen aber nichts
  if (!visible) return null;
  return (
    <div
      className={`dark fixed inset-0 overflow-hidden bg-slate-950 text-slate-100 select-none ${player ? 'cursor-none' : 'cursor-pointer'}`}
      onClick={player ? undefined : toggleFullscreen}
      title={player ? undefined : t.fullscreenHint}
      data-testid="lyrics-page"
    >
      {/* eigener Hintergrund des Eintrags beginnt mit dem Eintrag neu */}
      <LyricsBackgroundView key={own ? `item-${item?.id}` : 'standard'} projectId={id} media={data.media} background={background} own={own} sectionImage={sectionImage} off={backgroundOff} />
      <div className={`relative h-full transition-opacity duration-700 ${textOff && !message ? 'opacity-0' : 'opacity-100'}`} data-testid={textOff && !message ? 'lyrics-text-off' : undefined}>
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
      ) : lines.length === 0 ? (
        <p className="flex h-full items-center justify-center p-8 text-center text-[6vw] font-semibold">{showTitle ? title : ''}</p>
      ) : item?.lyricsVisible === false ? (
        <div data-testid="lyrics-hidden" />
      ) : (
        // am Ende der Dauer weich ausblenden (abschaltbar je Punkt)
        <div className={`h-full transition-opacity duration-1000 ${ended ? 'opacity-0' : 'opacity-100'}`} data-testid={ended ? 'lyrics-ended' : 'lyrics-active'}>
          <LyricsDisplay
            activeColor={data.showSettings.lyricsActiveColor}
            activeBg={data.showSettings.lyricsActiveBg}
            mode={item?.lyricsMode ?? data.showSettings.lyricsMode ?? 'lines'}
            highlight={data.showSettings.lyricsHighlight !== false}
            translation={data.showSettings.lyricsTranslation === true}
            title={showTitle ? title : ''}
            lines={lines} currentLineId={current} roleNames={roleNames} roleColors={roleColors} {...lyricsRange(data.showSettings)} />
        </div>
      )}
      </div>
      {!fullscreen && !player && <div className="pointer-events-none absolute right-0 bottom-2 left-0 text-center text-sm text-slate-500">{t.fullscreenHint}</div>}
    </div>
  );
}
