// Textfenster als eigene Seite: zentrierter Text, fünf Zeilen, Vollbild per Antippen.
// Folgt der Person, die in der Vorstellung führt; im selben Browser auch der eigenen Vorstellung.
import { useEffect, useState } from 'react';
import { currentLineId, itemLines, lyricsRange } from '@steckplan/core';
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
  const lines = item ? itemLines(data.show.sections, item.id) : [];
  const scene = cue?.sceneId ? data.lightScenes.find((s) => s.id === cue.sceneId) : undefined;
  const current = time !== undefined ? currentLineId(lines, time) : scene?.lineId;
  const title = item?.title || (item ? texts.regie.untitled : '');
  const roleNames = new Map((item?.roles ?? []).map((r) => [r.id, r.name]));

  useEffect(() => {
    document.title = title ? `${t.title} – ${title}` : t.title;
  }, [title]);

  const status = state?.status;
  const message = status === 'unauthorized' || status === 'notFound' ? t.noAccess : !item ? (lead || local ? t.waiting : t.nobodyLeads) : null;

  const background = data.showSettings.lyricsBackground;

  return (
    <div className="dark fixed inset-0 cursor-pointer overflow-hidden bg-slate-950 text-slate-100 select-none" onClick={toggleFullscreen} title={t.fullscreenHint} data-testid="lyrics-page">
      {background && (
        <>
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${api.mediaUrl(id, background.mediaId)}")` }} data-testid="lyrics-background" />
          <div className="absolute inset-0 bg-black" style={{ opacity: background.dim }} />
        </>
      )}
      <div className="relative h-full">
      {message ? (
        <p className="flex h-full items-center justify-center p-8 text-center text-[3vw] text-slate-500">{message}</p>
      ) : lines.length === 0 ? (
        <p className="flex h-full items-center justify-center p-8 text-center text-[6vw] font-semibold">{title}</p>
      ) : (
        <LyricsDisplay title={title} lines={lines} currentLineId={current} roleNames={roleNames} {...lyricsRange(data.showSettings)} />
      )}
      </div>
      {!fullscreen && <div className="pointer-events-none absolute right-0 bottom-2 left-0 text-center text-sm text-slate-500">{t.fullscreenHint}</div>}
    </div>
  );
}
