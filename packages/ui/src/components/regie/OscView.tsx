// Regie → OSC: Befehle je Ablaufeintrag – beim Start, im Stück (Zeitpunkt, Textzeile, Abschnitt), je Lichtszene, je
// Licht-Event, beim Ende und eine Liste für die Hand der führenden Person; dazu Befehle für jeden Eintrag und Bereiche
// über mehrere Einträge (Start beim Betreten, Ende beim Verlassen). Jeder Befehl kann einen Wert verlaufen lassen.
// Oben das Standard-Ziel (IP, Port); jeder Befehl kann ein eigenes Ziel haben.
// Gesendet wird vom Server: automatisch beim Führen mit „OSC senden“, die manuellen per Knopf, jeder per „Testen“.
import { ChevronLeft, Layers, Plus, Repeat, Send, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type * as Y from 'yjs';
import {
  addOscCommand,
  addOscRange,
  isOscAddress,
  itemLightEvents,
  itemNumbers,
  itemScenes,
  itemSections,
  itemTimedLines,
  OSC_ALL_ITEMS,
  OSC_FADE_MAX_SEC,
  oscRanges,
  removeOscCommand,
  removeOscRange,
  setOscRangeBounds,
  triggerCommands,
  updateOscCommand,
  updateShowSettings,
  type OscCommand,
  type OscTrigger,
} from '@steckplan/core';
import { api, errorMessage } from '../../lib/api';
import { useIsNarrow } from '../../lib/useProjectDoc';
import type { ProjectData } from '../../lib/useProjectData';
import { useToast } from '../../lib/useToast';
import { texts } from '../../texts';
import { ICON } from '../icons';
import { Button, Toast } from '../ui';
import { ItemNumber, KIND_ICONS } from './RegieView';
import { useRegieSelection } from './regieSelection';
import { formatSceneTime, parseSceneTime } from './ScenesSection';

const t = texts.regie.osc;
const inputClass = 'min-w-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800';

export function OscView({ projectId, doc, origin, data, editable }: { projectId: string; doc: Y.Doc; origin: object; data: ProjectData; editable: boolean }) {
  const narrow = useIsNarrow(900);
  const items = data.show.items;
  const [selectedId, setSelectedId] = useRegieSelection(projectId);
  // „Jeder Eintrag“ bzw. „Bereiche“ statt eines Eintrags
  const [special, setSpecial] = useState<'all' | 'ranges' | null>(null);
  const item = special ? undefined : (items.find((i) => i.id === selectedId) ?? (narrow ? undefined : items[0]));
  const numbers = itemNumbers(items);
  const [toast, showToast] = useToast();
  const choose = (id: string | null) => {
    setSpecial(null);
    setSelectedId(id);
  };

  if (items.length === 0) return <p className="mx-auto max-w-2xl p-6 text-sm text-slate-500" data-testid="osc-view">{t.empty}</p>;

  const allCount = data.oscCommands.filter((c) => c.itemId === OSC_ALL_ITEMS).length;
  const rangeCount = oscRanges(data.oscCommands).length;
  const specialButton = (key: 'all' | 'ranges', label: string, count: string, Icon: typeof Layers) => (
    <li className="border-b border-slate-100 dark:border-slate-800">
      <button
        type="button"
        aria-current={special === key ? 'true' : undefined}
        onClick={() => setSpecial(key)}
        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${special === key ? 'bg-sky-50 dark:bg-sky-950' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
        data-testid={`osc-special-${key}`}
      >
        <Icon size={16} className="shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
        {count && <span className="shrink-0 text-xs text-slate-500">{count}</span>}
      </button>
    </li>
  );
  const list = (
    <ul className="min-h-0 flex-1 overflow-y-auto" aria-label={t.items} data-testid="osc-items">
      {specialButton('all', t.allItems, allCount ? t.count(allCount) : '', Repeat)}
      {specialButton('ranges', t.ranges, rangeCount ? t.rangeCount(rangeCount) : '', Layers)}
      {items.map((i) => {
        const Icon = KIND_ICONS[i.kind];
        const count = data.oscCommands.filter((c) => c.itemId === i.id && c.trigger !== 'range').length;
        return (
          <li key={i.id} className="border-b border-slate-100 dark:border-slate-800">
            <button
              type="button"
              aria-current={item?.id === i.id ? 'true' : undefined}
              onClick={() => choose(i.id)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${item?.id === i.id ? 'bg-sky-50 dark:bg-sky-950' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              <ItemNumber number={numbers.get(i.id)} />
              <Icon size={16} className="shrink-0 text-slate-500" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-medium">{i.title || texts.regie.untitled}</span>
              {count > 0 && <span className="shrink-0 text-xs text-slate-500">{t.count(count)}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );

  const test = async (command: OscCommand) => {
    try {
      const { entry } = await api.sendOscCommand(projectId, command.id);
      showToast(t.sent(entry.text, entry.target));
    } catch (e) {
      window.alert(errorMessage(e));
    }
  };

  const detail = item ? (
    <article className="mx-auto max-w-5xl space-y-4 p-4" aria-label={item.title || texts.regie.untitled} data-testid="osc-detail">
      <header className="flex items-center gap-2">
        {narrow && (
          <Button variant="ghost" aria-label={t.back} onClick={() => choose(null)}>
            <ChevronLeft {...ICON} />
          </Button>
        )}
        <ItemNumber number={numbers.get(item.id)} />
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{item.title || texts.regie.untitled}</h2>
      </header>
      <TargetFields doc={doc} origin={origin} data={data} editable={editable} />
      <p className="text-xs text-slate-500">{t.hint}</p>
      <Group title={t.groups.item} hint={t.groups.itemHint}>
        <CommandList doc={doc} origin={origin} itemId={item.id} trigger="item" commands={triggerCommands(data.oscCommands, item.id, 'item')} editable={editable} onTest={test} />
      </Group>
      <InPiece doc={doc} origin={origin} itemId={item.id} data={data} editable={editable} onTest={test} />
      <Group title={t.groups.scenes} hint={t.groups.scenesHint}>
        {itemScenes(data.lightScenes, item.id).length === 0 ? (
          <p className="text-sm text-slate-500">{t.noScenes}</p>
        ) : (
          itemScenes(data.lightScenes, item.id).map((scene, n) => (
            <div key={scene.id} className="space-y-1 border-t border-slate-100 pt-2 first:border-0 first:pt-0 dark:border-slate-800" data-testid="osc-scene">
              <div className="text-sm font-medium">
                {n + 1}. {scene.name || '–'}
                {scene.atSec !== undefined && <span className="ml-2 text-xs text-slate-500 tabular-nums">{formatSceneTime(scene.atSec)}</span>}
              </div>
              <CommandList doc={doc} origin={origin} itemId={item.id} trigger="scene" refId={scene.id} commands={triggerCommands(data.oscCommands, item.id, 'scene', scene.id)} editable={editable} onTest={test} />
            </div>
          ))
        )}
      </Group>
      <Group title={t.groups.events} hint={t.groups.eventsHint}>
        {itemLightEvents(data.lightEvents, item.id).length === 0 ? (
          <p className="text-sm text-slate-500">{t.noEvents}</p>
        ) : (
          itemLightEvents(data.lightEvents, item.id).map((ev) => (
            <div key={ev.id} className="space-y-1 border-t border-slate-100 pt-2 first:border-0 first:pt-0 dark:border-slate-800" data-testid="osc-event">
              <div className="text-sm font-medium">
                <span className="mr-2 text-xs text-amber-700 tabular-nums dark:text-amber-400">{formatSceneTime(ev.atSec)}</span>
                {ev.note || '!'}
              </div>
              <CommandList doc={doc} origin={origin} itemId={item.id} trigger="event" refId={ev.id} commands={triggerCommands(data.oscCommands, item.id, 'event', ev.id)} editable={editable} onTest={test} />
            </div>
          ))
        )}
      </Group>
      <Group title={t.groups.end} hint={t.groups.endHint}>
        <CommandList doc={doc} origin={origin} itemId={item.id} trigger="end" commands={triggerCommands(data.oscCommands, item.id, 'end')} editable={editable} onTest={test} />
      </Group>
      <Group title={t.groups.manual} hint={t.groups.manualHint}>
        <CommandList doc={doc} origin={origin} itemId={item.id} trigger="manual" commands={triggerCommands(data.oscCommands, item.id, 'manual')} editable={editable} onTest={test} labelRequired />
      </Group>
      <Toast message={toast} />
    </article>
  ) : null;

  const back = narrow ? (
    <Button variant="ghost" aria-label={t.back} onClick={() => setSpecial(null)}>
      <ChevronLeft {...ICON} />
    </Button>
  ) : null;
  const specialDetail =
    special === 'all' ? (
      <article className="mx-auto max-w-5xl space-y-4 p-4" aria-label={t.allItems} data-testid="osc-all">
        <header className="flex items-center gap-2">
          {back}
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{t.allItems}</h2>
        </header>
        <TargetFields doc={doc} origin={origin} data={data} editable={editable} />
        <p className="text-xs text-slate-500">{t.allItemsHint}</p>
        <Group title={t.groups.item} hint={t.groups.allStartHint}>
          <CommandList doc={doc} origin={origin} itemId={OSC_ALL_ITEMS} trigger="item" commands={triggerCommands(data.oscCommands, OSC_ALL_ITEMS, 'item')} editable={editable} onTest={test} />
        </Group>
        <Group title={t.groups.end} hint={t.groups.endHint}>
          <CommandList doc={doc} origin={origin} itemId={OSC_ALL_ITEMS} trigger="end" commands={triggerCommands(data.oscCommands, OSC_ALL_ITEMS, 'end')} editable={editable} onTest={test} />
        </Group>
        <Toast message={toast} />
      </article>
    ) : special === 'ranges' ? (
      <article className="mx-auto max-w-5xl space-y-4 p-4" aria-label={t.ranges} data-testid="osc-ranges">
        <header className="flex items-center gap-2">
          {back}
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{t.ranges}</h2>
        </header>
        <TargetFields doc={doc} origin={origin} data={data} editable={editable} />
        <p className="text-xs text-slate-500">{t.rangesHint}</p>
        <Ranges doc={doc} origin={origin} data={data} editable={editable} onTest={test} />
        <Toast message={toast} />
      </article>
    ) : null;
  const shown = specialDetail ?? detail;

  if (narrow) return <div className="min-h-0 flex-1 overflow-y-auto bg-white dark:bg-slate-900" data-testid="osc-view">{shown ?? list}</div>;
  return (
    <div className="flex min-h-0 flex-1" data-testid="osc-view">
      <div className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white 2xl:w-72 dark:border-slate-700 dark:bg-slate-900">{list}</div>
      <div className="min-w-0 flex-1 overflow-y-auto">{shown}</div>
    </div>
  );
}

function Group({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700" aria-label={title} data-testid="osc-group">
      <div>
        <h3 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{title}</h3>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>
      {children}
    </section>
  );
}

/** Standard-Ziel für alle Befehle */
function TargetFields({ doc, origin, data, editable }: { doc: Y.Doc; origin: object; data: ProjectData; editable: boolean }) {
  const target = { host: '', port: 8000, ...data.showSettings.oscOut };
  const set = (patch: Partial<typeof target>) => updateShowSettings(doc, { oscOut: { ...target, ...patch } }, origin);
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60" data-testid="osc-target">
      <span className="text-sm font-semibold">{t.target}</span>
      <label className="flex flex-col gap-1 text-xs text-slate-500">
        {t.host}
        <input key={`h${target.host}`} className={`${inputClass} w-44 font-mono`} defaultValue={target.host} placeholder="192.168.1.20" disabled={!editable} onBlur={(e) => e.target.value.trim() !== target.host && set({ host: e.target.value.trim() })} data-testid="osc-target-host" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-500">
        {t.port}
        <input
          key={`p${target.port}`}
          type="number"
          min={1}
          max={65535}
          className={`${inputClass} w-24 font-mono`}
          defaultValue={target.port}
          disabled={!editable}
          onBlur={(e) => {
            const v = Math.round(Number(e.target.value));
            if (v >= 1 && v <= 65535 && v !== target.port) set({ port: v });
          }}
          data-testid="osc-target-port"
        />
      </label>
      {!target.host && <span className="text-xs text-amber-700 dark:text-amber-400">{t.noTarget}</span>}
    </div>
  );
}

type CommandInit = Partial<Pick<OscCommand, 'refId' | 'atSec' | 'untilItemId' | 'phase'>>;

function CommandList({
  doc,
  origin,
  itemId,
  trigger,
  refId,
  init,
  commands,
  editable,
  onTest,
  labelRequired = false,
  testId,
}: {
  doc: Y.Doc;
  origin: object;
  itemId: string;
  trigger: OscTrigger;
  refId?: string;
  /** weitere Felder neuer Befehle (Bereich: Grenzen und Phase) */
  init?: CommandInit;
  commands: OscCommand[];
  editable: boolean;
  onTest: (command: OscCommand) => void;
  labelRequired?: boolean;
  testId?: string;
}) {
  return (
    <div className="space-y-1.5" data-testid={testId ?? `osc-list-${trigger}`}>
      {commands.map((c) => (
        <CommandRow key={c.id} doc={doc} origin={origin} command={c} editable={editable} onTest={onTest} labelRequired={labelRequired} />
      ))}
      {editable && (
        <Button variant="ghost" className="min-h-8 text-xs" onClick={() => addOscCommand(doc, { itemId, trigger, ...(refId ? { refId } : {}), ...init }, origin)} data-testid="osc-add">
          <Plus {...ICON} /> {t.add}
        </Button>
      )}
    </div>
  );
}

function CommandRow({
  doc,
  origin,
  command,
  editable,
  onTest,
  labelRequired,
  anchor,
}: {
  doc: Y.Doc;
  origin: object;
  command: OscCommand;
  editable: boolean;
  onTest: (c: OscCommand) => void;
  labelRequired: boolean;
  /** Auslöser im Stück (Zeitpunkt, Zeile, Abschnitt) vor dem Befehl */
  anchor?: ReactNode;
}) {
  const [ownTarget, setOwnTarget] = useState(!!command.host);
  const set = (patch: Partial<Omit<OscCommand, 'id' | 'itemId' | 'trigger'>>) => updateOscCommand(doc, command.id, patch, origin);
  const badAddress = command.address !== '' && !isOscAddress(command.address);
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-slate-50 p-1.5 dark:bg-slate-800/40" data-testid="osc-command" data-trigger={command.trigger}>
      {anchor}
      <input
        key={`l${command.label ?? ''}`}
        className={`${inputClass} w-36`}
        aria-label={t.label}
        placeholder={labelRequired ? t.labelPlaceholderManual : t.labelPlaceholder}
        defaultValue={command.label ?? ''}
        disabled={!editable}
        onBlur={(e) => e.target.value.trim() !== (command.label ?? '') && set({ label: e.target.value.trim() || undefined })}
      />
      <input
        key={`a${command.address}`}
        className={`${inputClass} w-40 font-mono ${badAddress || !command.address ? 'border-amber-500' : ''}`}
        aria-label={t.address}
        placeholder="/cmd"
        defaultValue={command.address}
        disabled={!editable}
        onBlur={(e) => e.target.value.trim() !== command.address && set({ address: e.target.value.trim() })}
      />
      <input
        key={`r${command.args ?? ''}`}
        className={`${inputClass} min-w-40 flex-1 font-mono`}
        aria-label={t.args}
        placeholder={t.argsPlaceholder}
        defaultValue={command.args ?? ''}
        disabled={!editable}
        onBlur={(e) => e.target.value !== (command.args ?? '') && set({ args: e.target.value || undefined })}
      />
      <label className="flex items-center gap-1 text-xs text-slate-500" title={t.ownTargetHint}>
        <input
          type="checkbox"
          checked={ownTarget}
          disabled={!editable}
          onChange={(e) => {
            setOwnTarget(e.target.checked);
            if (!e.target.checked) set({ host: undefined, port: undefined });
          }}
        />
        {t.ownTarget}
      </label>
      {ownTarget && (
        <>
          <input key={`h${command.host ?? ''}`} className={`${inputClass} w-32 font-mono`} aria-label={t.host} placeholder="IP" defaultValue={command.host ?? ''} disabled={!editable} onBlur={(e) => e.target.value.trim() !== (command.host ?? '') && set({ host: e.target.value.trim() || undefined })} />
          <input
            key={`p${command.port ?? ''}`}
            type="number"
            min={1}
            max={65535}
            className={`${inputClass} w-20 font-mono`}
            aria-label={t.port}
            placeholder="8000"
            defaultValue={command.port ?? ''}
            disabled={!editable}
            onBlur={(e) => {
              const v = Math.round(Number(e.target.value));
              set({ port: v >= 1 && v <= 65535 ? v : undefined });
            }}
          />
        </>
      )}
      <FadeFields command={command} editable={editable} onChange={(fade) => set({ fade })} />
      <Button variant="ghost" className="min-h-8 px-1.5 text-xs" title={t.test} onClick={() => onTest(command)} disabled={!command.address} data-testid="osc-test">
        <Send {...ICON} /> {t.test}
      </Button>
      {editable && (
        <Button variant="ghost" className="min-h-8 px-1.5" aria-label={t.remove} title={t.remove} onClick={() => removeOscCommand(doc, command.id, origin)}>
          <Trash2 {...ICON} />
        </Button>
      )}
      {badAddress && <span className="basis-full text-xs text-amber-700 dark:text-amber-400">{t.badAddress}</span>}
    </div>
  );
}

/** Verlauf: Wert von → bis in Sekunden ({wert} in den Argumenten); Zahlen ganz oder mit Komma (sonst von selbst) */
function FadeFields({ command, editable, onChange }: { command: OscCommand; editable: boolean; onChange: (fade: OscCommand['fade']) => void }) {
  const fade = command.fade;
  const number = (text: string) => {
    const v = Number(text.replace(',', '.'));
    return Number.isFinite(v) ? v : undefined;
  };
  return (
    <>
      <label className="flex items-center gap-1 text-xs text-slate-500" title={t.fadeHint}>
        <input type="checkbox" checked={!!fade} disabled={!editable} onChange={(e) => onChange(e.target.checked ? { from: 0, to: 100, sec: 5 } : undefined)} data-testid="osc-fade" />
        {t.fade}
      </label>
      {fade && (
        <span className="flex basis-full flex-wrap items-center gap-1.5 pl-1 text-xs text-slate-500 sm:basis-auto" data-testid="osc-fade-fields">
          <input key={`f${fade.from}`} className={`${inputClass} w-16 font-mono`} aria-label={t.fadeFrom} defaultValue={String(fade.from).replace('.', ',')} disabled={!editable} onBlur={(e) => { const v = number(e.target.value); if (v !== undefined && v !== fade.from) onChange({ ...fade, from: v }); }} />
          →
          <input key={`t${fade.to}`} className={`${inputClass} w-16 font-mono`} aria-label={t.fadeTo} defaultValue={String(fade.to).replace('.', ',')} disabled={!editable} onBlur={(e) => { const v = number(e.target.value); if (v !== undefined && v !== fade.to) onChange({ ...fade, to: v }); }} />
          {t.fadeIn}
          <input key={`s${fade.sec}`} className={`${inputClass} w-14 font-mono`} aria-label={t.fadeSec} defaultValue={String(fade.sec).replace('.', ',')} disabled={!editable} onBlur={(e) => { const v = number(e.target.value); if (v !== undefined && v > 0 && v <= OSC_FADE_MAX_SEC && v !== fade.sec) onChange({ ...fade, sec: v }); }} />
          s
          <select
            className={inputClass}
            aria-label={t.fadeNumbers}
            value={fade.float === undefined ? 'auto' : fade.float ? 'float' : 'int'}
            disabled={!editable}
            onChange={(e) => {
              const { float: _float, ...rest } = fade;
              onChange(e.target.value === 'auto' ? rest : { ...rest, float: e.target.value === 'float' });
            }}
          >
            <option value="auto">{t.fadeAuto}</option>
            <option value="int">{t.fadeInt}</option>
            <option value="float">{t.fadeFloat}</option>
          </select>
          {!(command.args ?? '').includes('{wert}') && <span>{t.fadeAppend}</span>}
        </span>
      )}
    </>
  );
}

/** Im Stück: Befehle zu einem Zeitpunkt, beim Beginn einer Textzeile bzw. eines Abschnitts (nach der Zeit sortiert) */
function InPiece({ doc, origin, itemId, data, editable, onTest }: { doc: Y.Doc; origin: object; itemId: string; data: ProjectData; editable: boolean; onTest: (c: OscCommand) => void }) {
  const item = data.show.items.find((i) => i.id === itemId);
  const lines = item ? itemTimedLines(data.show.sections, item) : [];
  const sections = itemSections(data.show.sections, itemId);
  const lineTime = (id: string | undefined) => lines.find((l) => l.line.id === id)?.line.atSec;
  const sectionTime = (id: string | undefined) => lines.find((l) => l.sectionId === id && l.line.atSec !== undefined)?.line.atSec;
  const timeOf = (c: OscCommand) => (c.trigger === 'time' ? c.atSec : c.trigger === 'line' ? lineTime(c.refId) : sectionTime(c.refId));
  const commands = data.oscCommands.filter((c) => c.itemId === itemId && (c.trigger === 'time' || c.trigger === 'line' || c.trigger === 'section')).sort((a, b) => (timeOf(a) ?? Infinity) - (timeOf(b) ?? Infinity) || a.order - b.order);
  const firstTimed = lines.find((l) => l.line.atSec !== undefined)?.line.id ?? lines[0]?.line.id;
  const set = (c: OscCommand, patch: Partial<Omit<OscCommand, 'id' | 'itemId' | 'trigger'>>) => updateOscCommand(doc, c.id, patch, origin);
  const selectClass = `${inputClass} max-w-64`;
  const anchor = (c: OscCommand) => {
    const missing = timeOf(c) === undefined;
    const warn = missing ? <span className="text-xs text-amber-700 dark:text-amber-400">{t.noTime}</span> : null;
    if (c.trigger === 'time') {
      return (
        <span className="flex items-center gap-1 text-xs text-slate-500">
          {t.anchor.time}
          <input
            key={`z${c.atSec ?? ''}`}
            className={`${inputClass} w-20 font-mono`}
            aria-label={t.anchor.time}
            defaultValue={c.atSec !== undefined ? formatSceneTime(c.atSec) : ''}
            placeholder="0:30"
            disabled={!editable}
            onBlur={(e) => {
              const v = parseSceneTime(e.target.value);
              if (v !== undefined && v !== c.atSec) set(c, { atSec: v });
            }}
            data-testid="osc-anchor-time"
          />
        </span>
      );
    }
    if (c.trigger === 'line') {
      return (
        <span className="flex items-center gap-1 text-xs text-slate-500">
          {t.anchor.line}
          <select className={selectClass} aria-label={t.anchor.line} value={c.refId ?? ''} disabled={!editable} onChange={(e) => set(c, { refId: e.target.value })} data-testid="osc-anchor-line">
            {lines.map((l) => (
              <option key={l.line.id} value={l.line.id}>
                {l.line.atSec !== undefined ? formatSceneTime(l.line.atSec) : '–'} · {l.line.text || '…'}
              </option>
            ))}
          </select>
          {warn}
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-xs text-slate-500">
        {t.anchor.section}
        <select className={selectClass} aria-label={t.anchor.section} value={c.refId ?? ''} disabled={!editable} onChange={(e) => set(c, { refId: e.target.value })} data-testid="osc-anchor-section">
          {sections.map((sec) => {
            const at = sectionTime(sec.id);
            return (
              <option key={sec.id} value={sec.id}>
                {at !== undefined ? formatSceneTime(at) : '–'} · {sec.label}
              </option>
            );
          })}
        </select>
        {warn}
      </span>
    );
  };
  const add = (trigger: 'time' | 'line' | 'section') =>
    addOscCommand(doc, { itemId, trigger, ...(trigger === 'time' ? { atSec: 0 } : trigger === 'line' ? { refId: firstTimed } : { refId: sections[0]?.id }) }, origin);
  return (
    <Group title={t.groups.inPiece} hint={t.groups.inPieceHint}>
      <div className="space-y-1.5" data-testid="osc-list-piece">
        {commands.map((c) => (
          <CommandRow key={c.id} doc={doc} origin={origin} command={c} editable={editable} onTest={onTest} labelRequired={false} anchor={anchor(c)} />
        ))}
        {editable && (
          <div className="flex flex-wrap gap-1">
            <Button variant="ghost" className="min-h-8 text-xs" onClick={() => add('time')} data-testid="osc-add-time">
              <Plus {...ICON} /> {t.addTime}
            </Button>
            <Button variant="ghost" className="min-h-8 text-xs" onClick={() => add('line')} disabled={lines.length === 0} data-testid="osc-add-line">
              <Plus {...ICON} /> {t.addLine}
            </Button>
            <Button variant="ghost" className="min-h-8 text-xs" onClick={() => add('section')} disabled={sections.length === 0} data-testid="osc-add-section">
              <Plus {...ICON} /> {t.addSection}
            </Button>
          </div>
        )}
      </div>
    </Group>
  );
}

/** Bereiche über mehrere Einträge: von – bis, Befehle beim Betreten und beim Verlassen */
function Ranges({ doc, origin, data, editable, onTest }: { doc: Y.Doc; origin: object; data: ProjectData; editable: boolean; onTest: (c: OscCommand) => void }) {
  const items = data.show.items;
  const numbers = itemNumbers(items);
  const ranges = oscRanges(data.oscCommands);
  const label = (id: string) => {
    const item = items.find((i) => i.id === id);
    const nr = numbers.get(id);
    return item ? `${nr !== undefined ? `${nr}. ` : ''}${item.title || texts.regie.untitled}` : '–';
  };
  const select = (value: string, onChange: (id: string) => void, aria: string, testId: string) => (
    <select className={`${inputClass} max-w-72`} aria-label={aria} value={value} disabled={!editable} onChange={(e) => onChange(e.target.value)} data-testid={testId}>
      {items.map((i) => (
        <option key={i.id} value={i.id}>
          {label(i.id)}
        </option>
      ))}
    </select>
  );
  return (
    <div className="space-y-3">
      {ranges.length === 0 && <p className="text-sm text-slate-500">{t.noRanges}</p>}
      {ranges.map((r) => (
        <section key={r.id} className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700" aria-label={`${label(r.fromItemId)} – ${label(r.untilItemId)}`} data-testid="osc-range">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">{t.rangeFrom}</span>
            {select(r.fromItemId, (id) => setOscRangeBounds(doc, r.id, { fromItemId: id }, origin), t.rangeFrom, 'osc-range-from')}
            <span className="font-semibold">{t.rangeUntil}</span>
            {select(r.untilItemId, (id) => setOscRangeBounds(doc, r.id, { untilItemId: id }, origin), t.rangeUntil, 'osc-range-until')}
            <span className="flex-1" />
            {editable && (
              <Button variant="ghost" className="min-h-8 px-1.5" aria-label={t.removeRange} title={t.removeRange} onClick={() => removeOscRange(doc, r.id, origin)}>
                <Trash2 {...ICON} />
              </Button>
            )}
          </div>
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase">{t.rangeStart}</h4>
            <p className="text-xs text-slate-500">{t.rangeStartHint}</p>
            <CommandList doc={doc} origin={origin} itemId={r.fromItemId} trigger="range" refId={r.id} init={{ untilItemId: r.untilItemId, phase: 'start' }} commands={r.start} editable={editable} onTest={onTest} testId="osc-range-start" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase">{t.rangeEnd}</h4>
            <p className="text-xs text-slate-500">{t.rangeEndHint}</p>
            <CommandList doc={doc} origin={origin} itemId={r.fromItemId} trigger="range" refId={r.id} init={{ untilItemId: r.untilItemId, phase: 'end' }} commands={r.end} editable={editable} onTest={onTest} testId="osc-range-end" />
          </div>
        </section>
      ))}
      {editable && items.length > 0 && (
        <Button variant="ghost" className="min-h-8 text-xs" onClick={() => addOscRange(doc, items[0]!.id, items[items.length - 1]!.id, origin)} data-testid="osc-add-range">
          <Plus {...ICON} /> {t.addRange}
        </Button>
      )}
    </div>
  );
}
