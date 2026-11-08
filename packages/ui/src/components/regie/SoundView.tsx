// Regie → Tonszenen: links der Ablauf, rechts je Punkt ein großes Textfeld mit Formatierung für den Ton.
// Auf dem Handy erst die Liste, Antippen öffnet den Punkt.
import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import type * as Y from 'yjs';
import { itemTimedLines, itemNumbers, itemSoundScenes, sceneTime, updateShowItem } from '@steckplan/core';
import { usePointPlayback } from '../../lib/transport';
import { hasRichText } from '../../lib/richText';
import { useIsNarrow } from '../../lib/useProjectDoc';
import type { ProjectData } from '../../lib/useProjectData';
import { texts } from '../../texts';
import { ICON } from '../icons';
import { Button } from '../ui';
import { ItemNumber, KIND_ICONS } from './RegieView';
import { useRegieSelection } from './regieSelection';
import { itemAudioSrc } from './Waveform';
import { RichTextEditor } from './RichTextEditor';
import { PlayerBar, TimecodePanel, usePlayerTime } from './SongMedia';
import { SoundScenesSection } from './SoundScenesSection';

const t = texts.regie.sound;

export function SoundView({ projectId, doc, origin, data, editable }: { projectId: string; doc: Y.Doc; origin: object; data: ProjectData; editable: boolean }) {
  const narrow = useIsNarrow(900);
  const items = data.show.items;
  const [selectedId, setSelectedId] = useRegieSelection(projectId);
  const item = items.find((i) => i.id === selectedId) ?? (narrow ? undefined : items[0]);
  const numbers = itemNumbers(items);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const { tc, music, sync } = usePointPlayback(item?.id, item?.durationSec, audio, item?.audioOffsetSec);
  const time = usePlayerTime(music);

  if (items.length === 0) return <p className="mx-auto max-w-2xl p-6 text-sm text-slate-500" data-testid="sound-view">{t.empty}</p>;

  const list = (
    <ul className="min-h-0 flex-1 overflow-y-auto" aria-label={t.items} data-testid="sound-items">
      {items.map((i) => {
        const Icon = KIND_ICONS[i.kind];
        const isSelected = item?.id === i.id;
        return (
          <li key={i.id} className="border-b border-slate-100 dark:border-slate-800">
            <button
              type="button"
              aria-current={isSelected ? 'true' : undefined}
              onClick={() => setSelectedId(i.id)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${isSelected ? 'bg-sky-50 dark:bg-sky-950' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              <ItemNumber number={numbers.get(i.id)} />
              <Icon size={16} className="shrink-0 text-slate-500" aria-label={texts.regie.kinds[i.kind]} />
              <span className="min-w-0 flex-1 truncate font-medium">{i.title || texts.regie.untitled}</span>
              {itemSoundScenes(data.soundScenes, i.id).length > 0 && <span className="shrink-0 text-xs text-slate-500">{t.count(itemSoundScenes(data.soundScenes, i.id).length)}</span>}
              {hasRichText(i.soundNotes) && <span className="h-2 w-2 shrink-0 rounded-full bg-sky-500" title={t.hasNotes} aria-label={t.hasNotes} />}
            </button>
          </li>
        );
      })}
    </ul>
  );

  const lines = item ? itemTimedLines(data.show.sections, item) : [];
  const waveSrc = itemAudioSrc(projectId, item);
  const detail = item ? (
    <article className="mx-auto max-w-5xl space-y-3 p-4" aria-label={item.title || texts.regie.untitled} data-testid="sound-detail">
      <header className="flex items-center gap-2">
        {narrow && (
          <Button variant="ghost" aria-label={t.back} onClick={() => setSelectedId(null)}>
            <ChevronLeft {...ICON} />
          </Button>
        )}
        <ItemNumber number={numbers.get(item.id)} />
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{item.title || texts.regie.untitled}</h2>
      </header>
      <SoundScenesSection waveSrc={waveSrc} key={`sound-${item.id}`} doc={doc} origin={origin} item={item} data={data} lines={lines} music={music} editable={editable} />
      <section className="space-y-2" aria-label={t.general}>
        <h3 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{t.general}</h3>
        <RichTextEditor key={item.id} value={item.soundNotes} editable={editable} minHeight="min-h-32" label={t.notes(item.title || texts.regie.untitled)} onChange={(html) => updateShowItem(doc, item.id, { soundNotes: html || undefined }, origin)} />
      </section>
      <PlayerBar
        key={`player-${item.id}`}
        settings={data.showSettings}
        projectId={projectId}
        item={item}
        media={data.media}
        playback={music}
        setAudio={setAudio}
        time={time}
        recording={false}
        onNextLine={() => undefined}
        nextLineText={undefined}
        onClearTimes={() => undefined}
        aside={<TimecodePanel tc={tc} sync={sync} />}
        markers={itemSoundScenes(data.soundScenes, item.id).flatMap((s, i) => {
          const at = sceneTime(s, lines.map((l) => l.line));
          return at === undefined ? [] : [{ id: s.id, at, label: `${i + 1} ${s.name}` }];
        })}
      />
    </article>
  ) : null;

  if (narrow) return <div className="min-h-0 flex-1 overflow-y-auto bg-white dark:bg-slate-900" data-testid="sound-view">{detail ?? list}</div>;
  return (
    <div className="flex min-h-0 flex-1" data-testid="sound-view">
      <div className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white 2xl:w-72 dark:border-slate-700 dark:bg-slate-900">{list}</div>
      <div className="min-w-0 flex-1 overflow-y-auto">{detail}</div>
    </div>
  );
}
