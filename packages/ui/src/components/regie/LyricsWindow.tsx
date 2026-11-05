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

function post(channel: BroadcastChannel | null, cue: Cue | null): void {
  try {
    channel?.postMessage(cue);
  } catch {
    // Kanal schon geschlossen – nichts mehr zu melden
  }
}

/** Die Vorstellung meldet ihre Stelle an Textfenster im selben Browser; beim Schließen „keine Stelle“ */
export function useLocalCueSender(projectId: string): (cue: Cue | null) => void {
  const [channel] = useState(() => (typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(channelName(projectId))));
  useEffect(
    () => () => {
      post(channel, null);
      channel?.close();
    },
    [channel],
  );
  return (cue) => post(channel, cue);
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


/**
 * Zeilen zentriert: vorige (ausgegraut, Anzahl before), aktuelle (hervorgehoben), nächste (Anzahl after).
 * Zeilenhöhe und Schrift richten sich nach der Zahl der sichtbaren Zeilen.
 * Alle Zeilen stehen in einer Liste, die beim Wechsel weich nach oben gleitet; Hervorhebung und Ein-/Ausblenden
 * gehen ebenfalls weich über – nichts springt.
 */
export function LyricsDisplay({
  title,
  lines,
  currentLineId,
  roleNames,
  before = 1,
  after = 3,
}: {
  title: string;
  lines: TimedLine[];
  currentLineId: string | undefined;
  roleNames: Map<string, string>;
  before?: number;
  after?: number;
}) {
  const current = lines.findIndex((l) => l.line.id === currentLineId);
  const slots = before + 1 + after;
  // Höhe einer Zeile in vh: bis 15, zusammen höchstens 80
  const ROW_VH = Math.min(15, 80 / slots);
  // aktuelle Zeile auf den Platz nach den vorigen (vor der ersten Zeile: Index -1 → erste Zeile einen Platz tiefer)
  const shift = (before - current) * ROW_VH;
  return (
    <div className="relative flex h-full flex-col" data-testid="lyrics-window">
      <div className="truncate px-[4vw] pt-[3vh] text-center text-[2.2vw] font-semibold text-slate-400 [text-shadow:0_2px_8px_rgb(0_0_0/0.8)]">{title}</div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="absolute inset-x-0 top-1/2" style={{ height: `${slots * ROW_VH}vh`, marginTop: `-${(slots * ROW_VH) / 2}vh` }}>
          <ol className="transition-transform duration-700 ease-out motion-reduce:transition-none" style={{ transform: `translateY(${shift}vh)` }}>
            {lines.map((l, i) => {
              const d = i - current;
              const visible = d >= -before && d <= after;
              const isCurrent = d === 0;
              const speaker = l.line.roleId ? roleNames.get(l.line.roleId) : undefined;
              return (
                <li
                  key={l.line.id}
                  style={{ height: `${ROW_VH}vh` }}
                  className="flex items-center justify-center px-[3vw] text-center"
                  data-testid={visible ? 'lyrics-row' : undefined}
                  data-current={isCurrent || undefined}
                  aria-hidden={!visible || undefined}
                >
                  <span
                    style={{ fontSize: `min(4.5vw, ${ROW_VH * 0.42}vh)` }}
                    className={`max-w-full truncate rounded-xl px-[2vw] py-[0.4em] leading-tight transition-all duration-700 ease-out motion-reduce:transition-none [text-shadow:0_2px_10px_rgb(0_0_0/0.85)] ${
                      isCurrent ? 'scale-[1.2] bg-sky-900/85 font-semibold text-white' : d < 0 && visible ? 'scale-90 text-slate-400 opacity-70' : visible ? 'text-slate-100' : 'opacity-0'
                    } ${l.line.direction ? 'italic' : ''}`}
                  >
                    {speaker && <span className="mr-[1vw] text-sky-300">{speaker}:</span>}
                    {(l.line.direction ? `(${l.line.text})` : l.line.text) || '\u00a0'}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
