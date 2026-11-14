// Hintergrund des Textfensters: Bild, Diashow oder Videos (mehrere hintereinander, in Schleife oder einmalig).
// Nur Bilder als Standard-Hintergrund in Schleife: nach der Wanduhr (auf allen Geräten gleich). Sonst eine Liste ab
// dem Start des Eintrags (eigener Hintergrund) bzw. ab dem Öffnen: Bilder stehen slideSec Sekunden, Videos laufen bis
// zum Ende. Abschnittsbilder gehen vor; beim Führen in der Helligkeit regelbar (0 = schwarz). Videos immer stumm.
import { useCallback, useEffect, useRef, useState } from 'react';
import { FADE_SEC_DEFAULT, isVideoMedia, lyricsImages, SLIDE_SEC_DEFAULT, slideIndex, type LyricsBackground, type MediaRef } from '@steckplan/core';
import { api } from '../../lib/api';

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
  const fadeMs = Math.round((background?.fadeSec ?? FADE_SEC_DEFAULT) * 1000);
  const wallClock = !own && loop && !entries.some((e) => e.video);
  const showsList = !sectionImage;
  const dim = background?.dim ?? 0.5;
  return (
    <div
      className="absolute inset-0 transition-opacity ease-in-out motion-reduce:transition-none"
      style={{ opacity: level, transitionDuration: `${fadeSec}s` }}
      data-testid="lyrics-background-layer"
      data-level={level}
    >
      {wallClock ? (
        <WallClockSlides projectId={projectId} entries={entries} slideSec={slideSec} fadeMs={fadeMs} visible={showsList} />
      ) : (
        <Playlist projectId={projectId} entries={entries} slideSec={slideSec} fadeMs={fadeMs} loop={loop} visible={showsList} />
      )}
      {sectionImage && (
        <div
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-700 ease-in-out"
          style={{ backgroundImage: `url("${api.mediaUrl(projectId, sectionImage)}")` }}
          data-testid="lyrics-background"
          data-media={sectionImage}
          data-kind="image"
        />
      )}
      {(sectionImage || entries.length > 0) && <div className="absolute inset-0 bg-black" style={{ opacity: dim }} />}
    </div>
  );
}

function ImageLayer({ projectId, id, active, fadeMs }: { projectId: string; id: string; active: boolean; fadeMs: number }) {
  return (
    <div
      className="absolute inset-0 bg-cover bg-center transition-opacity ease-in-out"
      style={{ backgroundImage: `url("${api.mediaUrl(projectId, id)}")`, opacity: active ? 1 : 0, transitionDuration: `${fadeMs}ms` }}
      data-testid={active ? 'lyrics-background' : undefined}
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
      data-testid={active ? 'lyrics-background' : undefined}
      data-media={id}
      data-kind="video"
    />
  );
}
