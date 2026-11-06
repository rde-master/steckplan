// Textfenster als eigene Seite: zentrierter Text, fünf Zeilen, Vollbild per Antippen.
// Folgt der Person, die in der Vorstellung führt; im selben Browser auch der eigenen Vorstellung.
import { useEffect, useState } from 'react';
import { currentLineId, itemTimedLines, itemSections, lyricsRange, sectionBackground } from '@steckplan/core';
import { LyricsDisplay, useCueClock, useLocalCue, type ReceivedCue } from '../components/regie/LyricsWindow';
import { api } from '../lib/api';
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

export function LyricsPage({ id }: { id: string }) {
  const project = useProjectDoc(id);
  const data = useProjectData(project?.doc);
  const state = project?.state;
  const local = useLocalCue(id);
  const lead = state?.lead ?? null;
  const cue: ReceivedCue | null = lead ? { ...lead, receivedAt: state?.leadReceivedAt ?? 0 } : local;
  const time = useCueClock(cue);
  const fullscreen = useFullscreen();

  const item = cue ? data.show.items.find((i) => i.id === cue.itemId) : undefined;
  const lines = item ? itemTimedLines(data.show.sections, item) : [];
  const scene = cue?.sceneId ? data.lightScenes.find((s) => s.id === cue.sceneId) : undefined;
  const current = time !== undefined ? currentLineId(lines, time) : scene?.lineId;
  const title = item?.title || (item ? texts.regie.untitled : '');
  const showTitle = data.showSettings.lyricsShowTitle !== false;
  const roleNames = new Map((item?.roles ?? []).map((r) => [r.id, r.name]));

  useEffect(() => {
    document.title = title ? `${t.title} – ${title}` : t.title;
  }, [title]);

  const status = state?.status;
  const message = status === 'kicked' ? (state?.notice ?? texts.project.kicked) : status === 'unauthorized' || status === 'notFound' ? t.noAccess : !item ? (lead || local ? t.waiting : t.nobodyLeads) : null;

  // Ende des Punkts erreicht (Dauer) → Text ausblenden, sofern nicht abgeschaltet
  const ended = !!item && item.lyricsHideAtEnd !== false && item.durationSec !== undefined && time !== undefined && time >= item.durationSec - 0.05;
  // Hintergrund nach dem Abschnitt der aktuellen (bzw. vor dem Start: der ersten) Zeile; sonst Standardbild
  const standard = data.showSettings.lyricsBackground;
  const dim = standard?.dim ?? 0.5;
  const sections = item ? itemSections(data.show.sections, item.id) : [];
  const sectionId = (lines.find((l) => l.line.id === current) ?? lines[0])?.sectionId;
  const activeBackground = sectionBackground(sections, sectionId, standard?.mediaId);
  // alle Bilder des Eintrags übereinander (vorgeladen), sichtbar nur das aktive – weich überblendet
  const layers = [...new Set([standard?.mediaId, ...sections.map((s) => s.backgroundMediaId)].filter((x): x is string => !!x))];

  return (
    <div className="dark fixed inset-0 cursor-pointer overflow-hidden bg-slate-950 text-slate-100 select-none" onClick={toggleFullscreen} title={t.fullscreenHint} data-testid="lyrics-page">
      {layers.map((mediaId) => (
        <div
          key={mediaId}
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-700 ease-out"
          style={{ backgroundImage: `url("${api.mediaUrl(id, mediaId)}")`, opacity: mediaId === activeBackground ? 1 : 0 }}
          data-testid={mediaId === activeBackground ? 'lyrics-background' : undefined}
          data-media={mediaId}
        />
      ))}
      {activeBackground && <div className="absolute inset-0 bg-black" style={{ opacity: dim }} />}
      <div className="relative h-full">
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
            title={showTitle ? title : ''}
            lines={lines} currentLineId={current} roleNames={roleNames} {...lyricsRange(data.showSettings)} />
        </div>
      )}
      </div>
      {!fullscreen && <div className="pointer-events-none absolute right-0 bottom-2 left-0 text-center text-sm text-slate-500">{t.fullscreenHint}</div>}
    </div>
  );
}
