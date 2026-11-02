// Filterleiste: Kategorie, Besitzer, Anhänger, Stativ/Traverse – und „Einfärben nach …“.
import { X } from 'lucide-react';
import { ICON } from './icons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { EMPTY_FILTER, isFilterActive, type Filter, type Library } from '@steckplan/core';
import { useEditor, type ColorMode } from '../lib/editor';
import type { ProjectData } from '../lib/useProjectData';
import { texts } from '../texts';
import { Button } from './ui';

const f = texts.filter;

interface Option {
  id: string;
  label: string;
  color?: string;
}

function MultiSelect({ label, options, value, onChange }: { label: string; options: Option[]; value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  const active = value.length > 0;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`rounded-md border px-2 py-1 text-xs ${active ? 'border-sky-400 bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-100' : 'border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'}`}
      >
        {label}
        {active ? ` (${value.length})` : ''} ▾
      </button>
      {open && (
        <div role="group" aria-label={label} className="absolute top-full left-0 z-20 mt-1 max-h-72 w-56 overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {options.length === 0 && <div className="p-2 text-xs text-slate-500">{f.noOptions}</div>}
          {options.map((o) => (
            <label key={o.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-700">
              <input type="checkbox" checked={value.includes(o.id)} onChange={(e) => onChange(e.target.checked ? [...value, o.id] : value.filter((v) => v !== o.id))} />
              {o.color && <span className="h-3 w-3 rounded border border-slate-300" style={{ backgroundColor: o.color }} />}
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function FilterBar({ library, data, showColorMode = true, extra }: { library: Library | null; data: ProjectData; showColorMode?: boolean; extra?: ReactNode }) {
  const filter = useEditor((s) => s.filter);
  const setFilter = useEditor((s) => s.setFilter);
  const colorMode = useEditor((s) => s.colorMode);
  const setColorMode = useEditor((s) => s.setColorMode);
  const showDmx = useEditor((s) => s.showDmx);
  const setShowDmx = useEditor((s) => s.setShowDmx);
  const templates = new Map((library?.templates ?? []).map((t) => [t.id, t]));
  const master = (list: { id: string; name: string; color?: string; archived?: boolean }[] | undefined, none: string): Option[] => [
    ...(list ?? []).map((e) => ({ id: e.id, label: e.name + (e.archived ? ' (archiviert)' : ''), color: e.color })),
    { id: '', label: none },
  ];
  const carriers: Option[] = data.devices
    .filter((d) => ['stand', 'truss'].includes(templates.get(d.templateId)?.kind ?? ''))
    .map((d) => ({ id: d.id, label: d.label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'de'));
  const set = (patch: Partial<Filter>) => setFilter({ ...filter, ...patch });
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-900" aria-label={f.title} role="group">
      <span className="text-xs text-slate-500">{f.title}:</span>
      <MultiSelect label={f.category} options={master(library?.masterData.categories, f.noCategory)} value={filter.categories} onChange={(categories) => set({ categories })} />
      <MultiSelect label={f.owner} options={master(library?.masterData.owners, f.noOwner)} value={filter.owners} onChange={(owners) => set({ owners })} />
      <MultiSelect label={f.trailer} options={master(library?.masterData.trailers, f.noTrailer)} value={filter.trailers} onChange={(trailers) => set({ trailers })} />
      <MultiSelect label={f.carrier} options={carriers} value={filter.carriers} onChange={(c) => set({ carriers: c })} />
      {isFilterActive(filter) && (
        <Button variant="ghost" className="min-h-7 px-2 py-0.5 text-xs" onClick={() => setFilter(EMPTY_FILTER)}>
          <X {...ICON} /> {f.reset}
        </Button>
      )}
      <div className="ml-auto" />
      {extra}
      {showColorMode && (
        <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={showDmx} onChange={(e) => setShowDmx(e.target.checked)} />
          {texts.techLists.showDmx}
        </label>
      )}
      {showColorMode && (
        <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
          {f.colorBy}
          <select className="rounded-md border border-slate-300 bg-white px-1 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-800" value={colorMode} onChange={(e) => setColorMode(e.target.value as ColorMode)} aria-label={f.colorBy}>
            {(['device', 'category', 'owner', 'trailer'] as const).map((m) => (
              <option key={m} value={m}>
                {f.colorModes[m]}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
