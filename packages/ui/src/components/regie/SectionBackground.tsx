// Hintergrundbild eines Textabschnitts fürs Textfenster: eigenes Bild wählen/entfernen; ohne eigenes Bild
// gilt (abschaltbar) das Bild des letzten früheren Abschnitts mit Bild, sonst das Standardbild aus den Einstellungen.
import { ImageUp, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type * as Y from 'yjs';
import { sectionBackground, setSectionBackground, updateSection, type MediaRef, type ShowSettings, type TextSection } from '@steckplan/core';
import { api, errorMessage } from '../../lib/api';
import { uploadMedia } from '../../lib/mediaUpload';
import { useSession } from '../../lib/session';
import { texts } from '../../texts';
import { ICON } from '../icons';
import { Button } from '../ui';

const t = texts.regie.sectionBackground;

export function SectionBackground({
  projectId,
  doc,
  origin,
  section,
  sections,
  settings,
  editable,
}: {
  projectId: string;
  doc: Y.Doc;
  origin: object;
  section: TextSection;
  /** alle Abschnitte des Eintrags in Reihenfolge */
  sections: TextSection[];
  settings: ShowSettings;
  editable: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const by = useSession((s) => s.session?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const standard = settings.lyricsBackground?.mediaId;
  const shown = sectionBackground(sections, section.id, standard);
  const index = sections.findIndex((s) => s.id === section.id);
  const from = !section.backgroundMediaId && shown && shown !== standard ? [...sections.slice(0, index)].reverse().find((s) => s.backgroundMediaId === shown) : undefined;
  const source = section.backgroundMediaId ? t.own : from ? t.inherited(from.label || '–') : shown ? t.standard : t.none;

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const info = await uploadMedia(projectId, file);
      const ref: MediaRef = { id: info.id, name: file.name, mime: file.type, sizeBytes: info.sizeBytes, sha256: info.sha256, addedAt: new Date().toISOString(), addedBy: by };
      setSectionBackground(doc, section.id, ref, origin);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs" data-testid="section-background">
      <span
        className="h-8 w-14 shrink-0 rounded border border-slate-300 bg-slate-900 bg-cover bg-center dark:border-slate-600"
        style={shown ? { backgroundImage: `url("${api.mediaUrl(projectId, shown)}")` } : undefined}
        title={t.title}
        aria-hidden
      />
      <span className="text-slate-500" data-testid="section-background-source">
        {t.title}: {source}
      </span>
      {editable && (
        <>
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label={`${t.choose}: ${section.label}`}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void upload(file);
            }}
          />
          <Button variant="ghost" className="min-h-7 px-1.5 text-xs" disabled={busy} onClick={() => input.current?.click()}>
            <ImageUp {...ICON} /> {busy ? t.uploading : section.backgroundMediaId ? t.replace : t.choose}
          </Button>
          {section.backgroundMediaId && (
            <Button variant="ghost" className="min-h-7 px-1.5 text-xs" aria-label={`${t.remove}: ${section.label}`} onClick={() => setSectionBackground(doc, section.id, null, origin)}>
              <Trash2 {...ICON} /> {t.remove}
            </Button>
          )}
          {!section.backgroundMediaId && index > 0 && (
            <label className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={section.backgroundInherit !== false}
                aria-label={`${t.inherit}: ${section.label}`}
                onChange={(e) => updateSection(doc, section.id, { backgroundInherit: e.target.checked ? undefined : false }, origin)}
              />
              {t.inherit}
            </label>
          )}
        </>
      )}
      {error && <span className="text-red-700 dark:text-red-400">{error}</span>}
    </div>
  );
}
