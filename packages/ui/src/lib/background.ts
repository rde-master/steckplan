// Hintergrund-Grundriss importieren: Bild verkleinern bzw. PDF-Seite rendern → data-URL.
import type { Background } from '@steckplan/core';

export const MAX_BACKGROUND_PX = 4096;

function canvasToBackground(canvas: HTMLCanvasElement): Pick<Background, 'image' | 'widthPx' | 'heightPx'> {
  return { image: canvas.toDataURL('image/jpeg', 0.85), widthPx: canvas.width, heightPx: canvas.height };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Das Bild konnte nicht gelesen werden.'));
    img.src = url;
  });
}

export async function imageToBackground(file: File): Promise<Pick<Background, 'image' | 'widthPx' | 'heightPx'>> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, MAX_BACKGROUND_PX / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvasToBackground(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface LoadedPdf {
  pages: number;
  render(page: number): Promise<Pick<Background, 'image' | 'widthPx' | 'heightPx'>>;
}

export async function loadPdf(file: File): Promise<LoadedPdf> {
  const { openPdf, renderPdfPage } = await import('./pdf');
  let pdf;
  try {
    pdf = await openPdf(await file.arrayBuffer());
  } catch {
    throw new Error('Das PDF konnte nicht gelesen werden.');
  }
  return {
    pages: pdf.numPages,
    render: async (page) => canvasToBackground(await renderPdfPage(pdf, page, MAX_BACKGROUND_PX)),
  };
}

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}
