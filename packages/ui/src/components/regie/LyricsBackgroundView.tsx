// Hintergrund des Textfensters: Bild, Diashow oder Videos (mehrere hintereinander, in Schleife oder einmalig).
// Nur Bilder als Standard-Hintergrund in Schleife: nach der Wanduhr (auf allen Geräten gleich). Sonst eine Liste ab
// dem Start des Eintrags (eigener Hintergrund) bzw. ab dem Öffnen: Bilder stehen slideSec Sekunden, Videos laufen bis
// zum Ende. Abschnittsbilder gehen vor; beim Führen in der Helligkeit regelbar (0 = schwarz). Videos immer stumm.
// Ein neues Abschnittsbild wird erst übergeblendet, wenn es geladen und decodiert ist – bis dahin bleibt stehen, was
// zu sehen ist (kein kurzes Schwarz, kein Aufploppen).
// Jeder Bildwechsel nutzt die eingestellte Überblendung (fadeSec des Hintergrunds): Diashow, Videos, Abschnittsbilder
// und – über BackgroundCrossfade – der Wechsel zu einem anderen Hintergrund (Eintrag, Pause, ohne Führen).
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { FADE_SEC_DEFAULT, isVideoMedia, lyricsImages, SLIDE_SEC_DEFAULT, slideIndex, type LyricsBackground, type MediaRef } from '@steckplan/core';
import { api } from '../../lib/api';
import { preloadImage, useImageReady } from '../../lib/imagePreload';

/** Überblendung eines Hintergrunds in ms (Einstellung „Überblendung“, sonst Standard) */
export function backgroundFadeMs(background: Pick<LyricsBackground, 'fadeSec'> | undefined): number {
  return Math.round((background?.fadeSec ?? FADE_SEC_DEFAULT) * 1000);
}

/** false: dieser Hintergrund blendet gerade aus – seine Bilder sind nicht „das aktive Bild“ (Test-Kennungen) */
const Current = createContext(true);
const tag = (current: boolean, active: boolean) => (current && active ? 'lyrics-background' : undefined);

interface Entry {
  id: string;
  video: boolean;
}

/** Aktuelles Bild der Diashow nach der Wanduhr */
function useWallClockSlide(count: number, slideSec: number, enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (count <= 1 || !enabled) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [count, enabled]);
  return slideIndex(now, count, slideSec);
}

export function LyricsBackgroundView({
  projectId,
  media,
  background,
  own,
  sectionImage,
  level,
  fadeSec,
}: {
  projectId: string;
  media: MediaRef[];
  background: LyricsBackground | undefined;
  /** eigener Hintergrund des Eintrags (beginnt mit dem Eintrag) */
  own: boolean;
  /** Bild des aktuellen Abschnitts (geht vor) */
  sectionImage: string | undefined;
  /** Helligkeit (Führen): 0 = schwarz; die Bilder und Videos laufen darunter weiter */
  level: number;
  /** Zeit, in der auf die Helligkeit übergeblendet wird (Sekunden) */
  fadeSec: number;
}) {
  const byId = new Map(media.map((m) => [m.id, m]));
  const entries: Entry[] = lyricsImages(background).map((id) => ({ id, video: isVideoMedia(byId.get(id)) }));
  const loop = background?.loop !== false;
  const slideSec = background?.slideSec ?? SLIDE_SEC_DEFAULT;
  const fadeMs = backgroundFadeMs(background);
  const current = useContext(Current);
  const wallClock = !own && loop && !entries.some((e) => e.video);
  // das Abschnittsbild löst die Liste erst ab, wenn es bereitsteht
  const sectionReady = useImageReady(sectionImage ? api.mediaUrl(projectId, sectionImage) : undefined);
  // an, sobald das erste bereitsteht; ein Wechsel zum nächsten Abschnittsbild blendet SectionImage selbst über
  const [sectionOn, setSectionOn] = useState(sectionReady);
  if (!sectionImage && sectionOn) setSectionOn(false);
  else if (sectionImage && sectionReady && !sectionOn) setSectionOn(true);
  const showsList = !sectionImage || !sectionOn;
  const dim = background?.dim ?? 0.5;
  return (
    <div
      className="absolute inset-0 transition-opacity ease-in-out motion-reduce:transition-none"
      style={{ opacity: level, transitionDuration: `${fadeSec}s` }}
      data-testid={current ? 'lyrics-background-layer' : undefined}
      data-level={level}
    >
      {wallClock ? (
        <WallClockSlides projectId={projectId} entries={entries} slideSec={slideSec} fadeMs={fadeMs} visible={showsList} />
      ) : (
        <Playlist projectId={projectId} entries={entries} slideSec={slideSec} fadeMs={fadeMs} loop={loop} visible={showsList} />
      )}
      <SectionImage projectId={projectId} id={showsList ? undefined : sectionImage} fadeMs={fadeMs} />
      {(sectionImage || entries.length > 0) && <div className="absolute inset-0 bg-black" style={{ opacity: dim }} />}
    </div>
  );
}

/** Abschnittsbild: ein neues blendet über das vorige, sobald es geladen ist; ohne Bild blendet es aus */
function SectionImage({ projectId, id, fadeMs }: { projectId: string; id: string | undefined; fadeMs: number }) {
  const current = useContext(Current);
  const [layers, setLayers] = useState<{ id: string; shown: boolean }[]>([]);
  // neues Bild oben auflegen (noch unsichtbar) bzw. ohne Bild alle ausblenden
  const [placed, setPlaced] = useState<string | undefined>(undefined);
  if (placed !== id) {
    setPlaced(id);
    setLayers((current) => {
      if (!id) return current.map((l) => ({ ...l, shown: false }));
      const existing = current.find((l) => l.id === id);
      return [...current.filter((l) => l.id !== id), existing ?? { id, shown: false }];
    });
  }
  useEffect(() => {
    if (!id) {
      const timer = window.setTimeout(() => setLayers((current) => current.filter((l) => l.shown)), fadeMs);
      return () => window.clearTimeout(timer);
    }
    let alive = true;
    let timer: number | undefined;
    void preloadImage(api.mediaUrl(projectId, id)).then(() => {
      if (!alive) return;
      setLayers((current) => current.map((l) => (l.id === id ? { ...l, shown: true } : l)));
      // die darunter nach der Überblendung entfernen
      timer = window.setTimeout(() => setLayers((current) => current.filter((l) => l.id === id)), fadeMs + 50);
    });
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [projectId, id, fadeMs]);
  return (
    <>
      {layers.map((l) => (
        <div
          key={l.id}
          className="absolute inset-0 bg-cover bg-center transition-opacity ease-in-out"
          style={{ backgroundImage: `url("${api.mediaUrl(projectId, l.id)}")`, opacity: l.shown ? 1 : 0, transitionDuration: `${fadeMs}ms` }}
          data-testid={tag(current, l.id === id && l.shown)}
          data-media={l.id}
          data-kind="image"
        />
      ))}
    </>
  );
}

function ImageLayer({ projectId, id, active, fadeMs }: { projectId: string; id: string; active: boolean; fadeMs: number }) {
  const current = useContext(Current);
  return (
    <div
      className="absolute inset-0 bg-cover bg-center transition-opacity ease-in-out"
      style={{ backgroundImage: `url("${api.mediaUrl(projectId, id)}")`, opacity: active ? 1 : 0, transitionDuration: `${fadeMs}ms` }}
      data-testid={tag(current, active)}
      data-media={id}
      data-kind="image"
    />
  );
}

function WallClockSlides({ projectId, entries, slideSec, fadeMs, visible }: { projectId: string; entries: Entry[]; slideSec: number; fadeMs: number; visible: boolean }) {
  const slide = useWallClockSlide(entries.length, slideSec, visible);
  return (
    <>
      {entries.map((e, i) => (
        <ImageLayer key={e.id} projectId={projectId} id={e.id} active={visible && i === slide} fadeMs={fadeMs} />
      ))}
    </>
  );
}

function Playlist({ projectId, entries, slideSec, fadeMs, loop, visible }: { projectId: string; entries: Entry[]; slideSec: number; fadeMs: number; loop: boolean; visible: boolean }) {
  const [position, setPosition] = useState(0);
  const count = entries.length;
  const index = count === 0 ? 0 : Math.min(position, count - 1);
  const current = entries[index];
  const advance = useCallback(() => setPosition((i) => (i + 1 < count ? i + 1 : loop ? 0 : i)), [count, loop]);
  // Bilder: nach der Standzeit weiter (am Ende einmalig: stehen bleiben)
  useEffect(() => {
    if (!visible || !current || current.video || count <= 1) return;
    if (!loop && index === count - 1) return;
    const timer = window.setTimeout(advance, slideSec * 1000);
    return () => window.clearTimeout(timer);
  }, [visible, current, index, count, loop, slideSec, advance]);
  return (
    <>
      {entries.map((e, i) =>
        e.video ? (
          <VideoLayer key={e.id} projectId={projectId} id={e.id} active={visible && i === index} fadeMs={fadeMs} loop={loop && count === 1} onEnded={i === index ? advance : undefined} />
        ) : (
          <ImageLayer key={e.id} projectId={projectId} id={e.id} active={visible && i === index} fadeMs={fadeMs} />
        ),
      )}
    </>
  );
}

function VideoLayer({ projectId, id, active, fadeMs, loop, onEnded }: { projectId: string; id: string; active: boolean; fadeMs: number; loop: boolean; onEnded?: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const current = useContext(Current);
  // aktiv: von vorn abspielen; sonst anhalten
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (active) {
      video.currentTime = 0;
      void video.play().catch(() => undefined);
    } else video.pause();
  }, [active]);
  return (
    <video
      ref={ref}
      src={api.mediaUrl(projectId, id)}
      muted
      playsInline
      preload="auto"
      loop={loop}
      onEnded={onEnded}
      className="absolute inset-0 h-full w-full object-cover transition-opacity ease-in-out"
      style={{ opacity: active ? 1 : 0, transitionDuration: `${fadeMs}ms` }}
      data-testid={tag(current, active)}
      data-media={id}
      data-kind="video"
    />
  );
}

/** Was als Hintergrund zu sehen ist; key wechselt mit dem Hintergrund (eigener des Eintrags bzw. Standard) */
export interface BackgroundScene {
  key: string;
  background: LyricsBackground | undefined;
  own: boolean;
  sectionImage: string | undefined;
}

interface SceneLayer {
  id: number;
  scene: BackgroundScene;
  shown: boolean;
}

/**
 * Wechsel zwischen Hintergründen (anderer Eintrag, Pause, ohne Führen): der neue blendet in seiner eingestellten
 * Überblendung über den alten, sobald sein erstes Bild bereitsteht – kein Schnitt nach Schwarz. Innerhalb eines
 * Hintergrunds (Abschnittsbilder, Diashow) blendet LyricsBackgroundView selbst.
 */
export function BackgroundCrossfade({ projectId, media, scene, level, fadeSec }: { projectId: string; media: MediaRef[]; scene: BackgroundScene; level: number; fadeSec: number }) {
  const [layers, setLayers] = useState<SceneLayer[]>(() => [{ id: 0, scene, shown: true }]);
  // nur bei echter Änderung neu einordnen (scene ist je Darstellung ein neues Objekt)
  const signature = `${scene.key}|${scene.own}|${scene.sectionImage ?? ''}|${JSON.stringify(scene.background ?? null)}`;
  const [seen, setSeen] = useState(signature);
  if (seen !== signature) {
    setSeen(signature);
    setLayers((current) => {
      const top = current[current.length - 1]!;
      // gleicher Hintergrund (z. B. neues Abschnittsbild): nur aktualisieren
      if (top.scene.key === scene.key) return [...current.slice(0, -1), { ...top, scene }];
      return [...current, { id: top.id + 1, scene, shown: false }];
    });
  }
  const top = layers[layers.length - 1]!;
  const fadeMs = backgroundFadeMs(top.scene.background);
  const first = top.scene.sectionImage ?? lyricsImages(top.scene.background)[0];
  const firstIsImage = !!first && !isVideoMedia(media.find((m) => m.id === first));
  // einblenden, sobald das erste Bild bereitsteht (höchstens kurz warten)
  useEffect(() => {
    if (top.shown) return;
    let alive = true;
    const show = () => {
      if (alive) setLayers((current) => current.map((l) => (l.id === top.id ? { ...l, shown: true } : l)));
    };
    const fallback = window.setTimeout(show, 1500);
    if (first && firstIsImage) void preloadImage(api.mediaUrl(projectId, first)).then(() => window.setTimeout(show, 20));
    else window.setTimeout(show, 20);
    return () => {
      alive = false;
      window.clearTimeout(fallback);
    };
  }, [top.id, top.shown, first, firstIsImage, projectId]);
  // die darunter nach der Überblendung entfernen
  useEffect(() => {
    if (!top.shown || layers.length < 2) return;
    const timer = window.setTimeout(() => setLayers((current) => current.filter((l) => l.id >= top.id)), fadeMs + 100);
    return () => window.clearTimeout(timer);
  }, [top.id, top.shown, layers.length, fadeMs]);
  return (
    <>
      {layers.map((l) => (
        <div
          key={l.id}
          className="absolute inset-0 transition-opacity ease-in-out motion-reduce:transition-none"
          style={{ opacity: l.shown ? 1 : 0, transitionDuration: `${fadeMs}ms` }}
          data-background-key={l.scene.key}
        >
          <Current.Provider value={l.id === top.id}>
            <LyricsBackgroundView projectId={projectId} media={media} background={l.scene.background} own={l.scene.own} sectionImage={l.scene.sectionImage} level={level} fadeSec={fadeSec} />
          </Current.Provider>
        </div>
      ))}
    </>
  );
}
