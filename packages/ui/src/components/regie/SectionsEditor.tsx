// Texte eines Ablauf-Eintrags: je Abschnitt Art, Bezeichnung und ein Textfeld (jede Zeile = eine Textzeile).
// Beim Tippen bleibt der Text im Feld so, wie er getippt wird; ins Dokument geht die zerlegte Fassung
// (Zeilen mit stabilen Kennungen, beim Schauspiel Rollen). Erst nach dem Verlassen zeigt das Feld wieder den Stand aus dem Dokument.
import { ArrowDown, ArrowUp, Copy, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type * as Y from 'yjs';
import {
  addSection,
  duplicateSection,
  moveSection,
  nextSectionLabel,
  removeSection,
  SECTION_KINDS,
  sectionToText,
  setSectionText,
  updateSection,
  type SectionKind,
  type ShowItem,
  type TextSection,
} from '@steckplan/core';
import { texts } from '../../texts';
import { ICON } from '../icons';
import { Button } from '../ui';

const t = texts.regie;

const inputClass = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-sm disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:disabled:bg-slate-900';

export function SectionsEditor({ doc, origin, item, sections, editable }: { doc: Y.Doc; origin: object; item: ShowItem; sections: TextSection[]; editable: boolean }) {
  const play = item.kind === 'play';
  const defaultKind: SectionKind = play ? 'scene' : item.kind === 'song' ? 'verse' : 'other';
  return (
    <div className="space-y-3">
      {sections.length === 0 && <p className="text-sm text-slate-500">{t.noText}</p>}
      {sections.map((section, index) => (
        <div key={section.id} className="rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900" data-testid="regie-section">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <select
              aria-label={`${t.sectionKind} ${section.label}`}
              className={inputClass}
              value={section.kind}
              disabled={!editable}
              onChange={(e) => {
                const kind = e.target.value as SectionKind;
                // Bezeichnung mitziehen, solange sie noch die automatische ist
                const auto = section.label === '' || section.label.startsWith(t.sectionKinds[section.kind]);
                updateSection(doc, section.id, { kind, ...(auto ? { label: nextSectionLabel(kind, sections.filter((s) => s.id !== section.id)) } : {}) }, origin);
              }}
            >
              {SECTION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t.sectionKinds[k]}
                </option>
              ))}
            </select>
            <input
              aria-label={t.sectionLabel}
              className={`${inputClass} min-w-28 flex-1 font-medium`}
              value={section.label}
              disabled={!editable}
              onChange={(e) => updateSection(doc, section.id, { label: e.target.value }, origin)}
            />
            <span className="text-xs text-slate-500">{t.lines(section.lines.length)}</span>
            {editable && (
              <span className="flex">
                <Button variant="ghost" className="min-h-8 px-1.5" aria-label={`${t.up}: ${section.label}`} disabled={index === 0} onClick={() => moveSection(doc, section.id, -1, origin)}>
                  <ArrowUp {...ICON} />
                </Button>
                <Button variant="ghost" className="min-h-8 px-1.5" aria-label={`${t.down}: ${section.label}`} disabled={index === sections.length - 1} onClick={() => moveSection(doc, section.id, 1, origin)}>
                  <ArrowDown {...ICON} />
                </Button>
                <Button variant="ghost" className="min-h-8 px-1.5" aria-label={`${t.duplicate}: ${section.label}`} onClick={() => duplicateSection(doc, section.id, origin)}>
                  <Copy {...ICON} />
                </Button>
                <Button variant="ghost" className="min-h-8 px-1.5" aria-label={`${t.remove}: ${section.label}`} onClick={() => removeSection(doc, section.id, origin)}>
                  <Trash2 {...ICON} />
                </Button>
              </span>
            )}
          </div>
          <SectionText doc={doc} origin={origin} section={section} item={item} editable={editable} />
        </div>
      ))}
      {editable && (
        <Button variant="secondary" className="text-xs" onClick={() => addSection(doc, item.id, defaultKind, nextSectionLabel(defaultKind, sections), origin)}>
          {t.addSection}
        </Button>
      )}
    </div>
  );
}

function SectionText({ doc, origin, section, item, editable }: { doc: Y.Doc; origin: object; section: TextSection; item: ShowItem; editable: boolean }) {
  const play = item.kind === 'play';
  const stored = sectionToText(section.lines, item.roles ?? [], play);
  // null = nicht in Bearbeitung → Stand aus dem Dokument zeigen (auch Änderungen anderer)
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? stored;
  const rows = Math.min(24, Math.max(3, value.split('\n').length + 1));
  return (
    <textarea
      aria-label={t.sectionText(section.label)}
      className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 font-[inherit] text-sm leading-relaxed focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-700 dark:bg-slate-800 dark:focus:bg-slate-900"
      rows={rows}
      value={value}
      readOnly={!editable}
      placeholder={play ? t.sectionPlayHint : undefined}
      spellCheck
      onFocus={() => editable && setDraft(stored)}
      onChange={(e) => {
        setDraft(e.target.value);
        setSectionText(doc, section.id, e.target.value, origin);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}
