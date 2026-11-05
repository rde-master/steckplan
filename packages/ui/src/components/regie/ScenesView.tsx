// Regie → Lichtszenen: links die Lieder und Schauspielstücke, rechts die Szenen des gewählten Stücks,
// unten der Player (Musik des Stücks, Szenen als Marken). Auf dem Handy erst die Liste, Antippen öffnet das Stück.
import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import type * as Y from 'yjs';
import { itemLines, itemScenes, sceneTime, type Library } from '@steckplan/core';
import { useIsNarrow } from '../../lib/useProjectDoc';
import type { ProjectData } from '../../lib/useProjectData';
import { texts } from '../../texts';
import { ICON } from '../icons';
import { Button } from '../ui';
import { KIND_ICONS } from './RegieView';
import { ScenesSection } from './ScenesSection';
import { PlayerBar, usePlayerTime } from './SongMedia';

const t = texts.light.scenesView;

export function ScenesView({ projectId, doc, origin, data, library, editable }: { projectId: string; doc: Y.Doc; origin: object; data: ProjectData; library: Library | null; editable: boolean }) {
  const narrow = useIsNarrow(900);
  const items = data.show.items.filter((i) => i.kind === 'song' || i.kind === 'play');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const item = items.find((i) => i.id === selectedId) ?? (narrow ? undefined : items[0]);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const time = usePlayerTime(audio);

  if (items.length === 0) return <p className="mx-auto max-w-2xl p-6 text-sm text-slate-500" data-testid="scenes-view">{t.empty}</p>;

  const list = (
    <ul className="min-h-0 flex-1 overflow-y-auto" aria-label={t.items} data-testid="scenes-items">
      {items.map((i) => {
        const Icon = KIND_ICONS[i.kind];
        const count = itemScenes(data.lightScenes, i.id).length;
        const isSelected = item?.id === i.id;
        return (
          <li key={i.id} className="border-b border-slate-100 dark:border-slate-800">
            <button
              type="button"
              aria-current={isSelected ? 'true' : undefined}
              onClick={() => setSelectedId(i.id)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${isSelected ? 'bg-sky-50 dark:bg-sky-950' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              <Icon size={16} className="shrink-0 text-slate-500" aria-label={texts.regie.kinds[i.kind]} />
              <span className="min-w-0 flex-1 truncate font-medium">{i.title || texts.regie.untitled}</span>
              <span className="shrink-0 text-xs text-slate-500">{t.count(count)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  const lines = item ? itemLines(data.show.sections, item.id) : [];
  const hasAudio = !!item && (item.media?.length ?? 0) > 0;
  const detail = item ? (
    <article className="mx-auto max-w-5xl space-y-4 p-4" aria-label={item.title || texts.regie.untitled} data-testid="scenes-detail">
      <header className="flex items-center gap-2">
        {narrow && (
          <Button variant="ghost" aria-label={t.back} onClick={() => setSelectedId(null)}>
            <ChevronLeft {...ICON} />
          </Button>
        )}
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{item.title || texts.regie.untitled}</h2>
        {!hasAudio && item.kind === 'song' && <span className="text-xs text-slate-500">{t.noAudio}</span>}
      </header>
      <ScenesSection key={item.id} doc={doc} origin={origin} item={item} data={data} library={library} lines={lines} time={time} audio={hasAudio ? audio : null} editable={editable} />
      {hasAudio && (
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
          markers={itemScenes(data.lightScenes, item.id).flatMap((s, i) => {
            const at = sceneTime(s, lines.map((l) => l.line));
            return at === undefined ? [] : [{ id: s.id, at, label: `${i + 1} ${s.name}` }];
          })}
        />
      )}
    </article>
  ) : null;

  if (narrow) return <div className="min-h-0 flex-1 overflow-y-auto bg-white dark:bg-slate-900" data-testid="scenes-view">{detail ?? list}</div>;
  return (
    <div className="flex min-h-0 flex-1" data-testid="scenes-view">
      <div className="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">{list}</div>
      <div className="min-w-0 flex-1 overflow-y-auto">{detail}</div>
    </div>
  );
}
