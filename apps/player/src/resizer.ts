/// <reference lib="dom" />
// Unsichtbares Fenster des Players: verkleinert große Bilder auf Bildschirmgröße (beim Synchronisieren). Mit den
// Bildfunktionen des Browsers – die beachten die Drehung von Handyfotos (EXIF) und rechnen außerhalb des Hauptprozesses.
import { ipcRenderer } from 'electron';

interface ResizeRequest {
  id: number;
  data: Uint8Array;
  mime: string;
  /** Bildschirm in Pixeln */
  width: number;
  height: number;
}

/** erst ab so viel größer als der Bildschirm lohnt das Verkleinern */
const MIN_SCALE = 0.75;

async function resize(req: ResizeRequest): Promise<Uint8Array | null> {
  const full = await createImageBitmap(new Blob([req.data as BlobPart], { type: req.mime }), { imageOrientation: 'from-image' });
  try {
    // so groß, dass das Bild den Bildschirm füllt (wie „cover“)
    const scale = Math.max(req.width / full.width, req.height / full.height);
    if (scale >= MIN_SCALE) return null;
    const width = Math.max(1, Math.round(full.width * scale));
    const height = Math.max(1, Math.round(full.height * scale));
    const small = await createImageBitmap(full, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' });
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext('2d')!.drawImage(small, 0, 0);
    small.close();
    const blob = await canvas.convertToBlob(req.mime === 'image/png' ? { type: 'image/png' } : { type: 'image/jpeg', quality: 0.9 });
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    full.close();
  }
}

ipcRenderer.on('player:resize', (_event, req: ResizeRequest) => {
  resize(req).then(
    (data) => ipcRenderer.send('player:resized', req.id, data),
    () => ipcRenderer.send('player:resized', req.id, null),
  );
});
