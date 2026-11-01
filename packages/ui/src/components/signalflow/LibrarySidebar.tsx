// Bibliothek als Seitenleiste: Vorlagen auf die Zeichenfläche ziehen oder mit ＋ hinzufügen.
import { useState } from 'react';
import { isMulticore, isPlaceableInSignalFlow, TEMPLATE_KIND_LABELS, type Library, type Template } from '@steckplan/core';
import { useEditor } from '../../lib/editor';
import { texts } from '../../texts';
import { TextInput } from '../ui';

const s = texts.signalflow;

export function LibrarySidebar({
  library,
  editable,
  onAdd,
  mode = 'signalflow',
}: {
  library: Library | null;
  editable: boolean;
  onAdd: (template: Template) => void;
  mode?: 'signalflow' | 'stageplan';
}) {
  const [query, setQuery] = useState('');
  const showStageObjectsSetting = useEditor((st) => st.showStageObjects);
  const setShowStageObjects = useEditor((st) => st.setShowStageObjects);
  const showStageObjects = mode === 'stageplan' || showStageObjectsSetting;
  const templates = (library?.templates ?? [])
    .filter((t) => (mode === 'stageplan' ? t.kind !== 'cableType' : isPlaceableInSignalFlow(t)))
    .filter((t) => showStageObjects || !['stageElement', 'truss', 'stand'].includes(t.kind))
    .filter((t) => !query || `${t.name} ${t.manufacturer ?? ''}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  const groups: { label: string; items: Template[] }[] = [
    { label: TEMPLATE_KIND_LABELS.device.plural, items: templates.filter((t) => t.kind === 'device') },
    { label: s.multicores, items: templates.filter(isMulticore) },
    { label: TEMPLATE_KIND_LABELS.stageElement.plural, items: templates.filter((t) => t.kind === 'stageElement') },
    { label: TEMPLATE_KIND_LABELS.truss.plural, items: templates.filter((t) => t.kind === 'truss') },
    { label: TEMPLATE_KIND_LABELS.stand.plural, items: templates.filter((t) => t.kind === 'stand') },
  ].filter((g) => g.items.length > 0);

  return (
    <aside className="flex h-full flex-col gap-2 overflow-hidden p-2" aria-label={s.library}>
      <TextInput type="search" placeholder={texts.library.search} aria-label={s.searchLibrary} value={query} onChange={(e) => setQuery(e.target.value)} />
      {mode === 'signalflow' && (
        <label className="flex items-center gap-2 px-1 text-xs text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={showStageObjects} onChange={(e) => setShowStageObjects(e.target.checked)} />
          {s.showStageObjects}
        </label>
      )}
      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 && <p className="p-2 text-xs text-slate-500">{s.libraryEmpty}</p>}
        {groups.map((group) => (
          <div key={group.label} className="mb-3">
            <div className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{group.label}</div>
            <ul className="space-y-1">
              {group.items.map((template) => (
                <li
                  key={template.id}
                  draggable={editable}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-steckplan-template', template.id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  className={`flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 ${editable ? 'cursor-grab' : ''}`}
                  title={editable ? s.dragHint : undefined}
                >
                  <span className="h-3.5 w-3.5 shrink-0 rounded border border-slate-300 dark:border-slate-600" style={{ backgroundColor: template.defaultColor ?? '#cbd5e1' }} />
                  <span className="min-w-0 flex-1 truncate">{template.name}</span>
                  {editable && (
                    <button
                      type="button"
                      className="rounded px-1.5 text-base leading-none text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
                      aria-label={`${s.add}: ${template.name}`}
                      onClick={() => onAdd(template)}
                    >
                      ＋
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  );
}
