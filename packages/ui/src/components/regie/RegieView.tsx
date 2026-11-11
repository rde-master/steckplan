// Regie (M11a): Ablauf links, gewählter Eintrag rechts (Angaben, Rollen, Texte).
// Auf dem Handy erst der Ablauf, Antippen öffnet den Eintrag.
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Clapperboard, Coffee, Copy, Drama, GripVertical, Link2, ListOrdered, Megaphone, Monitor, Music, Settings2, Trash2, X, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type DragEvent, type ReactNode } from 'react';
import type * as Y from 'yjs';
import {
  addTap,
  BPM_MAX,
  BPM_MIN,
  DEFAULT_TIME_SIGNATURE,
  parseTimeSignature,
  TAP_RESET_SEC,
  tapProgress,
  tapTempo,
  TIME_SIGNATURES,
  type Tap,
  addShowItem,
  itemTimedLines,
  itemNumbers,
  itemScenes,
  sceneTime,
  type Cue,
  type Library,
  type MediaRef,
  type SyncClientState,
  formatDuration,
  itemSections,
  moveShowItem,
  parseDuration,
  personName,
  removeShowItem,
  renumberShowItems,
  duplicateShowItem,
  showSchedule,
  updateShowItem,
  updateShowSettings,
  type Person,
  type RemoteCommand,
  type ShowItem,
  type ShowItemKind,
  type ShowSettings,
  itemTempo,
  isVideoMedia,
  lyricsImages,
} from '@steckplan/core';
import { useIsNarrow } from '../../lib/useProjectDoc';
import type { ProjectData } from '../../lib/useProjectData';
import { texts } from '../../texts';
import { ICON } from '../icons';
import { Button, Field, TextArea, TextInput } from '../ui';
import { LightSetupView } from './LightSetupView';
import { OffsetTimeline } from './OffsetTimeline';
import { itemAudioSrc } from './Waveform';
import { useRegieSelection } from './regieSelection';
import { formatSceneTime, parseSceneTime } from './ScenesSection';
import { ScenesView } from './ScenesView';
import { SoundView } from './SoundView';
import { OscView } from './OscView';
import { openPerformance } from '../../pages/PerformancePage';
import { TextsView } from './TextsView';
import { MediaSection, PlayerBar, seekAudio, TimecodePanel, usePlaybackState } from './SongMedia';
import { Transport, usePointPlayback } from '../../lib/transport';
import { lyricsUrl, openLyricsWindow } from './LyricsWindow';
import { LyricsSettings } from './LyricsSettings';
import { BackgroundEditor } from './BackgroundEditor';
import { RegieTransferButtons } from './RegieTransfer';

const t = texts.regie;

export const KIND_ICONS: Record<ShowItemKind, LucideIcon> = { song: Music, play: Drama, break: Coffee, announcement: Megaphone };
const KINDS: ShowItemKind[] = ['song', 'play', 'break', 'announcement'];

/** Regie: oben Umschalter Ablauf | Lichtaufbau */
export function RegieView(
  props: { projectId: string; doc: Y.Doc; origin: object; data: ProjectData; library: Library | null; editable: boolean } & {
    sync: SyncClientState;
    sendCue: (cue: Cue | null) => void;
    onRemote: (listener: (command: RemoteCommand) => void) => () => void;
    canLead: boolean;
  },
) {
  const [area, setArea] = useState<Area>(readArea);
  const choose = (next: Area) => {
    setArea(next);
    try {
      localStorage.setItem(AREA_KEY, next);
    } catch {
      // ohne Speicher gilt die Wahl bis zum Neuladen
    }
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900">
        {/* auf schmalen Bildschirmen seitlich scrollbar */}
        <div className="flex min-w-0 overflow-x-auto rounded-md border border-slate-300 text-sm dark:border-slate-600" role="radiogroup" aria-label={texts.light.viewsLabel}>
          {AREAS.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={area === a} onClick={() => choose(a)} className={`shrink-0 px-3 py-1 whitespace-nowrap ${area === a ? 'bg-sky-600 text-white' : ''}`}>
              {texts.light.views[a]}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <RegieTransferButtons doc={props.doc} origin={props.origin} editable={props.editable} />
        <LyricsButtons projectId={props.projectId} doc={props.doc} origin={props.origin} settings={props.data.showSettings} media={props.data.media} editable={props.editable} />
        <Button variant="secondary" className="shrink-0 text-sm" title={t.performance.openTitle} aria-label={t.performance.open} onClick={() => openPerformance(props.projectId)} disabled={props.data.show.items.length === 0}>
          <Clapperboard {...ICON} /> <span className="hidden sm:inline">{t.performance.open}</span>
        </Button>
      </div>
      {area === 'texts' ? (
        <TextsView projectId={props.projectId} doc={props.doc} origin={props.origin} data={props.data} editable={props.editable} />
      ) : area === 'scenes' ? (
        <ScenesView projectId={props.projectId} doc={props.doc} origin={props.origin} data={props.data} library={props.library} editable={props.editable} />
      ) : area === 'sound' ? (
        <SoundView projectId={props.projectId} doc={props.doc} origin={props.origin} data={props.data} editable={props.editable} />
      ) : area === 'osc' ? (
        <OscView projectId={props.projectId} doc={props.doc} origin={props.origin} data={props.data} editable={props.editable} />
      ) : area === 'light' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <LightSetupView doc={props.doc} origin={props.origin} data={props.data} library={props.library} editable={props.editable} />
        </div>
      ) : (
        <ShowView {...props} />
      )}
    </div>
  );
}

type Area = 'show' | 'texts' | 'scenes' | 'sound' | 'osc' | 'light';
const AREAS: Area[] = ['show', 'texts', 'scenes', 'sound', 'osc', 'light'];
const AREA_KEY = 'steckplan.regieArea';
function readArea(): Area {
  try {
    const saved = localStorage.getItem(AREA_KEY);
    return AREAS.find((a) => a === saved) ?? 'show';
  } catch {
    return 'show';
  }
}

function ShowView({ projectId, doc, origin, data, editable }: { projectId: string; doc: Y.Doc; origin: object; data: ProjectData; library: Library | null; editable: boolean }) {
  const narrow = useIsNarrow(900);
  const { items, sections } = data.show;
  const [selectedId, setSelectedId] = useRegieSelection(projectId);
  const selected = items.find((i) => i.id === selectedId) ?? (narrow ? undefined : items[0]);
  const schedule = showSchedule(items, data.showSettings);
  const numbers = itemNumbers(items);
  const [dragId, setDragId] = useState<string | null>(null);

  const add = (kind: ShowItemKind) => {
    const id = addShowItem(doc, kind, origin, kind === 'break' ? { title: t.kinds.break } : {});
    setSelectedId(id);
  };

  const list = (
    <section className="flex min-h-0 flex-col" aria-label={t.title} data-testid="regie-list">
      <div className="space-y-2 border-b border-slate-200 p-3 dark:border-slate-700">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex items-center gap-2 text-sm">
            {t.startTime}
            <input
              type="time"
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
              value={data.showSettings.startTime ?? ''}
              disabled={!editable}
              onChange={(e) => updateShowSettings(doc, { startTime: e.target.value || undefined }, origin)}
            />
          </label>
          {editable && items.length > 0 && (
            <Button
              variant="ghost"
              className="min-h-8 px-2 text-xs"
              title={t.renumberTitle}
              onClick={() => {
                if (window.confirm(t.renumberConfirm)) renumberShowItems(doc, origin);
              }}
            >
              <ListOrdered {...ICON} /> {t.renumber}
            </Button>
          )}
          <span className="ml-auto text-xs text-slate-500" data-testid="regie-total">
            {t.total(formatDuration(schedule.totalSec), schedule.missingDurations)}
          </span>
        </div>
        {editable && (
          <div className="flex flex-wrap gap-1">
            {KINDS.map((kind) => {
              const Icon = KIND_ICONS[kind];
              return (
                <Button key={kind} variant="secondary" className="min-h-8 px-2 py-1 text-xs" onClick={() => add(kind)}>
                  <Icon {...ICON} /> {t.add(t.kinds[kind])}
                </Button>
              );
            })}
          </div>
        )}
      </div>
      {items.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">{t.empty}</p>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto">
          {items.map((item, index) => {
            const Icon = KIND_ICONS[item.kind];
            const entry = schedule.entries.get(item.id);
            const isSelected = selected?.id === item.id;
            const drop = (e: DragEvent) => {
              e.preventDefault();
              if (dragId && dragId !== item.id) moveShowItem(doc, dragId, index, origin);
              setDragId(null);
            };
            return (
              <li
                key={item.id}
                draggable={editable && !narrow}
                onDragStart={() => setDragId(item.id)}
                onDragOver={(e) => editable && dragId && e.preventDefault()}
                onDrop={drop}
                onDragEnd={() => setDragId(null)}
                className={`border-b border-slate-100 dark:border-slate-800 ${dragId === item.id ? 'opacity-40' : ''}`}
              >
                <button
                  type="button"
                  aria-current={isSelected ? 'true' : undefined}
                  onClick={() => setSelectedId(item.id)}
                  data-testid="regie-item"
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${isSelected ? 'bg-sky-50 dark:bg-sky-950' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                >
                  {editable && !narrow && <GripVertical size={14} className="shrink-0 cursor-grab text-slate-300" aria-label={t.dragHint} />}
                  <ItemNumber number={numbers.get(item.id)} />
                  <span className="w-11 shrink-0 tabular-nums text-xs text-slate-500">{entry?.clock ?? `+${formatDuration(entry?.offsetSec ?? 0)}`}</span>
                  <Icon size={16} className="shrink-0 text-slate-500" aria-label={t.kinds[item.kind]} />
                  <span className={`min-w-0 flex-1 truncate ${item.kind === 'break' ? 'italic text-slate-600 dark:text-slate-300' : 'font-medium'}`}>{item.title || t.untitled}</span>
                  <ItemColors item={item} />
                  <span className="shrink-0 tabular-nums text-xs text-slate-500">{item.durationSec !== undefined ? formatDuration(item.durationSec) : '–'}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );

  const detail = selected ? (
    <ItemDetail
      key={selected.id}
      projectId={projectId}
      data={data}
      media={data.media}
      number={numbers.get(selected.id) ?? 1}
      numbers={numbers}
      doc={doc}
      origin={origin}
      item={selected}
      index={items.findIndex((i) => i.id === selected.id)}
      count={items.length}
      sections={itemSections(sections, selected.id)}
      people={data.people}
      editable={editable}
      onBack={narrow ? () => setSelectedId(null) : undefined}
      onSelect={setSelectedId}
    />
  ) : (
    <p className="p-6 text-sm text-slate-500">{items.length ? t.nothingSelected : ''}</p>
  );

  if (narrow) return <div className="min-h-0 flex-1 overflow-y-auto bg-white dark:bg-slate-900" data-testid="regie">{selected ? detail : list}</div>;
  return (
    <div className="flex min-h-0 flex-1" data-testid="regie">
      <div className="flex w-96 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">{list}</div>
      <div className="min-w-0 flex-1 overflow-y-auto">{detail}</div>
    </div>
  );
}

function ItemDetail({
  projectId,
  data,
  media,
  number,
  numbers,
  doc,
  origin,
  item,
  index,
  count,
  sections,
  people,
  editable,
  onBack,
  onSelect,
}: {
  projectId: string;
  data: ProjectData;
  media: MediaRef[];
  number: number;
  numbers: Map<string, number>;
  doc: Y.Doc;
  origin: object;
  item: ShowItem;
  index: number;
  count: number;
  sections: ReturnType<typeof itemSections>;
  people: Person[];
  editable: boolean;
  onBack: (() => void) | undefined;
  onSelect: (id: string | null) => void;
}) {
  const Icon = KIND_ICONS[item.kind];
  const set = (patch: Partial<Omit<ShowItem, 'id'>>) => updateShowItem(doc, item.id, patch, origin);
  // Player zum Anhören (Text und Mitschreiben im Bereich „Texte“)
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const { tc, music, sync } = usePointPlayback(item.id, item.durationSec, audio, item.audioOffsetSec, itemTempo(item).rate);
  // Länge der Datei kommt mit den Metadaten (neu zeichnen)
  usePlaybackState(music);
  const lines = itemTimedLines(sections, item);
  const settingsMode = data.showSettings.lyricsMode ?? 'lines';
  return (
    <article className="mx-auto max-w-3xl space-y-4 p-4" aria-label={item.title || t.untitled} data-testid="regie-detail">
      <header className="flex flex-wrap items-center gap-2">
        {onBack && (
          <Button variant="ghost" aria-label={t.back} onClick={onBack}>
            <ChevronLeft {...ICON} />
          </Button>
        )}
        <Icon size={20} className="text-slate-500" aria-hidden />
        <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{t.kinds[item.kind]}</span>
        <div className="flex-1" />
        {editable && (
          <>
            <Button variant="ghost" aria-label={t.up} title={t.up} disabled={index <= 0} onClick={() => moveShowItem(doc, item.id, index - 1, origin)}>
              <ArrowUp {...ICON} />
            </Button>
            <Button variant="ghost" aria-label={t.down} title={t.down} disabled={index >= count - 1} onClick={() => moveShowItem(doc, item.id, index + 1, origin)}>
              <ArrowDown {...ICON} />
            </Button>
            <Button variant="ghost" aria-label={t.duplicate} title={t.duplicate} onClick={() => onSelect(duplicateShowItem(doc, item.id, origin) ?? null)}>
              <Copy {...ICON} />
            </Button>
            <Button
              variant="ghost"
              aria-label={t.remove}
              title={t.remove}
              onClick={() => {
                if (!window.confirm(t.removeConfirm(item.title || t.untitled))) return;
                removeShowItem(doc, item.id, origin);
                onSelect(null);
              }}
            >
              <Trash2 {...ICON} />
            </Button>
          </>
        )}
      </header>

      {/* Grunddaten: Titel, Nummer, Dauer – darunter Interpret */}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_6rem_7rem]">
        <Field label={t.fields.title}>
          <TextInput value={item.title} disabled={!editable} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <NumberField number={number} taken={[...numbers].some(([id, n]) => id !== item.id && n === number)} editable={editable} onChange={(n) => set({ number: n })} />
        <DurationField value={item.durationSec} editable={editable} onChange={(durationSec) => set({ durationSec })} />
        {item.kind === 'song' && (
          <div className="sm:col-span-3">
            <Field label={t.fields.artist}>
              <TextInput value={item.artist ?? ''} disabled={!editable} onChange={(e) => set({ artist: e.target.value || undefined })} />
            </Field>
          </div>
        )}
      </div>

      {/* Musik: Tempo und Audio-Versatz nebeneinander */}
      {(item.kind === 'song' || (item.media?.length ?? 0) > 0) && (
        <fieldset className="grid gap-4 rounded-lg border border-slate-200 p-3 sm:grid-cols-2 dark:border-slate-700" data-testid="regie-music">
          <legend className="px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{t.fields.music}</legend>
          {item.kind === 'song' && <TempoField key={`${item.id}:${item.bpm ?? ''}`} bpm={item.bpm} manualBpm={item.manualBpm} signature={item.timeSignature} editable={editable} onChange={(patch) => set(patch)} />}
          {(item.media?.length ?? 0) > 0 && (
            <div>
              <OffsetField key={`${item.id}:${item.audioOffsetSec ?? 0}`} value={item.audioOffsetSec} editable={editable} onChange={(audioOffsetSec) => set({ audioOffsetSec })} />
              <label className="mt-1 flex items-center gap-2 text-xs" title={t.fields.audioOffsetTextHint}>
                <input type="checkbox" checked={item.audioOffsetText === true} disabled={!editable} onChange={(e) => set({ audioOffsetText: e.target.checked || undefined })} />
                {t.fields.audioOffsetText}
              </label>
            </div>
          )}
          {(item.media?.length ?? 0) > 0 && (
            <OffsetTimeline
              offset={item.audioOffsetSec ?? 0}
              audioLength={music instanceof Transport ? music.audioLength : 0}
              duration={item.durationSec}
              source={music}
              src={itemAudioSrc(projectId, item)}
              editable={editable}
              onChange={(sec) => set({ audioOffsetSec: sec === 0 ? undefined : sec })}
              onSeek={(sec) => seekAudio(music, sec)}
            />
          )}
        </fieldset>
      )}

      {/* Textfenster: Text dieses Punkts zeigen, am Ende ausblenden */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm" data-testid="lyrics-options">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={item.lyricsVisible !== false} disabled={!editable} onChange={(e) => set({ lyricsVisible: e.target.checked ? undefined : false })} />
          {t.lyricsVisible}
        </label>
        {item.lyricsVisible !== false && (
          <label className="flex items-center gap-2" title={t.lyricsHideAtEndHint}>
            <input type="checkbox" checked={item.lyricsHideAtEnd !== false} disabled={!editable} onChange={(e) => set({ lyricsHideAtEnd: e.target.checked ? undefined : false })} />
            {t.lyricsHideAtEnd}
          </label>
        )}
        {item.lyricsVisible !== false && (
          <label className="flex items-center gap-2" title={t.lyricsModeHint}>
            {t.lyricsMode}
            <select
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
              value={item.lyricsMode ?? ''}
              disabled={!editable}
              onChange={(e) => set({ lyricsMode: (e.target.value || undefined) as ShowItem['lyricsMode'] })}
              data-testid="item-lyrics-mode"
            >
              <option value="">{t.lyricsModeDefault(texts.regie.lyricsPage.modes[settingsMode])}</option>
              <option value="lines">{texts.regie.lyricsPage.modes.lines}</option>
              <option value="block">{texts.regie.lyricsPage.modes.block}</option>
            </select>
          </label>
        )}
      </div>

      {/* eigener Hintergrund im Textfenster (Bilder/Videos) – nur aufgeklappt geladen */}
      {item.lyricsVisible !== false && (
        <LazyCollapsible label={t.itemBackground} preview={itemBackgroundPreview(item, data.media)} testId="regie-item-background">
          <p className="mb-2 text-xs text-slate-500">{t.itemBackgroundHint}</p>
          <BackgroundEditor projectId={projectId} doc={doc} origin={origin} background={item.lyricsBackground} media={data.media} itemId={item.id} editable={editable} />
        </LazyCollapsible>
      )}

      {/* eingeklappt; die Zeile zeigt, was eingetragen ist */}
      <Collapsible
        label={t.fields.people}
        preview={
          item.personIds
            .map((id) => people.find((p) => p.id === id))
            .filter((p): p is Person => !!p)
            .map((p) => personName(p))
            .join(', ') || t.none
        }
        testId="regie-people"
      >
        <PeoplePicker people={people} selected={item.personIds} editable={editable} onChange={(personIds) => set({ personIds })} />
      </Collapsible>

      <Collapsible label={t.fields.notes} preview={item.notes?.split('\n')[0] || t.none} testId="regie-notes">
        <TextArea aria-label={t.fields.notes} value={item.notes ?? ''} disabled={!editable} onChange={(e) => set({ notes: e.target.value || undefined })} />
      </Collapsible>

      {(item.kind === 'song' || item.kind === 'play') && <MediaSection projectId={projectId} doc={doc} origin={origin} item={item} media={media} editable={editable} />}

      {(
        <PlayerBar
          record={editable ? { doc, origin } : undefined}
          settings={data.showSettings}
          aside={<TimecodePanel tc={tc} sync={sync} />}
          markers={itemScenes(data.lightScenes, item.id).flatMap((s, i) => {
            const at = sceneTime(s, lines.map((l) => l.line));
            return at === undefined ? [] : [{ id: s.id, at, label: `${i + 1} ${s.name}` }];
          })}
          projectId={projectId}
          item={item}
          media={media}
          playback={music}
          setAudio={setAudio}
          recording={false}
          onNextLine={() => undefined}
          nextLineText={undefined}
          onClearTimes={() => undefined}
        />
      )}
    </article>
  );
}

/** Versatz als Text: „4“, „1:02.5“, negativ „-0:12“ */
export function formatOffset(sec: number): string {
  return `${sec < 0 ? '-' : ''}${formatSceneTime(Math.abs(sec)).replace('.', ',')}`;
}

/** Versatz aus dem Text (Sekunden oder m:ss, auch mit Minus) */
export function parseOffset(text: string): number | undefined {
  const v = text.trim().replace('−', '-');
  const negative = v.startsWith('-');
  const sec = parseSceneTime((negative ? v.slice(1) : v).replace(',', '.'));
  return sec === undefined ? undefined : negative ? -sec : sec;
}

/** Versatz des Audios (Sekunden oder m:ss): positiv setzt die Musik später ein, negativ beginnt der Punkt mitten in der Datei */
function OffsetField({ value, editable, onChange }: { value: number | undefined; editable: boolean; onChange: (sec: number | undefined) => void }) {
  const [draft, setDraft] = useState(value ? formatOffset(value) : '0');
  const parsed = parseOffset(draft);
  const invalid = draft.trim() !== '' && parsed === undefined;
  return (
    <Field label={t.fields.audioOffset} hint={t.fields.audioOffsetHint}>
      <TextInput
        value={draft}
        inputMode="decimal"
        disabled={!editable}
        aria-invalid={invalid}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => !invalid && onChange(parsed ? Math.round(parsed * 10) / 10 : undefined)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
    </Field>
  );
}

/** Nummer des Ablaufpunkts (Stunde im Timecode) */
/** Farbpunkte eines Lieds (Grund- und Sekundärfarbe), z. B. in Listen */
export function ItemColors({ item, size = 'sm' }: { item: Pick<ShowItem, 'primaryColor' | 'secondaryColor'>; size?: 'sm' | 'lg' }) {
  if (!item.primaryColor && !item.secondaryColor) return null;
  const dot = size === 'lg' ? 'h-4 w-4' : 'h-3 w-3';
  return (
    <span className="flex shrink-0 items-center gap-0.5" title={t.fields.colors} data-testid="item-colors">
      {[item.primaryColor, item.secondaryColor].map((c, i) =>
        c ? <span key={i} className={`${dot} rounded-full border border-black/20 dark:border-white/30`} style={{ background: c }} data-testid={i === 0 ? 'item-primary-color' : 'item-secondary-color'} /> : null,
      )}
    </span>
  );
}

/** Grundfarbe und Sekundärfarbe eines Lieds (je mit „entfernen“) */
export function ColorFields({ primary, secondary, editable, onChange }: { primary: string | undefined; secondary: string | undefined; editable: boolean; onChange: (patch: { primaryColor?: string; secondaryColor?: string }) => void }) {
  const field = (key: 'primaryColor' | 'secondaryColor', label: string, value: string | undefined, fallback: string) => (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="color"
          aria-label={label}
          className={`h-9 w-12 cursor-pointer rounded border border-slate-300 bg-transparent p-0.5 dark:border-slate-600 ${value ? '' : 'opacity-40'}`}
          value={value ?? fallback}
          disabled={!editable}
          onChange={(e) => onChange({ [key]: e.target.value })}
        />
        {label}
      </label>
      {value && editable && (
        <Button variant="ghost" className="min-h-7 px-1.5 text-xs" aria-label={`${label} ${t.fields.colorRemove}`} title={t.fields.colorRemove} onClick={() => onChange({ [key]: undefined })}>
          <X size={14} aria-hidden />
        </Button>
      )}
      {!value && <span className="text-xs text-slate-500">{t.fields.colorNone}</span>}
    </div>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2" data-testid="color-fields">
      {field('primaryColor', t.fields.primaryColor, primary, '#0ea5e9')}
      {field('secondaryColor', t.fields.secondaryColor, secondary, '#f59e0b')}
    </div>
  );
}

export function ItemNumber({ number }: { number: number | undefined }) {
  return (
    <span className="w-7 shrink-0 rounded bg-slate-800 px-1 text-center font-mono text-xs font-semibold text-emerald-400 tabular-nums dark:bg-black" title={number !== undefined ? t.numberTitle(number) : undefined} data-testid="item-number">
      {number ?? ''}
    </span>
  );
}

function NumberField({ number, taken, editable, onChange }: { number: number; taken: boolean; editable: boolean; onChange: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const value = Number(draft);
  const invalid = draft !== null && !(Number.isInteger(value) && value >= 1 && value <= 999);
  return (
    <Field label={t.fields.number} hint={taken ? t.numberTaken : t.fields.numberHint}>
      <TextInput
        value={draft ?? String(number)}
        inputMode="numeric"
        disabled={!editable}
        aria-invalid={invalid || taken}
        onFocus={() => setDraft(String(number))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null && !invalid && value !== number) onChange(value);
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
    </Field>
  );
}

/** Tempo (BPM, auch per Tap) und Taktart eines Lieds */
function TempoField({ bpm, manualBpm, signature, editable, onChange }: { bpm: number | undefined; manualBpm: number | undefined; signature: string | undefined; editable: boolean; onChange: (patch: { bpm?: number; timeSignature?: string; beatOffsetSec?: number; manualBpm?: number; manualBeatOffsetSec?: number }) => void }) {
  const [draft, setDraft] = useState(bpm !== undefined ? String(bpm).replace('.', ',') : '');
  const value = draft.trim() === '' ? undefined : Number(draft.replace(',', '.'));
  const invalid = value !== undefined && (!Number.isFinite(value) || value < BPM_MIN || value > BPM_MAX);
  const [taps, setTaps] = useState<Tap[]>([]);
  const beats = parseTimeSignature(signature).beats;
  useEffect(() => {
    if (!taps.length) return;
    const timer = window.setTimeout(() => setTaps([]), TAP_RESET_SEC * 1000);
    return () => window.clearTimeout(timer);
  }, [taps]);
  const progress = taps.length ? tapProgress(taps, beats) : null;
  return (
    <div className="space-y-1.5" data-testid="tempo-field">
      <div className="flex flex-wrap items-end gap-2 [&>*:first-child]:w-24">
        <Field label={t.fields.bpm}>
          <TextInput
            value={draft}
            inputMode="decimal"
            placeholder="120"
            aria-invalid={invalid}
            disabled={!editable}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              // neues Tempo von Hand: Lage der „1“ gilt nicht mehr
              if (!invalid && value !== bpm) onChange({ bpm: value === undefined ? undefined : Math.round(value * 10) / 10, beatOffsetSec: undefined, ...(value !== undefined && !signature ? { timeSignature: DEFAULT_TIME_SIGNATURE } : {}) });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
          />
        </Field>
        <Field label={t.fields.timeSignature}>
          <select
            aria-label={t.fields.timeSignature}
            className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            value={signature ?? DEFAULT_TIME_SIGNATURE}
            disabled={!editable}
            onChange={(e) => onChange({ timeSignature: e.target.value })}
          >
            {TIME_SIGNATURES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        {editable && (
          <Button
            variant="secondary"
            className="min-h-10 text-xs"
            title={t.fields.tapHint}
            onClick={() => {
              const next = addTap(taps, { wall: tapClock() });
              setTaps(next);
              const result = tapTempo(next, beats);
              if (result) onChange({ bpm: result.bpm, beatOffsetSec: undefined, ...(signature ? {} : { timeSignature: DEFAULT_TIME_SIGNATURE }) });
            }}
          >
            {progress ? t.fields.tapProgress(progress.count, progress.remaining) : t.fields.tap}
          </Button>
        )}
      </div>
      {/* in der Vorstellung getappt: hat Vorrang, das gespeicherte bleibt */}
      {manualBpm !== undefined && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-amber-700 dark:text-amber-400" data-testid="tempo-manual">
          {t.fields.manualBpm(String(Math.round(manualBpm * 10) / 10).replace('.', ','))}
          {editable && (
            <button type="button" className="underline hover:no-underline" onClick={() => onChange({ manualBpm: undefined, manualBeatOffsetSec: undefined })}>
              {t.fields.manualReset}
            </button>
          )}
        </p>
      )}
    </div>
  );
}

/** Zeitpunkt eines Taps (Sekunden, monoton) */
function tapClock(): number {
  return performance.now() / 1000;
}

function DurationField({ value, editable, onChange }: { value: number | undefined; editable: boolean; onChange: (sec: number | undefined) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value !== undefined ? formatDuration(value) : '');
  const invalid = draft !== null && draft.trim() !== '' && parseDuration(draft) === undefined;
  return (
    <Field label={t.fields.duration}>
      <TextInput
        value={shown}
        placeholder={t.fields.durationHint}
        inputMode="numeric"
        disabled={!editable}
        aria-invalid={invalid}
        onFocus={() => setDraft(shown)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null && !invalid) onChange(parseDuration(draft));
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
    </Field>
  );
}

/** Aufklappbarer Abschnitt (startet geschlossen); zu sehen sind Bezeichnung und eine kurze Vorschau */
/** Wie Collapsible, der Inhalt entsteht aber erst beim Aufklappen (z. B. mit Dateiauswahl und Vorschau-Videos) */
function LazyCollapsible({ label, preview, testId, children }: { label: string; preview: string; testId: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="group rounded-md border border-slate-200 dark:border-slate-700" data-testid={testId} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm select-none [&::-webkit-details-marker]:hidden">
        <ChevronRight size={16} className="shrink-0 text-slate-400 transition-transform group-open:rotate-90" aria-hidden />
        <span className="shrink-0 font-medium text-slate-700 dark:text-slate-200">{label}</span>
        <span className="min-w-0 truncate text-slate-500 group-open:hidden">{preview}</span>
      </summary>
      {open && <div className="border-t border-slate-200 px-3 py-3 dark:border-slate-700">{children}</div>}
    </details>
  );
}

/** Kurzbeschreibung des eigenen Hintergrunds eines Eintrags */
function itemBackgroundPreview(item: ShowItem, media: MediaRef[]): string {
  const ids = lyricsImages(item.lyricsBackground);
  if (ids.length === 0) return texts.regie.itemBackgroundStandard;
  const videos = ids.filter((id) => isVideoMedia(media.find((m) => m.id === id))).length;
  return texts.regie.itemBackgroundSummary(ids.length - videos, videos, item.lyricsBackground?.loop !== false);
}

function Collapsible({ label, preview, testId, children }: { label: string; preview: string; testId: string; children: ReactNode }) {
  return (
    <details className="group rounded-md border border-slate-200 dark:border-slate-700" data-testid={testId}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm select-none [&::-webkit-details-marker]:hidden">
        <ChevronRight size={16} className="shrink-0 text-slate-400 transition-transform group-open:rotate-90" aria-hidden />
        <span className="shrink-0 font-medium text-slate-700 dark:text-slate-200">{label}</span>
        <span className="min-w-0 truncate text-slate-500 group-open:hidden">{preview}</span>
      </summary>
      <div className="border-t border-slate-200 px-3 py-2 dark:border-slate-700">{children}</div>
    </details>
  );
}

function PeoplePicker({ people, selected, editable, onChange }: { people: Person[]; selected: string[]; editable: boolean; onChange: (ids: string[]) => void }) {
  return (
    <div className="space-y-1">
      {people.length === 0 ? (
        <p className="text-xs text-slate-500">{t.noPeople}</p>
      ) : (
        <div className="flex flex-wrap gap-1" role="group" aria-label={t.fields.people}>
          {people.map((p) => {
            const on = selected.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={!editable}
                onClick={() => onChange(on ? selected.filter((id) => id !== p.id) : [...selected, p.id])}
                className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-sky-500 bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-100' : 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'}`}
              >
                {personName(p)}
                {p.kind ? <span className="opacity-60"> · {p.kind}</span> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}


/** Textfenster öffnen bzw. den Link dazu kopieren (für andere Geräte) */
function LyricsButtons({ projectId, doc, origin, settings, media, editable }: { projectId: string; doc: Y.Doc; origin: object; settings: ShowSettings; media: MediaRef[]; editable: boolean }) {
  const [copied, setCopied] = useState(false);
  const [setup, setSetup] = useState(false);
  return (
    <span className="flex shrink-0">
      <Button variant="secondary" className="rounded-r-none text-sm" title={t.lyricsPage.openTitle} aria-label={t.lyricsPage.open} onClick={() => openLyricsWindow(projectId)}>
        <Monitor {...ICON} /> <span className="hidden sm:inline">{t.lyricsPage.open}</span>
      </Button>
      <Button
        variant="secondary"
        className={`-ml-px px-2 text-sm ${editable ? 'rounded-none' : 'rounded-l-none'}`}
        title={copied ? t.lyricsPage.copied : `${t.lyricsPage.copyLink}: ${lyricsUrl(projectId)}`}
        aria-label={t.lyricsPage.copyLink}
        onClick={() => {
          void navigator.clipboard?.writeText(lyricsUrl(projectId)).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        <Link2 {...ICON} />
        {copied && <span className="text-xs">{t.lyricsPage.copied}</span>}
      </Button>
      {editable && (
        <Button variant="secondary" className="-ml-px rounded-l-none px-2 text-sm" title={t.lyricsPage.settings} aria-label={t.lyricsPage.settings} onClick={() => setSetup(true)}>
          <Settings2 {...ICON} />
        </Button>
      )}
      {setup && <LyricsSettings projectId={projectId} doc={doc} origin={origin} settings={settings} media={media} onClose={() => setSetup(false)} />}
    </span>
  );
}
