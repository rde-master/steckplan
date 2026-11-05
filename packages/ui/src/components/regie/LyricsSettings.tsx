// Textfenster einrichten: Hintergrundbild (Medienspeicher) und wie stark es abgedunkelt wird.
import { ImageUp, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type * as Y from 'yjs';
import { LYRICS_MAX_AFTER, LYRICS_MAX_BEFORE, lyricsRange, setLyricsBackground, setLyricsBackgroundDim, updateShowSettings, type MediaRef, type ShowSettings } from '@steckplan/core';
import { api, errorMessage } from '../../lib/api';
import { uploadMedia } from '../../lib/mediaUpload';
import { useSession } from '../../lib/session';
import { texts } from '../../texts';
import { ICON } from '../icons';
import { Banner, Button, Modal } from '../ui';

const t = texts.regie.lyricsPage;

export function LyricsSettings({ projectId, doc, origin, settings, onClose }: { projectId: string; doc: Y.Doc; origin: object; settings: ShowSettings; onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const by = useSession((s) => s.session?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const background = settings.lyricsBackground;
  const range = lyricsRange(settings);
  const selectClass = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800';

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const info = await uploadMedia(projectId, file);
      const ref: MediaRef = { id: info.id, name: file.name, mime: file.type, sizeBytes: info.sizeBytes, sha256: info.sha256, addedAt: new Date().toISOString(), addedBy: by };
      setLyricsBackground(doc, ref, origin, background?.dim ?? 0.5);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t.settings} onClose={onClose} footer={<Button onClick={onClose}>{t.close}</Button>}>
      <div className="space-y-3" data-testid="lyrics-settings">
        <h3 className="text-sm font-semibold">{t.lines}</h3>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            {t.linesBefore}
            <select className={selectClass} value={range.before} onChange={(e) => updateShowSettings(doc, { lyricsBefore: Number(e.target.value) }, origin)}>
              {Array.from({ length: LYRICS_MAX_BEFORE + 1 }, (_, n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            {t.linesAfter}
            <select className={selectClass} value={range.after} onChange={(e) => updateShowSettings(doc, { lyricsAfter: Number(e.target.value) }, origin)}>
              {Array.from({ length: LYRICS_MAX_AFTER + 1 }, (_, n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-xs text-slate-500">{t.linesHint}</p>
        <h3 className="pt-2 text-sm font-semibold">{t.background}</h3>
        <p className="text-xs text-slate-500">{t.backgroundHint}</p>
        {error && <Banner tone="error">{error}</Banner>}
        {background ? (
          <div className="relative aspect-video overflow-hidden rounded-md border border-slate-200 bg-slate-950 dark:border-slate-700">
            <img src={api.mediaUrl(projectId, background.mediaId)} alt={t.background} className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-black" style={{ opacity: background.dim }} />
            <span className="absolute inset-0 flex items-center justify-center text-2xl font-semibold text-white">Aa</span>
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t.noImage}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label={t.chooseImage}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void upload(file);
            }}
          />
          <Button variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
            <ImageUp {...ICON} /> {busy ? t.uploading : background ? t.replaceImage : t.chooseImage}
          </Button>
          {background && (
            <Button variant="ghost" disabled={busy} onClick={() => setLyricsBackground(doc, null, origin)}>
              <Trash2 {...ICON} /> {t.removeImage}
            </Button>
          )}
        </div>
        {background && (
          <label className="flex items-center gap-2 text-sm">
            {t.dim}
            <input type="range" min={0} max={0.9} step={0.05} value={background.dim} onChange={(e) => setLyricsBackgroundDim(doc, Number(e.target.value), origin)} className="flex-1 accent-sky-600" />
            <span className="w-10 text-right tabular-nums">{Math.round(background.dim * 100)} %</span>
          </label>
        )}
      </div>
    </Modal>
  );
}
