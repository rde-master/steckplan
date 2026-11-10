// Hintergrund des Textfensters bearbeiten: Bilder und Videos (Medienspeicher), Reihenfolge, Standzeit der Bilder,
// Überblendung, Ablauf (Schleife / einmalig) und Abdunkeln – als Standard (Regie-Einstellungen) oder je Eintrag.
import { ArrowLeft, ArrowRight, Film, ImagePlus, ImageUp, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type * as Y from 'yjs';
import { addLyricsSlide, FADE_SEC_DEFAULT, isVideoMedia, lyricsImages, moveLyricsSlide, removeLyricsSlide, setLyricsBackground, setLyricsBackgroundDim, setLyricsSlideTiming, SLIDE_SEC_DEFAULT, type LyricsBackground, type MediaRef } from '@steckplan/core';
import { api, errorMessage } from '../../lib/api';
import { uploadMedia } from '../../lib/mediaUpload';
import { useSession } from '../../lib/session';
import { texts } from '../../texts';
import { ICON } from '../icons';
import { Banner, Button } from '../ui';

const t = texts.regie.lyricsPage;

/** Vorschau einer Datei: Bild oder (stummes) Video */
function Preview({ projectId, mediaId, video, alt, className }: { projectId: string; mediaId: string; video: boolean; alt: string; className: string }) {
  return video ? (
    <video src={api.mediaUrl(projectId, mediaId)} muted playsInline preload="metadata" className={className} aria-label={alt} data-testid="background-video" />
  ) : (
    <img src={api.mediaUrl(projectId, mediaId)} alt={alt} className={className} />
  );
}

export function BackgroundEditor({
  projectId,
  doc,
  origin,
  background,
  media,
  itemId,
  editable = true,
}: {
  projectId: string;
  doc: Y.Doc;
  origin: object;
  background: LyricsBackground | undefined;
  media: MediaRef[];
  /** ohne: Standard-Hintergrund; mit: eigener Hintergrund dieses Eintrags */
  itemId?: string;
  editable?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const by = useSession((s) => s.session?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectClass = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800';
  const byId = new Map(media.map((m) => [m.id, m]));
  const images = lyricsImages(background);
  const isVideo = (id: string) => isVideoMedia(byId.get(id));
  const hasVideo = images.some(isVideo);
  const hasImages = images.some((id) => !isVideo(id));

  // „Andere Datei“ ersetzt die erste, „hinzufügen“ hängt an (Diashow / Video-Liste)
  const mode = useRef<'replace' | 'add'>('replace');
  const upload = async (files: File[]) => {
    setBusy(true);
    setError(null);
    try {
      for (const file of files) {
        const info = await uploadMedia(projectId, file);
        const ref: MediaRef = { id: info.id, name: file.name, mime: file.type, sizeBytes: info.sizeBytes, sha256: info.sha256, addedAt: new Date().toISOString(), addedBy: by };
        if (mode.current === 'add') addLyricsSlide(doc, ref, origin, itemId);
        else setLyricsBackground(doc, ref, origin, background?.dim ?? 0.5, itemId);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3" data-testid={itemId ? 'item-background' : 'standard-background'}>
      {error && <Banner tone="error">{error}</Banner>}
      {background ? (
        <div className="relative aspect-video overflow-hidden rounded-md border border-slate-200 bg-slate-950 dark:border-slate-700">
          <Preview projectId={projectId} mediaId={background.mediaId} video={isVideo(background.mediaId)} alt={t.background} className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-black" style={{ opacity: background.dim }} />
          <span className="absolute inset-0 flex items-center justify-center text-2xl font-semibold text-white">Aa</span>
        </div>
      ) : (
        <p className="text-sm text-slate-500">{itemId ? t.itemNoBackground : t.noImage}</p>
      )}
      {images.length > 1 && (
        <ol className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label={t.slides} data-testid="lyrics-slides">
          {images.map((mediaId, i) => (
            <li key={mediaId} className="space-y-1" data-testid="lyrics-slide" data-kind={isVideo(mediaId) ? 'video' : 'image'}>
              <div className="relative">
                <Preview projectId={projectId} mediaId={mediaId} video={isVideo(mediaId)} alt={t.slide(i + 1)} className="aspect-video w-full rounded border border-slate-200 object-cover dark:border-slate-700" />
                {isVideo(mediaId) && (
                  <span className="absolute top-1 left-1 rounded bg-black/70 p-0.5 text-white" title={t.video}>
                    <Film size={12} aria-hidden />
                  </span>
                )}
              </div>
              {editable && (
                <div className="flex items-center justify-center gap-0.5">
                  <Button variant="ghost" className="min-h-7 px-1" aria-label={t.slideEarlier(i + 1)} title={t.slideEarlier(i + 1)} disabled={i === 0} onClick={() => moveLyricsSlide(doc, mediaId, -1, origin, itemId)}>
                    <ArrowLeft size={14} aria-hidden />
                  </Button>
                  <span className="w-5 text-center text-xs tabular-nums">{i + 1}</span>
                  <Button variant="ghost" className="min-h-7 px-1" aria-label={t.slideLater(i + 1)} title={t.slideLater(i + 1)} disabled={i === images.length - 1} onClick={() => moveLyricsSlide(doc, mediaId, 1, origin, itemId)}>
                    <ArrowRight size={14} aria-hidden />
                  </Button>
                  <Button variant="ghost" className="min-h-7 px-1" aria-label={t.slideRemove(i + 1)} title={t.slideRemove(i + 1)} onClick={() => removeLyricsSlide(doc, mediaId, origin, itemId)}>
                    <Trash2 size={14} aria-hidden />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {background && (images.length > 1 || hasVideo) && (
        <div className="flex flex-wrap items-center gap-4 text-sm" data-testid="lyrics-slide-timing">
          {hasImages && images.length > 1 && (
            <label className="flex items-center gap-2">
              {t.slideSec}
              <input
                type="number"
                min={1}
                max={600}
                disabled={!editable}
                className={`${selectClass} w-20`}
                value={background.slideSec ?? SLIDE_SEC_DEFAULT}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v >= 1 && v <= 600) setLyricsSlideTiming(doc, { slideSec: v }, origin, itemId);
                }}
              />
              s
            </label>
          )}
          {images.length > 1 && (
            <label className="flex items-center gap-2">
              {t.fadeSec}
              <input
                type="number"
                min={0}
                max={30}
                step={0.5}
                disabled={!editable}
                className={`${selectClass} w-20`}
                value={background.fadeSec ?? FADE_SEC_DEFAULT}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v >= 0 && v <= 30) setLyricsSlideTiming(doc, { fadeSec: v }, origin, itemId);
                }}
              />
              s
            </label>
          )}
          <div className="flex items-center gap-3" role="radiogroup" aria-label={t.playOrder} data-testid="background-loop">
            <span className="font-medium">{t.playOrder}</span>
            {(['loop', 'once'] as const).map((m) => (
              <label key={m} className="flex items-center gap-1.5" title={t.playOrderHint[m]}>
                <input
                  type="radio"
                  name={`background-loop-${itemId ?? 'standard'}`}
                  disabled={!editable}
                  checked={(background.loop === false ? 'once' : 'loop') === m}
                  onChange={() => setLyricsSlideTiming(doc, { loop: m === 'loop' }, origin, itemId)}
                />
                {t.playOrders[m]}
              </label>
            ))}
          </div>
        </div>
      )}
      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            aria-label={t.chooseImage}
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              if (files.length) void upload(mode.current === 'replace' ? files.slice(0, 1) : files);
            }}
          />
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              mode.current = background ? 'replace' : 'add';
              input.current?.click();
            }}
          >
            <ImageUp {...ICON} /> {busy ? t.uploading : background ? t.replaceImage : t.chooseImage}
          </Button>
          {background && (
            <Button
              variant="secondary"
              disabled={busy}
              title={t.addSlideHint}
              onClick={() => {
                mode.current = 'add';
                input.current?.click();
              }}
              data-testid="lyrics-add-slide"
            >
              <ImagePlus {...ICON} /> {t.addSlide}
            </Button>
          )}
          {background && (
            <Button variant="ghost" disabled={busy} onClick={() => doc.transact(() => images.forEach((mediaId) => removeLyricsSlide(doc, mediaId, origin, itemId)), origin)}>
              <Trash2 {...ICON} /> {images.length > 1 ? t.removeAll : t.removeImage}
            </Button>
          )}
        </div>
      )}
      {background && (
        <label className="flex items-center gap-2 text-sm">
          {t.dim}
          <input type="range" min={0} max={0.9} step={0.05} disabled={!editable} value={background.dim} onChange={(e) => setLyricsBackgroundDim(doc, Number(e.target.value), origin, itemId)} className="flex-1 accent-sky-600" />
          <span className="w-10 text-right tabular-nums">{Math.round(background.dim * 100)} %</span>
        </label>
      )}
    </div>
  );
}
