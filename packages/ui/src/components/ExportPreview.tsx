// Live-Vorschau im Export-Dialog: das PDF genau so, wie es heruntergeladen wird (Seiten blättern, vergrößern),
// bei CSV-fähigen Listen wahlweise die Tabelle.
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { errorMessage } from '../lib/api';
import type { DocDefinition } from '../pdf/documents';
import { parseCsv } from '../pdf/sorting';
import { texts } from '../texts';
import { ICON } from './icons';
import { Button, Spinner } from './ui';

const t = texts.exportPreview;
const DEBOUNCE_MS = 500;

type PdfProxy = Awaited<ReturnType<typeof import('../lib/pdf').openPdf>>;

export function ExportPreview({
  makeDoc,
  makeCsv,
  version,
}: {
  /** baut die PDF-Definition (wie beim Herunterladen) */
  makeDoc: () => Promise<DocDefinition>;
  /** CSV-Text, falls es für diese Liste eine CSV gibt */
  makeCsv?: () => string;
  /** ändert sich bei jeder Option → Vorschau neu erzeugen */
  version: string;
}) {
  const [mode, setMode] = useState<'pdf' | 'csv'>('pdf');
  const [pdf, setPdf] = useState<PdfProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef({ makeDoc, makeCsv });
  useEffect(() => {
    latest.current = { makeDoc, makeCsv };
  });
  const csvAvailable = !!makeCsv;
  const showCsv = mode === 'csv' && csvAvailable;

  // PDF neu erzeugen, wenn sich die Optionen ändern (verzögert, damit Tippen nicht jedes Mal rendert)
  useEffect(() => {
    if (showCsv) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setBusy(true);
      setError(null);
      try {
        const doc = await latest.current.makeDoc();
        const [{ createPdfBlob }, { openPdf }] = await Promise.all([import('../pdf/generate'), import('../lib/pdf')]);
        const blob = await createPdfBlob(doc);
        const proxy = await openPdf(await blob.arrayBuffer());
        if (cancelled) return;
        setPdf(proxy);
        setPage((p) => Math.min(p, proxy.numPages));
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [version, showCsv]);

  // aktuelle Seite als Bild
  useEffect(() => {
    if (!pdf || showCsv) return;
    let cancelled = false;
    void (async () => {
      const { renderPdfPage } = await import('../lib/pdf');
      const canvas = await renderPdfPage(pdf, Math.min(page, pdf.numPages), 1400);
      if (!cancelled) setImage(canvas.toDataURL('image/png'));
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, page, showCsv]);

  const pages = pdf?.numPages ?? 0;
  const csvRows = showCsv && makeCsv ? parseCsv(makeCsv()) : [];

  return (
    <section className="flex min-h-[24rem] flex-col rounded-md border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-900" aria-label={t.title}>
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.title}</span>
        {csvAvailable && (
          <div className="flex rounded-md border border-slate-300 text-xs dark:border-slate-600" role="radiogroup" aria-label={t.title}>
            {(['pdf', 'csv'] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`px-2 py-1 ${mode === m ? 'bg-sky-600 text-white' : ''}`}>
                {m.toUpperCase()}
              </button>
            ))}
          </div>
        )}
        <div className="flex-1" />
        {!showCsv && pages > 0 && (
          <>
            <Button variant="ghost" className="min-h-8 px-2" aria-label={t.prev} disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft {...ICON} />
            </Button>
            <span className="text-xs tabular-nums text-slate-600 dark:text-slate-300" data-testid="preview-pages">
              {t.page(Math.min(page, pages), pages)}
            </span>
            <Button variant="ghost" className="min-h-8 px-2" aria-label={t.next} disabled={page >= pages} onClick={() => setPage(page + 1)}>
              <ChevronRight {...ICON} />
            </Button>
            <Button variant="ghost" className="min-h-8 px-2" aria-label={t.zoomOut} disabled={zoom <= 1} onClick={() => setZoom(Math.max(1, zoom - 0.5))}>
              <ZoomOut {...ICON} />
            </Button>
            <Button variant="ghost" className="min-h-8 px-2" aria-label={t.zoomIn} disabled={zoom >= 3} onClick={() => setZoom(Math.min(3, zoom + 0.5))}>
              <ZoomIn {...ICON} />
            </Button>
          </>
        )}
      </div>
      <div className="relative flex-1 overflow-auto p-3">
        {showCsv ? (
          <div className="overflow-auto rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
            <table className="w-full text-xs" data-testid="preview-csv">
              <tbody>
                {csvRows.slice(0, 200).map((r, i) => (
                  <tr key={i} className={i === 0 ? 'bg-slate-100 font-semibold dark:bg-slate-800' : 'border-t border-slate-100 dark:border-slate-800'}>
                    {r.map((c, j) => (
                      <td key={j} className="whitespace-nowrap px-2 py-1">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {csvRows.length > 200 && <p className="p-2 text-xs text-slate-500">{t.moreRows(csvRows.length - 200)}</p>}
          </div>
        ) : error ? (
          <p className="p-4 text-sm text-red-700">{error}</p>
        ) : image ? (
          <img src={image} alt={t.alt(Math.min(page, pages))} className="mx-auto bg-white shadow-md" style={{ width: `${zoom * 100}%`, maxWidth: zoom === 1 ? '100%' : 'none' }} data-testid="preview-image" />
        ) : (
          <Spinner label={t.creating} />
        )}
        {busy && image && !showCsv && <div className="absolute top-3 right-4 rounded bg-white/90 px-2 py-0.5 text-xs text-slate-500 shadow dark:bg-slate-800/90">{t.updating}</div>}
      </div>
    </section>
  );
}
