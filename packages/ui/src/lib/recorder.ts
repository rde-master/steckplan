// Aufnahme mit dem Mikrofon (MediaRecorder) zur Wiedergabe: scharf geschaltet startet sie mit der Wiedergabe und
// endet beim Anhalten; die Aufnahme wird dann als Audiodatei beim Punkt gespeichert (über onDone).
// Das Mikrofon gibt es nur in einem sicheren Kontext (HTTPS, localhost, Desktop-App) – über http im LAN nicht.
import { useEffect, useRef, useState } from 'react';
import type { Playback } from './transport';

/** Mikrofon-Aufnahme möglich? (sicherer Kontext und Browser-Unterstützung) */
export function canRecord(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
}

const TYPES: [string, string][] = [
  ['audio/webm;codecs=opus', 'webm'],
  ['audio/webm', 'webm'],
  ['audio/mp4', 'm4a'],
  ['audio/ogg;codecs=opus', 'ogg'],
];

function pickType(): { mime: string | undefined; ext: string } {
  for (const [mime, ext] of TYPES) if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  return { mime: undefined, ext: 'webm' };
}

export type RecorderStatus = 'off' | 'arming' | 'ready' | 'recording' | 'error';

export interface Recording {
  file: File;
  /** Zeit des Punkts beim Start der Aufnahme */
  startAt: number;
  startedAt: Date;
}

/**
 * Aufnahme an die Wiedergabe koppeln. armed = vom Nutzer eingeschaltet: dann wird das Mikrofon geöffnet; beim Start
 * der Wiedergabe beginnt die Aufnahme, beim Anhalten bzw. Ende (oder Ausschalten, Wechsel des Punkts) endet sie.
 */
export function useRecorder(playback: Playback | null, armed: boolean, onDone: (recording: Recording) => void): { status: RecorderStatus; error: string | null; elapsed: number } {
  const [state, setState] = useState<{ status: RecorderStatus; error: string | null }>({ status: 'off', error: null });
  const [startedMs, setStartedMs] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    if (!armed || !playback) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let recorder: MediaRecorder | null = null;
    let chunks: Blob[] = [];
    let startAt = 0;
    let startedAt = new Date();
    const { mime, ext } = pickType();

    const start = () => {
      if (!stream || recorder) return;
      chunks = [];
      startAt = playback.currentTime;
      startedAt = new Date();
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      const current = recorder;
      recorder.onstop = () => {
        const type = (current.mimeType || mime || 'audio/webm').split(';')[0]!;
        if (chunks.length) {
          const stamp = startedAt.toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '-');
          done.current({ file: new File(chunks, `Aufnahme ${stamp}.${ext}`, { type }), startAt, startedAt });
        }
      };
      recorder.start(1000);
      setStartedMs(performance.now());
      setState({ status: 'recording', error: null });
    };
    const stop = () => {
      if (!recorder) return;
      if (recorder.state !== 'inactive') recorder.stop();
      recorder = null;
      setStartedMs(null);
      if (!cancelled) setState({ status: 'ready', error: null });
    };

    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      .then((s) => {
        if (cancelled) {
          for (const track of s.getTracks()) track.stop();
          return;
        }
        stream = s;
        setState({ status: 'ready', error: null });
        if (!playback.paused) start();
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      });

    playback.addEventListener('play', start);
    playback.addEventListener('pause', stop);
    playback.addEventListener('ended', stop);
    return () => {
      cancelled = true;
      playback.removeEventListener('play', start);
      playback.removeEventListener('pause', stop);
      playback.removeEventListener('ended', stop);
      // laufende Aufnahme beim Ausschalten bzw. Wechsel noch speichern
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      recorder = null;
      if (stream) for (const track of stream.getTracks()) track.stop();
      setStartedMs(null);
      setState({ status: 'off', error: null });
    };
  }, [armed, playback]);

  // laufende Zeit der Aufnahme
  useEffect(() => {
    if (startedMs === null) return;
    const timer = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(timer);
  }, [startedMs]);

  // eingeschaltet, Mikrofon noch nicht offen: „arming“
  const status = armed && state.status === 'off' ? 'arming' : state.status;
  return { status, error: state.error, elapsed: startedMs === null ? 0 : Math.max(0, (now - startedMs) / 1000) };
}
