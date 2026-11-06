// Regie → Texte: links Lieder, Schauspielstücke und Ansagen, rechts der Text des gewählten Stücks
// (Abschnitte, Rollen, Text einfügen; mit Audio: Mitlesen und Mitschreiben), unten der Player.
// Auf dem Handy erst die Liste, Antippen öffnet das Stück.
import { ChevronLeft, ClipboardPaste, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import type * as Y from 'yjs';
import {
  itemNumbers,
  appendPastedText,
  clearLineTimes,
  itemLines,
  itemScenes,
  itemSections,
  nextUntimedLine,
  personName,
  sceneTime,
  setLineTime,
  updateShowItem,
  type Person,
  type ShowItem,
} from '@steckplan/core';
import { useIsNarrow } from '../../lib/useProjectDoc';
import type { ProjectData } from '../../lib/useProjectData';
import { texts } from '../../texts';
import { ICON } from '../icons';
import { Button, Modal, TextArea } from '../ui';
import { ItemNumber, KIND_ICONS } from './RegieView';
import { useTransport } from '../../lib/transport';
import { SectionsEditor } from './SectionsEditor';
import { LyricsView, PlayerBar, seekAudio, usePlayerTime, useRecordKey } from './SongMedia';

const t = texts.regie;
const tv = texts.regie.textsView;

export function TextsView({ projectId, doc, origin, data, editable }: { projectId: string; doc: Y.Doc; origin: object; data: ProjectData; editable: boolean }) {
  const narrow = useIsNarrow(900);
  const items = data.show.items.filter((i) => i.kind === 'song' || i.kind === 'play' || i.kind === 'announcement');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const item = items.find((i) => i.id === selectedId) ?? (narrow ? undefined : items[0]);

  if (items.length === 0) return <p className="mx-auto max-w-2xl p-6 text-sm text-slate-500" data-testid="texts-view">{tv.empty}</p>;

  const numbers = itemNumbers(data.show.items);
  const list = (
    <ul className="min-h-0 flex-1 overflow-y-auto" aria-label={tv.items} data-testid="texts-items">
      {items.map((i) => {
        const Icon = KIND_ICONS[i.kind];
        const count = itemLines(data.show.sections, i.id).length;
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
              <Icon size={16} className="shrink-0 text-slate-500" aria-label={t.kinds[i.kind]} />
              <span className="min-w-0 flex-1 truncate font-medium">{i.title || t.untitled}</span>
              <span className="shrink-0 text-xs text-slate-500">{t.lines(count)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  const detail = item ? <TextDetail key={item.id} projectId={projectId} doc={doc} origin={origin} data={data} item={item} editable={editable} onBack={narrow ? () => setSelectedId(null) : undefined} /> : null;

  if (narrow) return <div className="min-h-0 flex-1 overflow-y-auto bg-white dark:bg-slate-900" data-testid="texts-view">{detail ?? list}</div>;
  return (
    <div className="flex min-h-0 flex-1" data-testid="texts-view">
      <div className="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">{list}</div>
      <div className="min-w-0 flex-1 overflow-y-auto">{detail}</div>
    </div>
  );
}

function TextDetail({ projectId, doc, origin, data, item, editable, onBack }: { projectId: string; doc: Y.Doc; origin: object; data: ProjectData; item: ShowItem; editable: boolean; onBack: (() => void) | undefined }) {
  const sections = itemSections(data.show.sections, item.id);
  const [pasting, setPasting] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const transport = useTransport(item.id, item.durationSec, audio);
  const time = usePlayerTime(transport);
  const hasAudio = item.kind === 'song' && (item.media?.length ?? 0) > 0;
  const [textMode, setTextMode] = useState<'edit' | 'read' | 'record'>('edit');
  const mode = hasAudio ? textMode : 'edit';
  const lines = itemLines(data.show.sections, item.id);
  const next = nextUntimedLine(lines);
  const recordNext = useCallback(() => {
    if (next && editable) setLineTime(doc, next.sectionId, next.line.id, transport.currentTime, origin);
  }, [next, editable, doc, origin, transport]);
  useRecordKey(mode === 'record' && editable, recordNext);
  const Icon = KIND_ICONS[item.kind];

  return (
    <article className="mx-auto max-w-3xl space-y-4 p-4" aria-label={item.title || t.untitled} data-testid="texts-detail">
      <header className="flex items-center gap-2">
        {onBack && (
          <Button variant="ghost" aria-label={tv.back} onClick={onBack}>
            <ChevronLeft {...ICON} />
          </Button>
        )}
        <Icon size={20} className="shrink-0 text-slate-500" aria-hidden />
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{item.title || t.untitled}</h2>
      </header>

      {item.kind === 'play' && <RolesEditor item={item} sections={sections} people={data.people} editable={editable} onChange={(roles) => updateShowItem(doc, item.id, { roles }, origin)} />}

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
        {item.kind === 'song' && !hasAudio && <p className="text-xs text-slate-500">{tv.noAudio}</p>}
        {mode === 'record' && <p className="text-xs text-slate-500">{t.recordHint}</p>}
        {mode === 'edit' ? (
          <SectionsEditor doc={doc} origin={origin} item={item} sections={sections} editable={editable} />
        ) : (
          <LyricsView doc={doc} origin={origin} lines={lines} time={time} recording={mode === 'record'} editable={editable} onSeek={(sec) => seekAudio(transport, sec)} />
        )}
      </section>

      {(
        <PlayerBar
          settings={data.showSettings}
          number={itemNumbers(data.show.items).get(item.id)}
          projectId={projectId}
          item={item}
          media={data.media}
          playback={transport}
          setAudio={setAudio}
          time={time}
          recording={mode === 'record' && editable}
          onNextLine={recordNext}
          nextLineText={next?.line.text}
          onClearTimes={() => {
            if (window.confirm(t.clearTimesConfirm)) clearLineTimes(doc, item.id, origin);
          }}
          markers={itemScenes(data.lightScenes, item.id).flatMap((s, i) => {
            const at = sceneTime(s, lines.map((l) => l.line));
            return at === undefined ? [] : [{ id: s.id, at, label: `${i + 1} ${s.name}` }];
          })}
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
