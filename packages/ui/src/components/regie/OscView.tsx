// Regie → OSC: Befehle je Ablaufeintrag – beim Start des Eintrags, je Lichtszene, je Licht-Event und eine Liste für
// die Hand der führenden Person. Oben das Standard-Ziel (IP, Port); jeder Befehl kann ein eigenes Ziel haben.
// Gesendet wird vom Server: automatisch beim Führen mit „OSC senden“, die manuellen per Knopf, jeder per „Testen“.
import { ChevronLeft, Plus, Send, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type * as Y from 'yjs';
import {
  addOscCommand,
  isOscAddress,
  itemLightEvents,
  itemNumbers,
  itemScenes,
  removeOscCommand,
  triggerCommands,
  updateOscCommand,
  updateShowSettings,
  type OscCommand,
  type OscTrigger,
  type ShowItem,
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
import { formatSceneTime } from './ScenesSection';

const t = texts.regie.osc;
const inputClass = 'min-w-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800';

export function OscView({ projectId, doc, origin, data, editable }: { projectId: string; doc: Y.Doc; origin: object; data: ProjectData; editable: boolean }) {
  const narrow = useIsNarrow(900);
  const items = data.show.items;
  const [selectedId, setSelectedId] = useRegieSelection(projectId);
  const item = items.find((i) => i.id === selectedId) ?? (narrow ? undefined : items[0]);
  const numbers = itemNumbers(items);
  const [toast, showToast] = useToast();

  if (items.length === 0) return <p className="mx-auto max-w-2xl p-6 text-sm text-slate-500" data-testid="osc-view">{t.empty}</p>;

  const list = (
    <ul className="min-h-0 flex-1 overflow-y-auto" aria-label={t.items} data-testid="osc-items">
      {items.map((i) => {
        const Icon = KIND_ICONS[i.kind];
        const count = data.oscCommands.filter((c) => c.itemId === i.id).length;
        return (
          <li key={i.id} className="border-b border-slate-100 dark:border-slate-800">
            <button
              type="button"
              aria-current={item?.id === i.id ? 'true' : undefined}
              onClick={() => setSelectedId(i.id)}
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
          <Button variant="ghost" aria-label={t.back} onClick={() => setSelectedId(null)}>
            <ChevronLeft {...ICON} />
          </Button>
        )}
        <ItemNumber number={numbers.get(item.id)} />
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{item.title || texts.regie.untitled}</h2>
      </header>
      <TargetFields doc={doc} origin={origin} data={data} editable={editable} />
      <p className="text-xs text-slate-500">{t.hint}</p>
      <Group title={t.groups.item} hint={t.groups.itemHint}>
        <CommandList doc={doc} origin={origin} item={item} trigger="item" commands={triggerCommands(data.oscCommands, item.id, 'item')} editable={editable} onTest={test} />
      </Group>
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
              <CommandList doc={doc} origin={origin} item={item} trigger="scene" refId={scene.id} commands={triggerCommands(data.oscCommands, item.id, 'scene', scene.id)} editable={editable} onTest={test} />
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
              <CommandList doc={doc} origin={origin} item={item} trigger="event" refId={ev.id} commands={triggerCommands(data.oscCommands, item.id, 'event', ev.id)} editable={editable} onTest={test} />
            </div>
          ))
        )}
      </Group>
      <Group title={t.groups.manual} hint={t.groups.manualHint}>
        <CommandList doc={doc} origin={origin} item={item} trigger="manual" commands={triggerCommands(data.oscCommands, item.id, 'manual')} editable={editable} onTest={test} labelRequired />
      </Group>
      <Toast message={toast} />
    </article>
  ) : null;

  if (narrow) return <div className="min-h-0 flex-1 overflow-y-auto bg-white dark:bg-slate-900" data-testid="osc-view">{detail ?? list}</div>;
  return (
    <div className="flex min-h-0 flex-1" data-testid="osc-view">
      <div className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white 2xl:w-72 dark:border-slate-700 dark:bg-slate-900">{list}</div>
      <div className="min-w-0 flex-1 overflow-y-auto">{detail}</div>
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

function CommandList({
  doc,
  origin,
  item,
  trigger,
  refId,
  commands,
  editable,
  onTest,
  labelRequired = false,
}: {
  doc: Y.Doc;
  origin: object;
  item: ShowItem;
  trigger: OscTrigger;
  refId?: string;
  commands: OscCommand[];
  editable: boolean;
  onTest: (command: OscCommand) => void;
  labelRequired?: boolean;
}) {
  return (
    <div className="space-y-1.5" data-testid={`osc-list-${trigger}`}>
      {commands.map((c) => (
        <CommandRow key={c.id} doc={doc} origin={origin} command={c} editable={editable} onTest={onTest} labelRequired={labelRequired} />
      ))}
      {editable && (
        <Button variant="ghost" className="min-h-8 text-xs" onClick={() => addOscCommand(doc, { itemId: item.id, trigger, ...(refId ? { refId } : {}) }, origin)} data-testid="osc-add">
          <Plus {...ICON} /> {t.add}
        </Button>
      )}
    </div>
  );
}

function CommandRow({ doc, origin, command, editable, onTest, labelRequired }: { doc: Y.Doc; origin: object; command: OscCommand; editable: boolean; onTest: (c: OscCommand) => void; labelRequired: boolean }) {
  const [ownTarget, setOwnTarget] = useState(!!command.host);
  const set = (patch: Partial<Omit<OscCommand, 'id' | 'itemId' | 'trigger'>>) => updateOscCommand(doc, command.id, patch, origin);
  const badAddress = command.address !== '' && !isOscAddress(command.address);
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-slate-50 p-1.5 dark:bg-slate-800/40" data-testid="osc-command">
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
