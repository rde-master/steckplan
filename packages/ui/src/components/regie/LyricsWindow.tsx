// Textfenster: eigene Seite (/projekt/<id>/text), auf jedem Gerät zu öffnen, im Vollbild.
// Fünf Zeilen, zentriert: die vorige (ausgegraut), die aktuelle (hervorgehoben), die drei nächsten.
// Die Stelle kommt von der Person, die in der Vorstellung führt (über den Server, mit Abspielposition),
// im selben Browser auch ohne Führen direkt von der eigenen Vorstellung.
import { useEffect, useState } from 'react';
import type { Cue, TimedLine } from '@steckplan/core';

export function lyricsPath(projectId: string): string {
  return `/projekt/${encodeURIComponent(projectId)}/text`;
}

export function lyricsUrl(projectId: string): string {
  return new URL(lyricsPath(projectId), window.location.href).href;
}

/** Textfenster in einem eigenen Fenster öffnen (bzw. nach vorn holen) */
export function openLyricsWindow(projectId: string): void {
  const w = window.open(lyricsPath(projectId), `steckplan-text-${projectId}`, 'popup,width=1100,height=600');
  w?.focus();
}

// ---------- Stelle im selben Browser (ohne Führen) ----------

/** Stelle mit dem Zeitpunkt des Empfangs (performance.now) – daraus läuft die Uhr weiter */
export interface ReceivedCue extends Cue {
  receivedAt: number;
}

const channelName = (projectId: string) => `steckplan-text-${projectId}`;

/** Die Vorstellung meldet ihre Stelle an Textfenster im selben Browser */
export function useLocalCueSender(projectId: string): (cue: Cue | null) => void {
  const [channel] = useState(() => (typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(channelName(projectId))));
  useEffect(() => () => channel?.close(), [channel]);
  return (cue) => channel?.postMessage(cue);
}

export function useLocalCue(projectId: string): ReceivedCue | null {
  const [cue, setCue] = useState<ReceivedCue | null>(null);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(channelName(projectId));
    channel.onmessage = (e: MessageEvent<Cue | null>) => setCue(e.data ? { ...e.data, receivedAt: performance.now() } : null);
    return () => channel.close();
  }, [projectId]);
  return cue;
}

/** Abspielzeit aus der letzten Stelle; läuft die Wiedergabe, zählt sie flüssig weiter */
export function useCueClock(cue: ReceivedCue | null): number | undefined {
  const [now, setNow] = useState(() => performance.now());
  const running = !!cue?.playing && cue.at !== undefined;
  useEffect(() => {
    if (!running) return;
    let frame = 0;
    const tick = () => {
      setNow(performance.now());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running]);
  if (!cue || cue.at === undefined) return undefined;
  return running ? cue.at + Math.max(0, now - cue.receivedAt) / 1000 : cue.at;
}

// ---------- Anzeige ----------

/** Die fünf Zeilen um die aktuelle (index -1 = noch vor der ersten Zeile) */
export function lyricRows<T>(lines: T[], current: number): (T | undefined)[] {
  return [-1, 0, 1, 2, 3].map((offset) => {
    const i = current + offset;
    return i >= 0 && i < lines.length ? lines[i] : undefined;
  });
}

export function LyricsDisplay({ title, lines, currentLineId, roleNames }: { title: string; lines: TimedLine[]; currentLineId: string | undefined; roleNames: Map<string, string> }) {
  const current = lines.findIndex((l) => l.line.id === currentLineId);
  const rows = lyricRows(lines, current);
  return (
    <div className="flex h-full flex-col px-[4vw] py-[3vh]" data-testid="lyrics-window">
      <div className="truncate text-center text-[2.2vw] font-semibold text-slate-500">{title}</div>
      <ol className="flex flex-1 flex-col items-center justify-center gap-[1.5vh]">
        {rows.map((row, slot) => {
          const isCurrent = slot === 1;
          const speaker = row?.line.roleId ? roleNames.get(row.line.roleId) : undefined;
          const text = row ? (row.line.direction ? `(${row.line.text})` : row.line.text) : '';
          return (
            <li
              key={slot}
              data-testid="lyrics-row"
              data-current={isCurrent || undefined}
              className={`max-w-full min-h-[1.3em] truncate rounded-lg px-[2vw] text-center leading-tight ${
                slot === 0 ? 'text-[4vw] text-slate-500' : isCurrent ? (row ? 'bg-sky-900 py-[0.6vh] text-[5.5vw] font-semibold text-white' : 'text-[5.5vw]') : 'text-[4.5vw] text-slate-200'
              } ${row?.line.direction ? 'italic' : ''}`}
            >
              {speaker && <span className="mr-[1vw] text-sky-300">{speaker}:</span>}
              {text || ' '}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
