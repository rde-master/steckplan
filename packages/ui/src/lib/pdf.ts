// PDF-Grundriss: Seite rendern (wird nur bei Bedarf geladen – große Bibliothek).
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function openPdf(data: ArrayBuffer): Promise<pdfjs.PDFDocumentProxy> {
  return pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
}

/** Rendert eine Seite so, dass die längere Seite maxPx Pixel hat. */
export async function renderPdfPage(pdf: pdfjs.PDFDocumentProxy, pageNumber: number, maxPx: number): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = maxPx / Math.max(base.width, base.height);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return canvas;
}
