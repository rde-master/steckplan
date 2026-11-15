// Bilder vorab laden und decodieren: ein Hintergrundbild, das erst beim Anzeigen geladen bzw. decodiert wird, fehlt
// einen Moment (schwarz) und „ploppt“ dann auf – bei großen Fotos auf schwachen Rechnern spürbar. Vorgeladene Bilder
// stehen sofort da. Die Elemente werden gehalten (sonst verwirft der Browser sie eher); begrenzt auf die zuletzt
// gebrauchten, damit große Fotos den Speicher nicht füllen.
import { useEffect, useState } from 'react';

interface Entry {
  image: HTMLImageElement;
  ready: Promise<void>;
  done: boolean;
}

const MAX_ENTRIES = 16;
const entries = new Map<string, Entry>();

/** Bild laden und decodieren; erfüllt sich auch bei einem Fehler (dann zeigt der Browser eben, was er hat) */
export function preloadImage(url: string): Promise<void> {
  const existing = entries.get(url);
  if (existing) {
    // zuletzt gebraucht: ans Ende
    entries.delete(url);
    entries.set(url, existing);
    return existing.ready;
  }
  if (typeof Image === 'undefined') return Promise.resolve();
  const image = new Image();
  image.decoding = 'async';
  const entry: Entry = { image, done: false, ready: Promise.resolve() };
  entry.ready = new Promise<void>((resolve) => {
    const finish = () => {
      entry.done = true;
      resolve();
    };
    image.onload = () => {
      // decode() fehlt in alten Browsern bzw. scheitert bei sehr großen Bildern – dann gilt „geladen“
      if (typeof image.decode === 'function') image.decode().then(finish, finish);
      else finish();
    };
    image.onerror = finish;
  });
  image.src = url;
  entries.set(url, entry);
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value as string;
    entries.delete(oldest);
  }
  return entry.ready;
}

/** schon geladen und decodiert? */
export function isImageReady(url: string): boolean {
  return entries.get(url)?.done === true;
}

/** Diese Bilder bereithalten (Reihenfolge = Wichtigkeit) */
export function usePreloadImages(urls: string[]): void {
  const key = urls.join('\n');
  useEffect(() => {
    if (!key) return;
    for (const url of key.split('\n')) void preloadImage(url);
  }, [key]);
}

/** Ist das Bild geladen und decodiert? Startet das Laden; meldet sich, sobald es soweit ist. */
export function useImageReady(url: string | undefined): boolean {
  const [ready, setReady] = useState<string | undefined>(() => (url && isImageReady(url) ? url : undefined));
  useEffect(() => {
    if (!url) return;
    let alive = true;
    void preloadImage(url).then(() => {
      if (alive) setReady(url);
    });
    return () => {
      alive = false;
    };
  }, [url]);
  return !!url && (ready === url || isImageReady(url));
}
