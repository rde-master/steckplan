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
  useEffect(() => {
    // auch beim Schließen des Tabs (dabei räumt React nicht mehr auf)
    const gone = () => post(channel, null);
    window.addEventListener('pagehide', gone);
    return () => {
      window.removeEventListener('pagehide', gone);
      post(channel, null);
      channel?.close();
    };
  }, [channel]);
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
  return running ? cue.at + (Math.max(0, now - cue.receivedAt) / 1000) * (cue.rate ?? 1) : cue.at;
}

// ---------- Anzeige ----------

/** Standardfarben der aktiven Zeile: Text weiß, Hervorhebung dunkelblau */
export const LYRICS_ACTIVE_COLOR = '#ffffff';
export const LYRICS_ACTIVE_BG = '#0c4a6e';


/** Darstellung einer Zeile: Sprecher, Text (Regieanweisung in Klammern) und darunter auf Wunsch die Übersetzung */
function LineContent({ line, speaker, speakerColor, translation, size, translationSize }: { line: TimedLine['line']; speaker: string | undefined; speakerColor: string | undefined; translation: boolean; size: string; translationSize: string }) {
  return (
    <>
      <span className="block truncate" style={{ fontSize: size }}>
        {speaker && (
          <span className={`mr-[1vw] ${speakerColor ? '' : 'text-sky-300'}`} style={speakerColor ? { color: speakerColor } : undefined} data-testid="lyrics-speaker">
            {speaker}:
          </span>
        )}
        {(line.direction ? `(${line.text})` : line.text) || '\u00a0'}
      </span>
      {translation && line.translation && (
        <span className="block truncate font-normal text-sky-200/90 italic" style={{ fontSize: translationSize }} data-testid="lyrics-translation">
          {line.translation}
        </span>
      )}
    </>
  );
}

/**
 * Textfenster-Anzeige. „Zeilen“: zentriert die vorige(n) (ausgegraut), die aktuelle (hervorgehoben) und die nächsten;
 * alle Zeilen stehen in einer Liste, die beim Wechsel weich nach oben gleitet. „Block“: der ganze Textabschnitt der
 * aktuellen Zeile, beim Wechsel des Abschnitts weich überblendet. Hervorhebung abschaltbar, Übersetzung auf Wunsch.
 */
export function LyricsDisplay({
  title,
  lines,
  currentLineId,
  roleNames,
  roleColors = new Map(),
  before = 1,
  after = 3,
  activeColor = LYRICS_ACTIVE_COLOR,
  activeBg = LYRICS_ACTIVE_BG,
  mode = 'lines',
  highlight = true,
  translation = false,
}: {
  title: string;
  lines: TimedLine[];
  currentLineId: string | undefined;
  roleNames: Map<string, string>;
  /** Farben der Rollen */
  roleColors?: Map<string, string>;
  before?: number;
  after?: number;
  /** Farbe der aktiven Zeile */
  activeColor?: string;
  /** Hervorhebung der aktiven Zeile ('none' = keine) */
  activeBg?: string;
  /** 'block' = ganzer Textabschnitt */
  mode?: 'lines' | 'block';
  /** aktuelle Zeile hervorheben */
  highlight?: boolean;
  /** Übersetzung unter den Zeilen */
  translation?: boolean;
}) {
  const current = lines.findIndex((l) => l.line.id === currentLineId);
  const withTranslation = translation && lines.some((l) => l.line.translation);
  const activeStyle = (isCurrent: boolean) => (isCurrent && highlight ? { color: activeColor, backgroundColor: activeBg === 'none' ? 'transparent' : `${activeBg}d9` } : {});
  return (
    <div className="relative flex h-full flex-col" data-testid="lyrics-window" data-mode={mode}>
      {/* Titel abschaltbar (Regie-Einstellungen); die Höhe bleibt, damit der Text nicht springt */}
      <div className="min-h-[1.2em] truncate px-[4vw] pt-[3vh] text-center text-[2.2vw] font-semibold text-slate-400 [text-shadow:0_2px_8px_rgb(0_0_0/0.8)]" data-testid="lyrics-title">
        {title}
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {mode === 'block' ? <BlockView lines={lines} current={current} roleNames={roleNames} roleColors={roleColors} highlight={highlight} translation={withTranslation} activeStyle={activeStyle} /> : <LinesView lines={lines} current={current} roleNames={roleNames} roleColors={roleColors} before={before} after={after} highlight={highlight} translation={withTranslation} activeStyle={activeStyle} />}
      </div>
    </div>
  );
}

type ActiveStyle = (isCurrent: boolean) => { color?: string; backgroundColor?: string };

function LinesView({ lines, current, roleNames, roleColors, before, after, highlight, translation, activeStyle }: { lines: TimedLine[]; current: number; roleNames: Map<string, string>; roleColors: Map<string, string>; before: number; after: number; highlight: boolean; translation: boolean; activeStyle: ActiveStyle }) {
  const slots = before + 1 + after;
  // Höhe einer Zeile in vh: bis 15, zusammen höchstens 80
  const ROW_VH = Math.min(15, 80 / slots);
  // aktuelle Zeile auf den Platz nach den vorigen (vor der ersten Zeile: Index -1 → erste Zeile einen Platz tiefer)
  const shift = (before - current) * ROW_VH;
  const size = `min(4.5vw, ${ROW_VH * (translation ? 0.32 : 0.42)}vh)`;
  const translationSize = `min(3vw, ${ROW_VH * 0.22}vh)`;
  return (
    <div className="absolute inset-x-0 top-1/2" style={{ height: `${slots * ROW_VH}vh`, marginTop: `-${(slots * ROW_VH) / 2}vh` }}>
      <ol className="transition-transform duration-700 ease-out motion-reduce:transition-none" style={{ transform: `translateY(${shift}vh)` }}>
        {lines.map((l, i) => {
          const d = i - current;
          const visible = d >= -before && d <= after;
          const isCurrent = d === 0;
          const speaker = l.line.roleId ? roleNames.get(l.line.roleId) : undefined;
          const look = !visible ? 'opacity-0' : highlight ? (isCurrent ? 'scale-[1.2] font-semibold' : d < 0 ? 'scale-90 text-slate-400 opacity-70' : 'text-slate-100') : 'text-slate-100';
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
                style={activeStyle(isCurrent)}
                data-testid={isCurrent ? 'lyrics-active-line' : undefined}
                data-highlight={(isCurrent && highlight) || undefined}
                className={`inline-block max-w-full rounded-xl px-[2vw] py-[0.3em] leading-tight transition-all duration-700 ease-out motion-reduce:transition-none [text-shadow:0_2px_10px_rgb(0_0_0/0.85)] ${look} ${l.line.direction ? 'italic' : ''}`}
              >
                <LineContent line={l.line} speaker={speaker} speakerColor={l.line.roleId ? roleColors.get(l.line.roleId) : undefined} translation={translation} size={size} translationSize={translationSize} />
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function BlockView({ lines, current, roleNames, roleColors, highlight, translation, activeStyle }: { lines: TimedLine[]; current: number; roleNames: Map<string, string>; roleColors: Map<string, string>; highlight: boolean; translation: boolean; activeStyle: ActiveStyle }) {
  // Abschnitte in Reihenfolge; sichtbar der der aktuellen Zeile (vor der ersten: der erste)
  const blocks: { sectionId: string; lines: { line: TimedLine; index: number }[] }[] = [];
  lines.forEach((l, index) => {
    const last = blocks[blocks.length - 1];
    if (last && last.sectionId === l.sectionId) last.lines.push({ line: l, index });
    else blocks.push({ sectionId: l.sectionId, lines: [{ line: l, index }] });
  });
  const activeSection = (lines[current] ?? lines[0])?.sectionId;
  return (
    <>
      {blocks.map((block) => {
        const active = block.sectionId === activeSection;
        // Schrift nach der Zahl der Zeilen (mit Übersetzung zählt jede Zeile mehr)
        const units = block.lines.length * (translation ? 1.6 : 1);
        const unitVh = Math.min(11, 80 / Math.max(1, units));
        const size = `min(4.2vw, ${unitVh * 0.62}vh)`;
        const translationSize = `min(2.8vw, ${unitVh * 0.4}vh)`;
        return (
          <ol
            key={block.sectionId}
            className={`absolute inset-0 flex flex-col items-center justify-center gap-[0.6vh] px-[3vw] text-center transition-opacity duration-700 ease-out motion-reduce:transition-none ${active ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
            data-testid={active ? 'lyrics-block' : undefined}
            data-section={block.sectionId}
            aria-hidden={!active || undefined}
          >
            {block.lines.map(({ line: l, index }) => {
              const isCurrent = index === current;
              const speaker = l.line.roleId ? roleNames.get(l.line.roleId) : undefined;
              return (
                <li key={l.line.id} className="max-w-full" data-testid={active ? 'lyrics-row' : undefined} data-current={isCurrent || undefined}>
                  <span
                    style={activeStyle(isCurrent)}
                    data-testid={isCurrent && active ? 'lyrics-active-line' : undefined}
                    data-highlight={(isCurrent && highlight) || undefined}
                    className={`inline-block max-w-full rounded-xl px-[1.5vw] py-[0.15em] leading-tight transition-all duration-500 ease-out motion-reduce:transition-none [text-shadow:0_2px_10px_rgb(0_0_0/0.85)] ${isCurrent && highlight ? 'font-semibold' : 'text-slate-100'} ${l.line.direction ? 'italic' : ''}`}
                  >
                    <LineContent line={l.line} speaker={speaker} speakerColor={l.line.roleId ? roleColors.get(l.line.roleId) : undefined} translation={translation} size={size} translationSize={translationSize} />
                  </span>
                </li>
              );
            })}
          </ol>
        );
      })}
    </>
  );
}
