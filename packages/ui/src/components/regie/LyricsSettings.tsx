// Regie-Einstellungen: Restzeit im Player (rot/blinkend ab …), Textfenster (Zeilen, Hintergrundbild aus dem Medienspeicher).
import { ArrowLeft, ArrowRight, ImagePlus, ImageUp, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type * as Y from 'yjs';
import { addLyricsSlide, bpmCommand, FADE_SEC_DEFAULT, isArtNetHost, lyricsImages, moveLyricsSlide, removeLyricsSlide, setLyricsSlideTiming, SLIDE_SEC_DEFAULT, OSC_BPM_DEFAULTS, LYRICS_MAX_AFTER, LYRICS_MAX_BEFORE, lyricsRange, REMAIN_MAX_BLINK, REMAIN_MAX_WARN, remainRange, setLyricsBackground, setLyricsBackgroundDim, updateShowSettings, type MediaRef, type ShowSettings } from '@steckplan/core';
import { api, errorMessage } from '../../lib/api';
import { uploadMedia } from '../../lib/mediaUpload';
import { useSession } from '../../lib/session';
import { texts } from '../../texts';
import { ICON } from '../icons';
import { Banner, Button, Modal } from '../ui';
import { LYRICS_ACTIVE_BG, LYRICS_ACTIVE_COLOR } from './LyricsWindow';

const t = texts.regie.lyricsPage;

export function LyricsSettings({ projectId, doc, origin, settings, onClose }: { projectId: string; doc: Y.Doc; origin: object; settings: ShowSettings; onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const by = useSession((s) => s.session?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const background = settings.lyricsBackground;
  const range = lyricsRange(settings);
  const remain = remainRange(settings);
  const seconds = (value: string, max: number) => Math.min(max, Math.max(0, Math.round(Number(value) || 0)));
  const selectClass = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800';

  // „Anderes Bild“ ersetzt das erste, „hinzufügen“ hängt an (Diashow)
  const mode = useRef<'replace' | 'add'>('replace');
  const images = lyricsImages(background);
  const upload = async (files: File[]) => {
    setBusy(true);
    setError(null);
    try {
      for (const file of files) {
        const info = await uploadMedia(projectId, file);
        const ref: MediaRef = { id: info.id, name: file.name, mime: file.type, sizeBytes: info.sizeBytes, sha256: info.sha256, addedAt: new Date().toISOString(), addedBy: by };
        if (mode.current === 'add') addLyricsSlide(doc, ref, origin);
        else setLyricsBackground(doc, ref, origin, background?.dim ?? 0.5);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t.settings} onClose={onClose} footer={<Button onClick={onClose}>{t.close}</Button>}>
      <div className="space-y-3" data-testid="lyrics-settings">
        <h3 className="text-sm font-semibold">{t.playback}</h3>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            {t.remainWarn}
            <input type="number" min={0} max={REMAIN_MAX_WARN} className={`${selectClass} w-20`} value={remain.warn} onChange={(e) => updateShowSettings(doc, { remainWarnSec: seconds(e.target.value, REMAIN_MAX_WARN) }, origin)} />
            s
          </label>
          <label className="flex items-center gap-2">
            {t.remainBlink}
            <input type="number" min={0} max={REMAIN_MAX_BLINK} className={`${selectClass} w-20`} value={remain.blink} onChange={(e) => updateShowSettings(doc, { remainBlinkSec: seconds(e.target.value, REMAIN_MAX_BLINK) }, origin)} />
            s
          </label>
        </div>
        <p className="text-xs text-slate-500">{t.remainHint}</p>
        <ArtNetSettings doc={doc} origin={origin} settings={settings} inputClass={selectClass} />
        <OscBpmSettings projectId={projectId} doc={doc} origin={origin} settings={settings} inputClass={selectClass} />
        <p className="text-sm">
          <a
            href="/osc"
            className="font-medium text-sky-700 underline dark:text-sky-400"
            onClick={(e) => {
              e.preventDefault();
              window.open('/osc', 'steckplan-osc')?.focus();
            }}
          >
            {t.oscLink}
          </a>
        </p>
        <h3 className="border-t border-slate-200 pt-3 text-sm font-semibold dark:border-slate-700">{t.lyricsSection}</h3>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={settings.lyricsShowTitle !== false} onChange={(e) => updateShowSettings(doc, { lyricsShowTitle: e.target.checked ? undefined : false }, origin)} />
          {t.showTitle}
        </label>
        <div className="flex flex-wrap items-center gap-4 text-sm" role="radiogroup" aria-label={t.mode} data-testid="lyrics-mode">
          <span className="font-medium">{t.mode}</span>
          {(['lines', 'block'] as const).map((m) => (
            <label key={m} className="flex items-center gap-2">
              <input type="radio" name="lyrics-mode" checked={(settings.lyricsMode ?? 'lines') === m} onChange={() => updateShowSettings(doc, { lyricsMode: m === 'lines' ? undefined : m }, origin)} />
              {t.modes[m]}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.lyricsHighlight !== false} onChange={(e) => updateShowSettings(doc, { lyricsHighlight: e.target.checked ? undefined : false }, origin)} />
            {t.highlight}
          </label>
          <label className="flex items-center gap-2" title={t.translationHint}>
            <input type="checkbox" checked={settings.lyricsTranslation === true} onChange={(e) => updateShowSettings(doc, { lyricsTranslation: e.target.checked || undefined }, origin)} />
            {t.translation}
          </label>
        </div>
        {settings.lyricsHighlight !== false && (
        <div className="flex flex-wrap items-center gap-4 text-sm" data-testid="lyrics-colors">
          <span className="font-medium">{t.activeLine}</span>
          <label className="flex items-center gap-2">
            {t.activeColor}
            <input
              type="color"
              aria-label={t.activeColor}
              className="h-7 w-10 cursor-pointer rounded border border-slate-300 bg-transparent dark:border-slate-600"
              value={settings.lyricsActiveColor ?? LYRICS_ACTIVE_COLOR}
              onChange={(e) => updateShowSettings(doc, { lyricsActiveColor: e.target.value }, origin)}
            />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.lyricsActiveBg !== 'none'} onChange={(e) => updateShowSettings(doc, { lyricsActiveBg: e.target.checked ? undefined : 'none' }, origin)} />
            {t.activeBg}
          </label>
          {settings.lyricsActiveBg !== 'none' && (
            <input
              type="color"
              aria-label={t.activeBgColor}
              className="h-7 w-10 cursor-pointer rounded border border-slate-300 bg-transparent dark:border-slate-600"
              value={settings.lyricsActiveBg ?? LYRICS_ACTIVE_BG}
              onChange={(e) => updateShowSettings(doc, { lyricsActiveBg: e.target.value }, origin)}
            />
          )}
          {/* Vorschau */}
          <span
            className="rounded-lg px-3 py-1 font-semibold"
            style={{ color: settings.lyricsActiveColor ?? LYRICS_ACTIVE_COLOR, backgroundColor: settings.lyricsActiveBg === 'none' ? '#020617' : `${settings.lyricsActiveBg ?? LYRICS_ACTIVE_BG}` }}
          >
            {t.activePreview}
          </span>
          {(settings.lyricsActiveColor || settings.lyricsActiveBg) && (
            <Button variant="ghost" className="min-h-7 px-2 text-xs" onClick={() => updateShowSettings(doc, { lyricsActiveColor: undefined, lyricsActiveBg: undefined }, origin)}>
              {t.resetColors}
            </Button>
          )}
        </div>
        )}
        {(settings.lyricsMode ?? 'lines') === 'lines' && (
          <>
        <h4 className="text-xs font-semibold text-slate-500 uppercase">{t.lines}</h4>
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
          </>
        )}
        <h4 className="pt-2 text-xs font-semibold text-slate-500 uppercase">{t.background}</h4>
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
        {images.length > 1 && (
          <ol className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label={t.slides} data-testid="lyrics-slides">
            {images.map((mediaId, i) => (
              <li key={mediaId} className="space-y-1" data-testid="lyrics-slide">
                <img src={api.mediaUrl(projectId, mediaId)} alt={t.slide(i + 1)} className="aspect-video w-full rounded border border-slate-200 object-cover dark:border-slate-700" />
                <div className="flex items-center justify-center gap-0.5">
                  <Button variant="ghost" className="min-h-7 px-1" aria-label={t.slideEarlier(i + 1)} title={t.slideEarlier(i + 1)} disabled={i === 0} onClick={() => moveLyricsSlide(doc, mediaId, -1, origin)}>
                    <ArrowLeft size={14} aria-hidden />
                  </Button>
                  <span className="w-5 text-center text-xs tabular-nums">{i + 1}</span>
                  <Button variant="ghost" className="min-h-7 px-1" aria-label={t.slideLater(i + 1)} title={t.slideLater(i + 1)} disabled={i === images.length - 1} onClick={() => moveLyricsSlide(doc, mediaId, 1, origin)}>
                    <ArrowRight size={14} aria-hidden />
                  </Button>
                  <Button variant="ghost" className="min-h-7 px-1" aria-label={t.slideRemove(i + 1)} title={t.slideRemove(i + 1)} onClick={() => removeLyricsSlide(doc, mediaId, origin)}>
                    <Trash2 size={14} aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        )}
        {images.length > 1 && background && (
          <div className="flex flex-wrap items-center gap-4 text-sm" data-testid="lyrics-slide-timing">
            <label className="flex items-center gap-2">
              {t.slideSec}
              <input
                type="number"
                min={1}
                max={600}
                className={`${selectClass} w-20`}
                value={background.slideSec ?? SLIDE_SEC_DEFAULT}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v >= 1 && v <= 600) setLyricsSlideTiming(doc, { slideSec: v }, origin);
                }}
              />
              s
            </label>
            <label className="flex items-center gap-2">
              {t.fadeSec}
              <input
                type="number"
                min={0}
                max={30}
                step={0.5}
                className={`${selectClass} w-20`}
                value={background.fadeSec ?? FADE_SEC_DEFAULT}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v >= 0 && v <= 30) setLyricsSlideTiming(doc, { fadeSec: v }, origin);
                }}
              />
              s
            </label>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            type="file"
            accept="image/*"
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
            <Button variant="ghost" disabled={busy} onClick={() => doc.transact(() => images.forEach((mediaId) => removeLyricsSlide(doc, mediaId, origin)), origin)}>
              <Trash2 {...ICON} /> {images.length > 1 ? t.removeAll : t.removeImage}
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

/** Timecode per Art-Net: ein/aus und Zieladresse (der Server sendet, solange in der Vorstellung jemand führt) */
function ArtNetSettings({ doc, origin, settings, inputClass }: { doc: Y.Doc; origin: object; settings: ShowSettings; inputClass: string }) {
  const artnet = settings.artnet ?? { enabled: false, host: '255.255.255.255' };
  const [draft, setDraft] = useState<string | null>(null);
  const host = draft ?? artnet.host;
  const valid = isArtNetHost(host);
  return (
    <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
      <h3 className="text-sm font-semibold">{t.artnet}</h3>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={artnet.enabled} onChange={(e) => updateShowSettings(doc, { artnet: { ...artnet, enabled: e.target.checked } }, origin)} />
        {t.artnetEnabled}
      </label>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        {t.artnetHost}
        <input
          className={`${inputClass} w-40 font-mono ${valid ? '' : 'border-red-500'}`}
          value={host}
          aria-invalid={!valid}
          onFocus={() => setDraft(artnet.host)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (valid && host.trim() !== artnet.host) updateShowSettings(doc, { artnet: { ...artnet, host: host.trim() } }, origin);
            setDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        <span className="text-xs text-slate-500">{t.artnetPort}</span>
      </label>
      <p className="text-xs text-slate-500">{t.artnetHint}</p>
    </div>
  );
}

/** Eingabefeld, das beim Verlassen (bzw. Enter) übernimmt, wenn gültig */
function DraftInput({ value, valid, onCommit, className, label, testId }: { value: string; valid: (v: string) => boolean; onCommit: (v: string) => void; className: string; label: string; testId: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  const ok = valid(shown);
  return (
    <input
      className={`${className} ${ok ? '' : 'border-red-500'}`}
      value={shown}
      aria-label={label}
      aria-invalid={!ok}
      data-testid={testId}
      onFocus={() => setDraft(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (ok && shown.trim() !== value) onCommit(shown.trim());
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

/** Tempo per OSC: ein/aus, Ziel, Port, Adresse und Befehl mit {bpm} (der Server sendet, solange jemand führt) */
function OscBpmSettings({ projectId, doc, origin, settings, inputClass }: { projectId: string; doc: Y.Doc; origin: object; settings: ShowSettings; inputClass: string }) {
  const osc = { ...OSC_BPM_DEFAULTS, ...settings.oscBpm };
  const set = (patch: Partial<typeof osc>) => updateShowSettings(doc, { oscBpm: { ...osc, ...patch } }, origin);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const sendNow = async () => {
    try {
      const { sent } = await api.sendOscBpm(projectId);
      setResult({ ok: true, text: t.oscBpmSent(sent) });
    } catch (e) {
      setResult({ ok: false, text: errorMessage(e) });
    }
  };
  return (
    <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700" data-testid="osc-bpm-settings">
      <h3 className="text-sm font-semibold">{t.oscBpm}</h3>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={osc.enabled} onChange={(e) => set({ enabled: e.target.checked })} data-testid="osc-bpm-enabled" />
        {t.oscBpmEnabled}
      </label>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>{t.oscBpmHost}</span>
        <DraftInput value={osc.host} valid={isArtNetHost} onCommit={(host) => set({ host })} className={`${inputClass} w-40 font-mono`} label={t.oscBpmHost} testId="osc-bpm-host" />
        <span>{t.oscBpmPort}</span>
        <DraftInput value={String(osc.port)} valid={(v) => /^\d{1,5}$/.test(v.trim()) && Number(v) >= 1 && Number(v) <= 65535} onCommit={(v) => set({ port: Number(v) })} className={`${inputClass} w-24 font-mono`} label={t.oscBpmPort} testId="osc-bpm-port" />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>{t.oscBpmAddress}</span>
        <DraftInput value={osc.address} valid={(v) => /^\/\S+$/.test(v.trim())} onCommit={(address) => set({ address })} className={`${inputClass} w-28 font-mono`} label={t.oscBpmAddress} testId="osc-bpm-address" />
        <span>{t.oscBpmCommand}</span>
        <DraftInput value={osc.command} valid={(v) => v.trim() !== ''} onCommit={(command) => set({ command })} className={`${inputClass} min-w-56 flex-1 font-mono`} label={t.oscBpmCommand} testId="osc-bpm-command" />
      </div>
      <p className="text-xs text-slate-500">
        {t.oscBpmExample(osc.address, bpmCommand(osc.command, 120))} {t.oscBpmHint}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" className="text-xs" disabled={!osc.enabled || !isArtNetHost(osc.host)} onClick={() => void sendNow()}>
          {t.oscBpmSendNow}
        </Button>
        {result && (
          <span role="status" className={`text-xs ${result.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {result.text}
          </span>
        )}
      </div>
    </div>
  );
}
