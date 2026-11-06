// Lichtszenen eines Lieds/Schauspiels: Szenen-Leiste, Auslöser, Raster mit den Geräten, Werte der gewählten Geräte.
import { ArrowLeft, ArrowRight, ClipboardCopy, ClipboardPaste, Copy, CopyPlus, Keyboard, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type * as Y from 'yjs';
import type { Playback } from '../../lib/transport';
import {
  addScene,
  clearFixtureValues,
  copySceneTo,
  currentSceneId,
  duplicateScene,
  gridLayout,
  itemScenes,
  lightDevices,
  moveScene,
  removeScene,
  replaceSceneValues,
  sceneStates,
  sceneTime,
  sceneValues,
  setFixtureValues,
  updateScene,
  type DeviceInstance,
  type Library,
  type ShowItem,
  type TimedLine,
} from '@steckplan/core';
import type { ProjectData } from '../../lib/useProjectData';
import { texts } from '../../texts';
import { ICON } from '../icons';
import { Button } from '../ui';
import { FixturePanel } from './FixturePanel';
import { MOD_KEY, setSceneClip, useSceneClip } from './sceneClipboard';
import { SceneCopyDialog } from './SceneCopyDialog';
import { SceneGrid } from './SceneGrid';

const t = texts.light.scenes;

/** „1:12.5“ */
export function formatSceneTime(sec: number): string {
  return formatSceneClock(sec).replace(/\.0$/, '');
}

/** „1:12.0“ – immer mit Zehntelsekunde (laufende Anzeigen springen sonst in der Breite) */
export function formatSceneClock(sec: number): string {
  const tenths = Math.max(0, Math.round(sec * 10));
  const m = Math.floor(tenths / 600);
  const s = (tenths - m * 600) / 10;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

/** „1:12“, „1:12.5“ oder Sekunden „75“ → Sekunden */
export function parseSceneTime(text: string): number | undefined {
  const v = text.trim().replace(',', '.');
  if (!v) return undefined;
  if (/^\d+(\.\d+)?$/.test(v)) return Number(v);
  const m = /^(\d+):(\d{1,2}(?:\.\d+)?)$/.exec(v);
  return m && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : undefined;
}

export function ScenesSection({
  doc,
  origin,
  item,
  data,
  library,
  lines,
  time,
  audio,
  editable,
}: {
  doc: Y.Doc;
  origin: object;
  item: ShowItem;
  data: ProjectData;
  library: Library | null;
  lines: TimedLine[];
  time: number;
  audio: Playback | null;
  editable: boolean;
}) {
  const templates = useMemo(() => new Map((library?.templates ?? []).map((tp) => [tp.id, tp])), [library]);
  const lights = useMemo(() => lightDevices(data.devices, templates), [data.devices, templates]);
  const layout = gridLayout(lights, data.lightPlacements, data.lightGrid);
  const scenes = itemScenes(data.lightScenes, item.id);
  const plainLines = lines.map((l) => l.line);
  const current = currentSceneId(scenes, plainLines, time);
  const [chosen, setChosen] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const playing = !!audio && !audio.paused;
  // beim Abspielen der laufenden Szene folgen, sonst die gewählte
  const sceneId = (follow && playing && current) || (scenes.some((s) => s.id === chosen) ? chosen : scenes[0]?.id);
  const scene = scenes.find((s) => s.id === sceneId);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const visible = [...layout.placed.map((p) => p.device), ...layout.unplaced];
  const selectedDevices = visible.filter((d) => selected.has(d.id));
  const states = scene ? sceneStates(data.sceneStates, scene.id) : new Map();
  const clip = useSceneClip();
  const [copyOpen, setCopyOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<number | undefined>(undefined);
  const say = (text: string) => {
    setNotice(text);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 2500);
  };

  const add = (copyFrom: string | null | undefined) => setChosen(addScene(doc, item.id, origin, { ...(scene ? { afterId: scene.id } : {}), ...(copyFrom === null ? { copyFrom: null } : copyFrom ? { copyFrom } : {}) }));
  // neue Szene am aktuellen Zeitpunkt (eingereiht nach der letzten Szene davor, Werte wie diese)
  const addNow = () => {
    if (!audio) return;
    const at = Math.round(audio.currentTime * 10) / 10;
    const before = scenes.filter((x) => (sceneTime(x, plainLines) ?? -1) <= at).pop() ?? scene;
    const id = addScene(doc, item.id, origin, before ? { afterId: before.id, copyFrom: before.id } : {});
    updateScene(doc, id, { atSec: at }, origin);
    setChosen(id);
  };
  const go = (delta: -1 | 1) => {
    const index = scenes.findIndex((x) => x.id === sceneId);
    const next = scenes[index + delta];
    if (!next) return;
    setChosen(next.id);
    setFollow(false);
  };
  const copyValues = () => {
    if (!scene) return;
    setSceneClip({ name: scene.name || '–', values: sceneValues(data.sceneStates, scene.id) });
    say(t.copied(scene.name || '–'));
  };
  const paste = () => {
    if (!scene || !clip || !editable) return;
    replaceSceneValues(doc, clip.values, [scene.id], origin);
    say(t.pasted);
  };
  const selectedIds = selectedDevices.map((d) => d.id);
  const keyAction = (e: KeyboardEvent): boolean => {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'c') {
      if (window.getSelection()?.toString()) return false; // markierten Text normal kopieren
      copyValues();
      return true;
    }
    if (mod && key === 'a') {
      setSelected(new Set(visible.map((d) => d.id)));
      return true;
    }
    if (e.key === 'Escape') {
      if (selected.size === 0) return false;
      setSelected(new Set());
      return true;
    }
    if (!mod && !e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      go(e.key === 'ArrowLeft' ? -1 : 1);
      return true;
    }
    if (!editable) return false;
    if (mod && key === 'v') {
      paste();
      return true;
    }
    if (mod && key === 'd' && scene) {
      setChosen(duplicateScene(doc, scene.id, origin) ?? null);
      return true;
    }
    if (mod) return false;
    if (e.altKey && scene && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      moveScene(doc, scene.id, e.key === 'ArrowLeft' ? -1 : 1, origin);
      return true;
    }
    if (key === 'j' && !e.altKey && audio) {
      addNow();
      return true;
    }
    if (key === 'n' && !e.altKey) {
      add(e.shiftKey ? null : scene?.id);
      return true;
    }
    if (!scene || selectedIds.length === 0) return false;
    if (/^[0-9]$/.test(e.key)) {
      setFixtureValues(doc, scene.id, selectedIds, { dimmer: e.key === '0' ? 100 : Number(e.key) * 10 }, origin);
      return true;
    }
    if (e.key === '-' || e.key === '−') {
      setFixtureValues(doc, scene.id, selectedIds, { dimmer: 0 }, origin);
      return true;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      clearFixtureValues(doc, scene.id, selectedIds, origin);
      return true;
    }
    return false;
  };
  // Tastenkürzel (nicht beim Tippen in Feldern, nicht bei offenem Dialog)
  const keys = useRef(keyAction);
  useEffect(() => {
    keys.current = keyAction;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.defaultPrevented || target?.closest('input, textarea, select, [contenteditable="true"], dialog')) return;
      if (document.querySelector('dialog[open]')) return;
      if (keys.current(e)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (lights.length === 0) return null;

  return (
    <section className="space-y-3" aria-label={t.title} data-testid="regie-scenes">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{t.title}</h3>
        <div className="flex-1" />
        {audio && (
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
            {t.follow}
          </label>
        )}
        {editable && (
          <>
            <Button variant="secondary" className="text-xs" title={`${t.addTitle} (N)`} onClick={() => add(scene?.id)}>
              {t.add}
            </Button>
            {audio && (
              <Button variant="secondary" className="text-xs" title={`${t.addNowTitle} (J)`} onClick={addNow}>
                {t.addNow}
              </Button>
            )}
            <Button variant="ghost" className="text-xs" title={`${t.addEmpty} (Umschalt+N)`} onClick={() => add(null)}>
              {t.addEmpty}
            </Button>
          </>
        )}
        <KeyOverview />
      </div>

      {scenes.length === 0 ? (
        <p className="text-sm text-slate-500">{t.none}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1" role="tablist" aria-label={t.title}>
            {scenes.map((s, index) => {
              const at = sceneTime(s, plainLines);
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={s.id === sceneId}
                  title="← / →"
                  onClick={() => {
                    setChosen(s.id);
                    if (at !== undefined && audio && audio.paused) seek(audio, at);
                  }}
                  data-testid="scene-tab"
                  className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${s.id === sceneId ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 hover:border-sky-400 dark:border-slate-600'}`}
                >
                  {s.id === current && playing && <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" aria-label={t.current} />}
                  <span className="tabular-nums opacity-70">{index + 1}</span>
                  <span className="max-w-40 truncate font-medium">{s.name || '–'}</span>
                  {at !== undefined && <span className="tabular-nums opacity-70">{formatSceneTime(at)}</span>}
                </button>
              );
            })}
          </div>

          {scene && (
            <div className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  aria-label={t.name}
                  className="min-w-40 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-medium dark:border-slate-600 dark:bg-slate-800"
                  value={scene.name}
                  disabled={!editable}
                  onChange={(e) => updateScene(doc, scene.id, { name: e.target.value }, origin)}
                />
                {editable && (
                  <span className="flex">
                    <Button variant="ghost" className="min-h-8 px-1.5" aria-label={t.up} title={`${t.up} (Alt+←)`} disabled={scenes[0]?.id === scene.id} onClick={() => moveScene(doc, scene.id, -1, origin)}>
                      <ArrowLeft {...ICON} />
                    </Button>
                    <Button variant="ghost" className="min-h-8 px-1.5" aria-label={t.down} title={`${t.down} (Alt+→)`} disabled={scenes[scenes.length - 1]?.id === scene.id} onClick={() => moveScene(doc, scene.id, 1, origin)}>
                      <ArrowRight {...ICON} />
                    </Button>
                    <Button variant="ghost" className="min-h-8 px-1.5" aria-label={t.duplicate} title={`${t.duplicate} (${MOD_KEY}+D)`} onClick={() => setChosen(duplicateScene(doc, scene.id, origin) ?? null)}>
                      <Copy {...ICON} />
                    </Button>
                    <Button variant="ghost" className="min-h-8 px-1.5" aria-label={t.copyTo} title={t.copyToTitle} onClick={() => setCopyOpen(true)}>
                      <CopyPlus {...ICON} />
                    </Button>
                    <Button
                      variant="ghost"
                      className="min-h-8 px-1.5"
                      aria-label={t.remove}
                      title={t.remove}
                      onClick={() => {
                        if (window.confirm(t.removeConfirm(scene.name || '–'))) removeScene(doc, scene.id, origin);
                      }}
                    >
                      <Trash2 {...ICON} />
                    </Button>
                  </span>
                )}
                <span className="flex">
                  <Button variant="ghost" className="min-h-8 px-1.5 text-xs" title={`${t.copyValues} (${MOD_KEY}+C)`} onClick={copyValues}>
                    <ClipboardCopy {...ICON} />
                    <span className="hidden sm:inline">{t.copyValues}</span>
                  </Button>
                  {editable && (
                    <Button variant="ghost" className="min-h-8 px-1.5 text-xs" title={`${t.pasteTitle(clip?.name)} (${MOD_KEY}+V)`} disabled={!clip} onClick={paste}>
                      <ClipboardPaste {...ICON} />
                      <span className="hidden sm:inline">{t.paste}</span>
                    </Button>
                  )}
                </span>
                <span role="status" aria-live="polite" className="text-xs text-emerald-700 dark:text-emerald-400">
                  {notice}
                </span>
              </div>

              <div className="flex flex-wrap items-end gap-2 text-sm">
                <span className="pb-1 text-xs font-medium text-slate-500">{t.trigger}</span>
                <SceneTimeInput key={`${scene.id}:${scene.atSec ?? ''}`} value={scene.atSec} editable={editable} onChange={(atSec) => updateScene(doc, scene.id, { atSec }, origin)} />
                {audio && editable && (
                  <Button variant="ghost" className="min-h-8 px-2 text-xs" title={t.nowTitle} onClick={() => updateScene(doc, scene.id, { atSec: Math.round(audio.currentTime * 10) / 10 }, origin)}>
                    {t.now}
                  </Button>
                )}
                {lines.length > 0 && (
                  <label className="flex min-w-48 flex-1 items-center gap-1.5 text-xs">
                    {t.atLine}
                    <select
                      aria-label={t.atLine}
                      className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
                      value={scene.lineId ?? ''}
                      disabled={!editable}
                      onChange={(e) => updateScene(doc, scene.id, { lineId: e.target.value || undefined }, origin)}
                    >
                      <option value="">{t.noLine}</option>
                      {lines.map(({ line, sectionLabel }) => (
                        <option key={line.id} value={line.id}>
                          {sectionLabel}: {line.text.slice(0, 50)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <input
                aria-label={t.notes}
                placeholder={t.notes}
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
                value={scene.notes ?? ''}
                disabled={!editable}
                onChange={(e) => updateScene(doc, scene.id, { notes: e.target.value || undefined }, origin)}
              />

              <div className={`grid gap-4 sm:grid-cols-[9rem_minmax(0,1fr)] ${selectedDevices.length > 0 ? 'xl:grid-cols-[9rem_minmax(0,1fr)_19rem]' : ''}`}>
                <DeviceTypes devices={visible} templates={templates} selected={selected} onSelect={setSelected} />
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="flex-1">{selected.size ? t.selectedCount(selectedDevices.length) : t.selectHint}</span>
                    <Button variant="ghost" className="min-h-7 px-2 text-xs" title={`${t.all} (${MOD_KEY}+A)`} onClick={() => setSelected(new Set(visible.map((d) => d.id)))}>
                      {t.all}
                    </Button>
                    <Button variant="ghost" className="min-h-7 px-2 text-xs" title={`${t.noneSelected} (Esc)`} onClick={() => setSelected(new Set())}>
                      {t.noneSelected}
                    </Button>
                  </div>
                  <SceneGrid
                    grid={data.lightGrid}
                    layout={layout}
                    states={states}
                    targets={data.lightTargets}
                    templates={templates}
                    selected={selected}
                    onToggle={(id) => {
                      const next = new Set(selected);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      setSelected(next);
                    }}
                  />
                </div>
                {/* Werte erst, wenn ein Gerät gewählt ist – sonst hat das Raster die ganze Breite */}
                {selectedDevices.length > 0 && (
                  <aside className="rounded-md border border-slate-200 p-2 sm:col-span-2 xl:col-span-1 dark:border-slate-700" aria-label={texts.light.fixture.title}>
                    <FixturePanel doc={doc} origin={origin} sceneId={scene.id} devices={selectedDevices} templates={templates} states={states} targets={data.lightTargets} editable={editable} />
                  </aside>
                )}
              </div>
            </div>
          )}
        </>
      )}
      {copyOpen && scene && (
        <SceneCopyDialog
          source={scene}
          items={data.show.items.filter((i) => i.kind === 'song' || i.kind === 'play')}
          scenes={data.lightScenes}
          onClose={() => setCopyOpen(false)}
          onSubmit={(ids) => {
            copySceneTo(doc, scene.id, ids, origin);
            setCopyOpen(false);
            say(t.copyDialog.done(ids.length));
          }}
        />
      )}
    </section>
  );
}

/** Gerätearten (Vorlagen) mit Anzahl: Antippen wählt alle dieser Art, mit Strg/⌘ dazu bzw. wieder weg. */
function DeviceTypes({ devices, templates, selected, onSelect }: { devices: DeviceInstance[]; templates: Map<string, { name: string }>; selected: ReadonlySet<string>; onSelect: (next: Set<string>) => void }) {
  const groups = new Map<string, DeviceInstance[]>();
  for (const d of devices) groups.set(d.templateId, [...(groups.get(d.templateId) ?? []), d]);
  const list = [...groups].map(([id, ds]) => ({ id, name: templates.get(id)?.name ?? t.otherType, devices: ds })).sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
  if (list.length === 0) return null;
  return (
    <div className="min-w-0" role="group" aria-label={t.types} data-testid="scene-types">
      <div className="mb-1 hidden text-xs font-medium text-slate-500 sm:block">{t.types}</div>
      <div className="flex gap-1 overflow-x-auto pb-1 sm:flex-col sm:overflow-visible">
        {list.map((g) => {
          const all = g.devices.every((d) => selected.has(d.id));
          const some = !all && g.devices.some((d) => selected.has(d.id));
          return (
            <button
              key={g.id}
              type="button"
              aria-pressed={all}
              title={`${t.typeCount(g.name, g.devices.length)} – ${t.typesHint(MOD_KEY)}`}
              onClick={(e) => {
                const ids = g.devices.map((d) => d.id);
                if (e.ctrlKey || e.metaKey) {
                  const next = new Set(selected);
                  for (const id of ids) {
                    if (all) next.delete(id);
                    else next.add(id);
                  }
                  onSelect(next);
                } else onSelect(new Set(ids));
              }}
              className={`shrink-0 rounded-md border px-2 py-1 text-left text-xs whitespace-nowrap sm:truncate ${
                all ? 'border-sky-600 bg-sky-600 text-white' : some ? 'border-sky-400 bg-sky-50 dark:bg-sky-950' : 'border-slate-300 hover:border-sky-400 dark:border-slate-600'
              }`}
            >
              {t.typeCount(g.name, g.devices.length)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Übersicht der Tastenkürzel – beim Überfahren mit der Maus bzw. beim Fokussieren */
function KeyOverview() {
  const list = t.keyList(MOD_KEY);
  return (
    <span className="group relative hidden sm:inline-flex">
      <button type="button" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={t.keys} title={list.map(([k, v]) => `${k}: ${v}`).join('\n')}>
        <Keyboard {...ICON} />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute top-full right-0 z-30 mt-1 w-72 rounded-md border border-slate-200 bg-white p-2 text-xs opacity-0 shadow-lg transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 dark:border-slate-700 dark:bg-slate-800"
      >
        <span className="mb-1 block font-semibold">{t.keys}</span>
        {list.map(([k, v]) => (
          <span key={k} className="flex gap-2 py-0.5">
            <kbd className="w-28 shrink-0 font-mono text-[11px] text-slate-600 dark:text-slate-300">{k}</kbd>
            <span>{v}</span>
          </span>
        ))}
      </span>
    </span>
  );
}

function seek(el: Playback, sec: number): void {
  el.currentTime = sec;
}

export function SceneTimeInput({ value, editable, onChange }: { value: number | undefined; editable: boolean; onChange: (sec: number | undefined) => void }) {
  const [draft, setDraft] = useState(value !== undefined ? formatSceneTime(value) : '');
  const invalid = draft.trim() !== '' && parseSceneTime(draft) === undefined;
  return (
    <label className="flex items-center gap-1.5 text-xs">
      {t.atTime}
      <input
        aria-label={t.atTime}
        aria-invalid={invalid}
        className={`w-20 rounded-md border bg-white px-2 py-1 text-sm tabular-nums dark:bg-slate-800 ${invalid ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'}`}
        placeholder={t.atTimeHint}
        value={draft}
        disabled={!editable}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => !invalid && onChange(parseSceneTime(draft))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}
