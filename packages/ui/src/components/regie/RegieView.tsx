// Regie (M11a): Ablauf links, gewählter Eintrag rechts (Angaben, Rollen, Texte).
// Auf dem Handy erst der Ablauf, Antippen öffnet den Eintrag.
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Clapperboard, ClipboardPaste, Coffee, Copy, Drama, GripVertical, Megaphone, Music, Trash2, type LucideIcon } from 'lucide-react';
import { useCallback, useState, type DragEvent, type ReactNode } from 'react';
import type * as Y from 'yjs';
import {
  addShowItem,
  appendPastedText,
  clearLineTimes,
  itemLines,
  itemScenes,
  sceneTime,
  nextUntimedLine,
  setLineTime,
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
  duplicateShowItem,
  showSchedule,
  updateShowItem,
  updateShowSettings,
  type Person,
  type ShowItem,
  type ShowItemKind,
} from '@steckplan/core';
import { useIsNarrow } from '../../lib/useProjectDoc';
import type { ProjectData } from '../../lib/useProjectData';
import { texts } from '../../texts';
import { ICON } from '../icons';
import { Button, Field, Modal, TextArea, TextInput } from '../ui';
import { SectionsEditor } from './SectionsEditor';
import { LightSetupView } from './LightSetupView';
import { ScenesSection } from './ScenesSection';
import { PerformanceView } from './PerformanceView';
import { LyricsView, MediaSection, PlayerBar, seekAudio, usePlayerTime, useRecordKey } from './SongMedia';

const t = texts.regie;

export const KIND_ICONS: Record<ShowItemKind, LucideIcon> = { song: Music, play: Drama, break: Coffee, announcement: Megaphone };
const KINDS: ShowItemKind[] = ['song', 'play', 'break', 'announcement'];

/** Regie: oben Umschalter Ablauf | Lichtaufbau */
export function RegieView(
  props: { projectId: string; doc: Y.Doc; origin: object; data: ProjectData; library: Library | null; editable: boolean } & {
    sync: SyncClientState;
    sendCue: (cue: Cue | null) => void;
    canLead: boolean;
  },
) {
  const [area, setArea] = useState<'show' | 'light'>(readArea);
  const [performing, setPerforming] = useState(false);
  const choose = (next: 'show' | 'light') => {
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
        <div className="flex overflow-hidden rounded-md border border-slate-300 text-sm dark:border-slate-600" role="radiogroup" aria-label={texts.light.viewsLabel}>
          {(['show', 'light'] as const).map((a) => (
            <button key={a} type="button" role="radio" aria-checked={area === a} onClick={() => choose(a)} className={`px-3 py-1 ${area === a ? 'bg-sky-600 text-white' : ''}`}>
              {texts.light.views[a]}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <Button variant="secondary" className="text-sm" title={t.performance.openTitle} onClick={() => setPerforming(true)} disabled={props.data.show.items.length === 0}>
          <Clapperboard {...ICON} /> {t.performance.open}
        </Button>
      </div>
      {performing && (
        <PerformanceView projectId={props.projectId} data={props.data} library={props.library} sync={props.sync} sendCue={props.sendCue} canLead={props.canLead} onClose={() => setPerforming(false)} />
      )}
      {area === 'light' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <LightSetupView doc={props.doc} origin={props.origin} data={props.data} library={props.library} editable={props.editable} />
        </div>
      ) : (
        <ShowView {...props} />
      )}
    </div>
  );
}

const AREA_KEY = 'steckplan.regieArea';
function readArea(): 'show' | 'light' {
  try {
    return localStorage.getItem(AREA_KEY) === 'light' ? 'light' : 'show';
  } catch {
    return 'show';
  }
}

function ShowView({ projectId, doc, origin, data, library, editable }: { projectId: string; doc: Y.Doc; origin: object; data: ProjectData; library: Library | null; editable: boolean }) {
  const narrow = useIsNarrow(900);
  const { items, sections } = data.show;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find((i) => i.id === selectedId) ?? (narrow ? undefined : items[0]);
  const schedule = showSchedule(items, data.showSettings);
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
                  <span className="w-11 shrink-0 tabular-nums text-xs text-slate-500">{entry?.clock ?? `+${formatDuration(entry?.offsetSec ?? 0)}`}</span>
                  <Icon size={16} className="shrink-0 text-slate-500" aria-label={t.kinds[item.kind]} />
                  <span className={`min-w-0 flex-1 truncate ${item.kind === 'break' ? 'italic text-slate-600 dark:text-slate-300' : 'font-medium'}`}>{item.title || t.untitled}</span>
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
      library={library}
      media={data.media}
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
  library,
  media,
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
  library: Library | null;
  media: MediaRef[];
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
  const [pasting, setPasting] = useState(false);
  const hasText = item.kind === 'song' || item.kind === 'play' || item.kind === 'announcement';
  // Player und Textansicht (nur Lieder mit Audio)
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const time = usePlayerTime(audio);
  const hasAudio = item.kind === 'song' && (item.media?.length ?? 0) > 0;
  const [textMode, setTextMode] = useState<'edit' | 'read' | 'record'>('edit');
  const mode = hasAudio ? textMode : 'edit';
  const lines = itemLines(sections, item.id);
  const next = nextUntimedLine(lines);
  const recordNext = useCallback(() => {
    if (next && editable) setLineTime(doc, next.sectionId, next.line.id, audio?.currentTime ?? 0, origin);
  }, [next, editable, doc, origin, audio]);
  useRecordKey(mode === 'record' && editable, recordNext);
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

      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <Field label={t.fields.title}>
          <TextInput value={item.title} disabled={!editable} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <DurationField value={item.durationSec} editable={editable} onChange={(durationSec) => set({ durationSec })} />
        {item.kind === 'song' && (
          <div className="sm:col-span-2">
            <Field label={t.fields.artist}>
              <TextInput value={item.artist ?? ''} disabled={!editable} onChange={(e) => set({ artist: e.target.value || undefined })} />
            </Field>
          </div>
        )}
      </div>

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

      {item.kind === 'song' && <MediaSection projectId={projectId} doc={doc} origin={origin} item={item} media={media} editable={editable} />}

      {item.kind === 'play' && <RolesEditor item={item} sections={sections} people={people} editable={editable} onChange={(roles) => set({ roles })} />}

      {hasText && (
        <section className="space-y-2" aria-label={t.text}>
          <div className="flex flex-wrap items-center gap-2 *:whitespace-nowrap">
            <h3 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{t.text}</h3>
            {hasAudio && (
              <div className="flex shrink-0 overflow-hidden rounded-md border border-slate-300 text-xs dark:border-slate-600" role="radiogroup" aria-label={t.textModeLabel}>
                {(['edit', 'read', 'record'] as const)
                  .filter((m) => m !== 'record' || editable)
                  .map((m) => (
                    <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setTextMode(m)} className={`px-2 py-1 ${mode === m ? 'bg-sky-600 text-white' : ''}`}>
                      {t.textModes[m]}
                    </button>
                  ))}
              </div>
            )}
            <div className="flex-1" />
            {editable && mode === 'edit' && (
              <Button variant="ghost" className="text-xs" onClick={() => setPasting(true)}>
                <ClipboardPaste {...ICON} /> {t.paste}
              </Button>
            )}
          </div>
          {mode === 'record' && <p className="text-xs text-slate-500">{t.recordHint}</p>}
          {mode === 'edit' ? (
            <SectionsEditor doc={doc} origin={origin} item={item} sections={sections} editable={editable} />
          ) : (
            <LyricsView
              doc={doc}
              origin={origin}
              lines={lines}
              time={time}
              recording={mode === 'record'}
              editable={editable}
              onSeek={(sec) => seekAudio(audio, sec)}
            />
          )}
        </section>
      )}

      {(item.kind === 'song' || item.kind === 'play') && (
        <ScenesSection doc={doc} origin={origin} item={item} data={data} library={library} lines={lines} time={time} audio={hasAudio ? audio : null} editable={editable} />
      )}

      {hasAudio && (
        <PlayerBar
          markers={itemScenes(data.lightScenes, item.id).flatMap((s, i) => {
            const at = sceneTime(s, lines.map((l) => l.line));
            return at === undefined ? [] : [{ id: s.id, at, label: `${i + 1} ${s.name}` }];
          })}
          projectId={projectId}
          item={item}
          media={media}
          audio={audio}
          setAudio={setAudio}
          time={time}
          recording={mode === 'record' && editable}
          onNextLine={recordNext}
          nextLineText={next?.line.text}
          onClearTimes={() => {
            if (window.confirm(t.clearTimesConfirm)) clearLineTimes(doc, item.id, origin);
          }}
        />
      )}

      {pasting && (
        <PasteDialog
          play={item.kind === 'play'}
          onCancel={() => setPasting(false)}
          onApply={(text) => {
            appendPastedText(doc, item.id, text, origin);
            setPasting(false);
          }}
        />
      )}
    </article>
  );
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

function RolesEditor({ item, sections, people, editable, onChange }: { item: ShowItem; sections: ReturnType<typeof itemSections>; people: Person[]; editable: boolean; onChange: (roles: ShowItem['roles']) => void }) {
  const roles = item.roles ?? [];
  const usage = (roleId: string) => sections.reduce((n, s) => n + s.lines.filter((l) => l.roleId === roleId).length, 0);
  const update = (id: string, patch: Partial<{ name: string; personId: string | undefined }>) =>
    onChange(
      roles.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch };
        if (!next.personId) delete next.personId;
        return next;
      }),
    );
  return (
    <section className="space-y-2" aria-label={t.roles}>
      <h3 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{t.roles}</h3>
      {roles.length > 0 && (
        <ul className="space-y-1">
          {roles.map((role) => {
            const used = usage(role.id);
            return (
              <li key={role.id} className="flex flex-wrap items-center gap-2" data-testid="regie-role">
                <input
                  aria-label={t.roleName}
                  className="min-w-32 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
                  value={role.name}
                  disabled={!editable}
                  onChange={(e) => update(role.id, { name: e.target.value })}
                />
                <span className="text-xs text-slate-500">{t.rolePerson}</span>
                <select
                  aria-label={`${t.rolePerson} ${role.name}`}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
                  value={role.personId ?? ''}
                  disabled={!editable}
                  onChange={(e) => update(role.id, { personId: e.target.value || undefined })}
                >
                  <option value="">{t.noPerson}</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {personName(p)}
                    </option>
                  ))}
                </select>
                <span className="w-16 text-right text-xs text-slate-500">{t.roleUsed(used)}</span>
                {editable && (
                  <Button variant="ghost" aria-label={`${t.roleRemove}: ${role.name}`} title={used ? t.roleInUse : t.roleRemove} disabled={used > 0} onClick={() => onChange(roles.filter((r) => r.id !== role.id))}>
                    <Trash2 {...ICON} />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editable && (
        <Button variant="ghost" className="text-xs" onClick={() => onChange([...roles, { id: globalThis.crypto.randomUUID(), name: `${t.roleName} ${roles.length + 1}` }])}>
          {t.addRole}
        </Button>
      )}
    </section>
  );
}

function PasteDialog({ play, onCancel, onApply }: { play: boolean; onCancel: () => void; onApply: (text: string) => void }) {
  const [text, setText] = useState('');
  return (
    <Modal
      title={t.pasteTitle}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>{texts.common.cancel}</Button>
          <Button variant="primary" disabled={!text.trim()} onClick={() => onApply(text)}>
            {t.pasteApply}
          </Button>
        </>
      }
    >
      <p className="mb-2 text-xs text-slate-500">
        {t.pasteHint} {play ? t.pastePlayHint : ''}
      </p>
      <TextArea aria-label={t.pasteTitle} rows={14} autoFocus value={text} onChange={(e) => setText(e.target.value)} />
    </Modal>
  );
}
