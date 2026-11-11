// Regie exportieren (eigene Datei, ohne Medien) und importieren (ersetzen oder anhängen).
import { Download, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import type * as Y from 'yjs';
import { applyRegieImport, parseRegieFile, planRegieImport, serializeRegie, type RegieContent, type RegieImportMode } from '@steckplan/core';
import { asciiFileName } from '../../lib/fileName';
import { texts } from '../../texts';
import { ICON } from '../icons';
import { Banner, Button, Modal } from '../ui';

const t = texts.regie.transfer;
const MAX_BYTES = 20_000_000;

function projectName(doc: Y.Doc): string {
  const name = doc.getMap('meta').get('name');
  return typeof name === 'string' ? name : '';
}

/** Dateiname „<Projekt> - Regie.regie.json“ (ASCII, siehe Downloads im Browser) */
export function regieFileName(name: string): string {
  return `${asciiFileName(name || 'Projekt') || 'Projekt'} - Regie.regie.json`;
}

function exportRegie(doc: Y.Doc): void {
  const name = projectName(doc);
  const blob = new Blob([serializeRegie(doc, name)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = regieFileName(name);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Knöpfe in der Leiste der Regie */
export function RegieTransferButtons({ doc, origin, editable }: { doc: Y.Doc; origin: object; editable: boolean }) {
  const [importing, setImporting] = useState(false);
  return (
    <span className="flex shrink-0">
      <Button variant="secondary" className={`px-2 text-sm ${editable ? 'rounded-r-none' : ''}`} title={t.exportTitle} aria-label={t.export} onClick={() => exportRegie(doc)}>
        <Download {...ICON} />
      </Button>
      {editable && (
        <Button variant="secondary" className="-ml-px rounded-l-none px-2 text-sm" title={t.importTitle} aria-label={t.import} onClick={() => setImporting(true)}>
          <Upload {...ICON} />
        </Button>
      )}
      {importing && <RegieImportDialog doc={doc} origin={origin} onClose={() => setImporting(false)} />}
    </span>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

function NameList({ names }: { names: string[] }) {
  const shown = names.slice(0, 12);
  return (
    <span className="mt-1 block text-xs">
      {shown.join(', ')}
      {names.length > shown.length ? ` … (+${names.length - shown.length})` : ''}
    </span>
  );
}

export function RegieImportDialog({ doc, origin, onClose }: { doc: Y.Doc; origin: object; onClose: () => void }) {
  const [content, setContent] = useState<RegieContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<RegieImportMode>('append');
  const [done, setDone] = useState<number | null>(null);
  const plan = useMemo(() => (content ? planRegieImport(doc, content) : null), [doc, content]);

  async function readFile(file: File) {
    setError(null);
    setContent(null);
    setDone(null);
    if (file.size > MAX_BYTES) {
      setError(t.tooLarge);
      return;
    }
    try {
      const parsed = parseRegieFile(await file.text());
      setContent(parsed);
      // leere Regie: Ersetzen ist das Naheliegende (übernimmt auch die Einstellungen)
      setMode(planRegieImport(doc, parsed).existingItems === 0 ? 'replace' : 'append');
    } catch (e) {
      setError(e instanceof Error ? e.message : texts.common.unknownError);
    }
  }

  const missing = plan ? plan.missingDevices.length + plan.missingPeople.length + plan.missingMedia.length : 0;

  return (
    <Modal title={t.import} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">{t.intro}</p>
        <label className="inline-flex cursor-pointer items-center rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800">
          {t.chooseFile}
          <input
            type="file"
            accept=".json,application/json"
            className="sr-only"
            aria-label={t.chooseFile}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void readFile(file);
              e.target.value = '';
            }}
          />
        </label>
        {error && <Banner tone="error">{error}</Banner>}
        {content && plan && done === null && (
          <>
            <div className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700" data-testid="regie-import-summary">
              <p className="font-medium">{t.source(content.projectName, formatDate(content.exportedAt))}</p>
              <p className="text-slate-600 dark:text-slate-300">{t.counts(plan.counts.items, plan.counts.sections, plan.counts.lightScenes, plan.counts.soundScenes)}</p>
            </div>
            {missing === 0 ? (
              <Banner tone="success">{t.allMatched}</Banner>
            ) : (
              <Banner tone="warn">
                <span className="block space-y-2">
                  {plan.missingDevices.length > 0 && (
                    <span className="block">
                      {t.missingDevices(plan.missingDevices.length)}
                      <NameList names={plan.missingDevices} />
                    </span>
                  )}
                  {plan.missingPeople.length > 0 && (
                    <span className="block">
                      {t.missingPeople(plan.missingPeople.length)}
                      <NameList names={plan.missingPeople} />
                    </span>
                  )}
                  {plan.missingMedia.length > 0 && (
                    <span className="block">
                      {t.missingMedia(plan.missingMedia.length)}
                      <NameList names={plan.missingMedia} />
                    </span>
                  )}
                </span>
              </Banner>
            )}
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium">{t.mode}</legend>
              {(['append', 'replace'] as const).map((m) => (
                <label key={m} className="flex items-start gap-2 text-sm">
                  <input type="radio" name="regie-import-mode" className="mt-1" checked={mode === m} onChange={() => setMode(m)} />
                  <span>
                    <span className="font-medium">{m === 'replace' ? t.replace : t.append}</span>
                    <span className="block text-xs text-slate-500">{m === 'replace' ? t.replaceHint(plan.existingItems) : t.appendHint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          </>
        )}
        {done !== null && <Banner tone="success">{t.done(done)}</Banner>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{done !== null ? texts.common.close : texts.common.cancel}</Button>
          {done === null && (
            <Button
              variant={mode === 'replace' && plan?.existingItems ? 'danger' : 'primary'}
              disabled={!content || !plan}
              onClick={() => {
                if (!content || !plan) return;
                applyRegieImport(doc, content, plan, mode, origin);
                setDone(plan.counts.items);
              }}
            >
              {t.apply(mode)}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
