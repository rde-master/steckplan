// Lichtszenen eines Lieds/Schauspiels: Szenen-Leiste, Auslöser, Raster mit den Geräten, Werte der gewählten Geräte.
import { ArrowLeft, ArrowRight, Copy, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type * as Y from 'yjs';
import {
  addScene,
  currentSceneId,
  duplicateScene,
  gridLayout,
  itemScenes,
  lightDevices,
  moveScene,
  removeScene,
  sceneStates,
  sceneTime,
  updateScene,
  type Library,
  type ShowItem,
  type TimedLine,
} from '@steckplan/core';
import type { ProjectData } from '../../lib/useProjectData';
import { texts } from '../../texts';
import { ICON } from '../icons';
import { Button } from '../ui';
import { FixturePanel } from './FixturePanel';
import { SceneGrid } from './SceneGrid';

const t = texts.light.scenes;

/** „1:12.5“ */
export function formatSceneTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0').replace(/\.0$/, '')}`;
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
  audio: HTMLAudioElement | null;
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

  if (lights.length === 0) return null;

  const add = (copyFrom: string | null | undefined) => setChosen(addScene(doc, item.id, origin, { ...(scene ? { afterId: scene.id } : {}), ...(copyFrom === null ? { copyFrom: null } : copyFrom ? { copyFrom } : {}) }));

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
            <Button variant="secondary" className="text-xs" title={t.addTitle} onClick={() => add(scene?.id)}>
              {t.add}
            </Button>
            <Button variant="ghost" className="text-xs" onClick={() => add(null)}>
              {t.addEmpty}
            </Button>
          </>
        )}
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
                    <Button variant="ghost" className="min-h-8 px-1.5" aria-label={t.up} disabled={scenes[0]?.id === scene.id} onClick={() => moveScene(doc, scene.id, -1, origin)}>
                      <ArrowLeft {...ICON} />
                    </Button>
                    <Button variant="ghost" className="min-h-8 px-1.5" aria-label={t.down} disabled={scenes[scenes.length - 1]?.id === scene.id} onClick={() => moveScene(doc, scene.id, 1, origin)}>
                      <ArrowRight {...ICON} />
                    </Button>
                    <Button variant="ghost" className="min-h-8 px-1.5" aria-label={t.duplicate} onClick={() => setChosen(duplicateScene(doc, scene.id, origin) ?? null)}>
                      <Copy {...ICON} />
                    </Button>
                    <Button
                      variant="ghost"
                      className="min-h-8 px-1.5"
                      aria-label={t.remove}
                      onClick={() => {
                        if (window.confirm(t.removeConfirm(scene.name || '–'))) removeScene(doc, scene.id, origin);
                      }}
                    >
                      <Trash2 {...ICON} />
                    </Button>
                  </span>
                )}
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

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="flex-1">{selected.size ? t.selectedCount(selectedDevices.length) : t.selectHint}</span>
                    <Button variant="ghost" className="min-h-7 px-2 text-xs" onClick={() => setSelected(new Set(visible.map((d) => d.id)))}>
                      {t.all}
                    </Button>
                    <Button variant="ghost" className="min-h-7 px-2 text-xs" onClick={() => setSelected(new Set())}>
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
                <aside className="rounded-md border border-slate-200 p-2 dark:border-slate-700" aria-label={texts.light.fixture.title}>
                  <FixturePanel doc={doc} origin={origin} sceneId={scene.id} devices={selectedDevices} templates={templates} states={states} targets={data.lightTargets} editable={editable} />
                </aside>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function seek(el: HTMLAudioElement, sec: number): void {
  el.currentTime = sec;
}

function SceneTimeInput({ value, editable, onChange }: { value: number | undefined; editable: boolean; onChange: (sec: number | undefined) => void }) {
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
