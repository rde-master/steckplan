// Textfenster: ein eigenes Browser-Fenster (z. B. auf einem zweiten Bildschirm), in dem der Text mitläuft –
// fünf Zeilen: die vorige (ausgegraut), die aktuelle (hervorgehoben), die drei nächsten.
// Inhalt kommt per Portal aus der Vorstellung; das Fenster selbst hat keine Bedienelemente.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TimedLine } from '@steckplan/core';

const WINDOW_NAME = 'steckplan-lyrics';

/** Stile der App ins Fenster übernehmen und es leeren (auch ein noch offenes Fenster einer früheren Sitzung) */
function prepareWindow(w: Window, title: string): void {
  const d = w.document;
  d.title = title;
  d.documentElement.lang = 'de';
  for (const node of Array.from(d.head.querySelectorAll('[data-steckplan]'))) node.remove();
  for (const node of Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))) {
    const copy = node.cloneNode(true) as HTMLElement;
    if (copy instanceof HTMLLinkElement) copy.href = (node as HTMLLinkElement).href;
    copy.setAttribute('data-steckplan', '');
    d.head.appendChild(copy);
  }
  d.body.replaceChildren();
  d.body.className = 'dark m-0 overflow-hidden bg-slate-950';
}

function setWindowTitle(w: Window, title: string): void {
  w.document.title = title;
}

/** Fenster öffnen bzw. nach vorn holen; schließt mit der Vorstellung */
export function useLyricsWindow(title: string): { win: Window | null; open: () => void } {
  const [win, setWin] = useState<Window | null>(null);
  const open = () => {
    if (win && !win.closed) {
      win.focus();
      return;
    }
    const w = window.open('', WINDOW_NAME, 'popup,width=1100,height=560');
    if (!w) return;
    prepareWindow(w, title);
    setWin(w);
  };
  // vom Benutzer geschlossen?
  useEffect(() => {
    if (!win) return;
    const timer = window.setInterval(() => {
      if (win.closed) setWin(null);
    }, 500);
    return () => window.clearInterval(timer);
  }, [win]);
  useEffect(() => {
    if (win) setWindowTitle(win, title);
  }, [win, title]);
  useEffect(() => () => win?.close(), [win]);
  return { win, open };
}

/** Die fünf Zeilen um die aktuelle (index -1 = noch vor der ersten Zeile) */
export function lyricRows<T>(lines: T[], current: number): (T | undefined)[] {
  return [-1, 0, 1, 2, 3].map((offset) => {
    const i = current + offset;
    return i >= 0 && i < lines.length ? lines[i] : undefined;
  });
}

export function LyricsPortal({
  win,
  title,
  lines,
  currentLineId,
  roleNames,
}: {
  win: Window;
  title: string;
  lines: TimedLine[];
  currentLineId: string | undefined;
  roleNames: Map<string, string>;
}) {
  const current = lines.findIndex((l) => l.line.id === currentLineId);
  const rows = lyricRows(lines, current);
  return createPortal(
    <div className="dark flex h-screen flex-col bg-slate-950 px-[4vw] py-[3vh] text-slate-100" data-testid="lyrics-window">
      <div className="truncate text-[2.2vw] font-semibold text-slate-500">{title}</div>
      <ol className="flex flex-1 flex-col justify-center gap-[1.5vh]">
        {rows.map((row, slot) => {
          const isCurrent = slot === 1;
          const speaker = row?.line.roleId ? roleNames.get(row.line.roleId) : undefined;
          const text = row ? (row.line.direction ? `(${row.line.text})` : row.line.text) : '';
          return (
            <li
              key={slot}
              data-testid="lyrics-row"
              data-current={isCurrent || undefined}
              className={`min-h-[1.3em] truncate rounded-lg px-[1.5vw] leading-tight ${
                slot === 0 ? 'text-[4vw] text-slate-500' : isCurrent ? (row ? 'bg-sky-900 py-[0.6vh] text-[5.5vw] font-semibold text-white' : 'text-[5.5vw]') : 'text-[4.5vw] text-slate-200'
              } ${row?.line.direction ? 'italic' : ''}`}
            >
              {speaker && <span className="mr-[1vw] text-sky-300">{speaker}:</span>}
              {text || '\u00a0'}
            </li>
          );
        })}
      </ol>
    </div>,
    win.document.body,
  );
}
