// Tonszenen eines Punkts: Szenen wie beim Licht (Name, Auslöser per Zeitpunkt oder Textzeile) mit formatierter Notiz.
// „Szenen vom Licht übernehmen“ legt die Lichtszenen als Tonszenen an bzw. gleicht Name und Auslöser an.
import { ArrowLeft, ArrowRight, Lightbulb, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type * as Y from 'yjs';
import { addSoundScene, importLightScenes, itemScenes, itemSoundScenes, moveSoundScene, removeSoundScene, sceneTime, updateSoundScene, type ShowItem, type TimedLine } from '@steckplan/core';
import type { ProjectData } from '../../lib/useProjectData';
import type { Playback } from '../../lib/transport';
import { texts } from '../../texts';
import { ICON } from '../icons';
import { Button } from '../ui';
import { RichTextEditor } from './RichTextEditor';
import { SceneTimeline } from './SceneTimeline';
import { formatSceneTime, SceneTimeInput } from './ScenesSection';
import { seekAudio } from './SongMedia';

const t = texts.regie.sound;
const ts = texts.light.scenes;

export function SoundScenesSection({ doc, origin, item, data, lines, music, editable, waveSrc }: { doc: Y.Doc; origin: object; item: ShowItem; data: ProjectData; lines: TimedLine[]; music: Playback | null; editable: boolean; waveSrc?: string }) {
  const scenes = itemSoundScenes(data.soundScenes, item.id);
  const lightCount = itemScenes(data.lightScenes, item.id).length;
  const plainLines = lines.map((l) => l.line);
  const [chosen, setChosen] = useState<string | null>(null);
  const scene = scenes.find((s) => s.id === chosen) ?? scenes[0];
  const [notice, setNotice] = useState('');

  return (
    <section className="space-y-3" aria-label={t.scenes} data-testid="sound-scenes">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{t.scenes}</h3>
        <span role="status" className="text-xs text-emerald-700 dark:text-emerald-400">
          {notice}
        </span>
        <div className="flex-1" />
        {editable && (
          <>
            {lightCount > 0 && (
              <Button
                variant="secondary"
                className="text-xs"
                title={t.importTitle}
                onClick={() => {
                  const created = importLightScenes(doc, item.id, origin);
                  setNotice(t.imported(created));
                }}
              >
                <Lightbulb {...ICON} /> {t.importLight}
              </Button>
            )}
            <Button variant="secondary" className="text-xs" onClick={() => setChosen(addSoundScene(doc, item.id, origin, scene ? { afterId: scene.id } : {}))}>
              {ts.add}
            </Button>
          </>
        )}
      </div>

      {scenes.length > 0 && (
        <SceneTimeline
          tone="sound"
          scenes={scenes.map((s, i) => ({ id: s.id, number: i + 1, name: s.name, at: sceneTime(s, plainLines) }))}
          music={music}
          src={waveSrc}
          audioOffset={item.audioOffsetSec ?? 0}
          selectedId={scene?.id}
          onSelect={setChosen}
          onMove={(changes) => doc.transact(() => changes.forEach((c) => updateSoundScene(doc, c.id, { atSec: c.atSec }, origin)), origin)}
          editable={editable}
        />
      )}

      {scenes.length === 0 ? (
        <p className="text-sm text-slate-500">{lightCount > 0 ? t.noScenesLight : t.noScenes}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1" role="tablist" aria-label={t.scenes}>
            {scenes.map((s, index) => {
              const at = sceneTime(s, plainLines);
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={s.id === scene?.id}
                  onClick={() => {
                    setChosen(s.id);
                    if (at !== undefined && music && music.paused) seekAudio(music, at);
                  }}
                  data-testid="sound-scene-tab"
                  className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${s.id === scene?.id ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 hover:border-sky-400 dark:border-slate-600'}`}
                >
                  <span className="tabular-nums opacity-70">{index + 1}</span>
                  <span className="max-w-40 truncate font-medium">{s.name || '–'}</span>
                  {at !== undefined && <span className="tabular-nums opacity-70">{formatSceneTime(at)}</span>}
                  {s.notes && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-label={t.hasNotes} />}
                </button>
              );
            })}
          </div>

          {scene && (
            <div className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  aria-label={ts.name}
                  className="min-w-40 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-medium dark:border-slate-600 dark:bg-slate-800"
                  value={scene.name}
                  disabled={!editable}
                  onChange={(e) => updateSoundScene(doc, scene.id, { name: e.target.value }, origin)}
                />
                {editable && (
                  <span className="flex">
                    <Button variant="ghost" className="min-h-8 px-1.5" aria-label={ts.up} title={ts.up} disabled={scenes[0]?.id === scene.id} onClick={() => moveSoundScene(doc, scene.id, -1, origin)}>
                      <ArrowLeft {...ICON} />
                    </Button>
                    <Button variant="ghost" className="min-h-8 px-1.5" aria-label={ts.down} title={ts.down} disabled={scenes.at(-1)?.id === scene.id} onClick={() => moveSoundScene(doc, scene.id, 1, origin)}>
                      <ArrowRight {...ICON} />
                    </Button>
                    <Button
                      variant="ghost"
                      className="min-h-8 px-1.5"
                      aria-label={ts.remove}
                      title={ts.remove}
                      onClick={() => {
                        if (window.confirm(ts.removeConfirm(scene.name || '–'))) removeSoundScene(doc, scene.id, origin);
                      }}
                    >
                      <Trash2 {...ICON} />
                    </Button>
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-end gap-2 text-sm">
                <span className="pb-1 text-xs font-medium text-slate-500">{ts.trigger}</span>
                <SceneTimeInput key={`${scene.id}:${scene.atSec ?? ''}`} value={scene.atSec} editable={editable} onChange={(atSec) => updateSoundScene(doc, scene.id, { atSec }, origin)} />
                {music && editable && (
                  <Button variant="ghost" className="min-h-8 px-2 text-xs" title={ts.nowTitle} onClick={() => updateSoundScene(doc, scene.id, { atSec: Math.round(music.currentTime * 10) / 10 }, origin)}>
                    {ts.now}
                  </Button>
                )}
                {lines.length > 0 && (
                  <label className="flex min-w-48 flex-1 items-center gap-1.5 text-xs">
                    {ts.atLine}
                    <select
                      aria-label={ts.atLine}
                      className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
                      value={scene.lineId ?? ''}
                      disabled={!editable}
                      onChange={(e) => updateSoundScene(doc, scene.id, { lineId: e.target.value || undefined }, origin)}
                    >
                      <option value="">{ts.noLine}</option>
                      {lines.map(({ line, sectionLabel }) => (
                        <option key={line.id} value={line.id}>
                          {sectionLabel}: {line.text.slice(0, 50)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <RichTextEditor key={scene.id} value={scene.notes} editable={editable} minHeight="min-h-48" label={t.sceneNotes(scene.name || '–')} onChange={(html) => updateSoundScene(doc, scene.id, { notes: html || undefined }, origin)} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
