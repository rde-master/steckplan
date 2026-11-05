// „Kopieren nach …“: alle Szenen aller Lieder und Stücke zum Ankreuzen; die gewählten bekommen die Werte der Quelle.
import { useState } from 'react';
import { itemScenes, type LightScene, type ShowItem } from '@steckplan/core';
import { texts } from '../../texts';
import { Button, Modal } from '../ui';

const t = texts.light.scenes.copyDialog;

export function SceneCopyDialog({ source, items, scenes, onSubmit, onClose }: { source: LightScene; items: ShowItem[]; scenes: LightScene[]; onSubmit: (ids: string[]) => void; onClose: () => void }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const toggle = (ids: string[], on: boolean) => {
    const next = new Set(picked);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    setPicked(next);
  };
  return (
    <Modal
      title={t.title(source.name || '–')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button variant="primary" disabled={picked.size === 0} onClick={() => onSubmit([...picked])}>
            {t.submit(picked.size)}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">{t.hint}</p>
      <ul className="space-y-3" data-testid="scene-copy-list">
        {items.map((item) => {
          const own = itemScenes(scenes, item.id);
          const choosable = own.filter((s) => s.id !== source.id).map((s) => s.id);
          const all = choosable.length > 0 && choosable.every((id) => picked.has(id));
          return (
            <li key={item.id}>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={all} disabled={choosable.length === 0} onChange={(e) => toggle(choosable, e.target.checked)} aria-label={`${item.title || texts.regie.untitled}: ${t.allOfItem}`} />
                <span className="min-w-0 flex-1 truncate">{item.title || texts.regie.untitled}</span>
                {own.length === 0 && <span className="text-xs font-normal text-slate-500">{t.noScenes}</span>}
              </label>
              {own.length > 0 && (
                <ul className="mt-1 ml-6 grid gap-x-3 gap-y-0.5 sm:grid-cols-2">
                  {own.map((s, i) => (
                    <li key={s.id}>
                      <label className={`flex items-center gap-2 text-sm ${s.id === source.id ? 'text-slate-400' : ''}`}>
                        <input type="checkbox" checked={picked.has(s.id)} disabled={s.id === source.id} onChange={(e) => toggle([s.id], e.target.checked)} aria-label={`${item.title || texts.regie.untitled}: ${s.name || i + 1}`} />
                        <span className="tabular-nums opacity-70">{i + 1}</span>
                        <span className="min-w-0 truncate">{s.name || '–'}</span>
                        {s.id === source.id && <span className="text-xs">({t.source})</span>}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
