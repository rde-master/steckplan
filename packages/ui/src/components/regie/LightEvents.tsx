// Licht-Events eines Punkts bearbeiten: Zeitpunkt und Notiz (z. B. „Pyro“, „Blinder voll“). „+ Event“ legt eines an
// der aktuellen Abspielstelle an. In der Zeitleiste erscheinen sie als Marker, in der Vorstellung mit Countdown.
import { Crosshair, Plus, Trash2 } from 'lucide-react';
import type * as Y from 'yjs';
import { addLightEvent, removeLightEvent, updateLightEvent, upcomingLightEvents, type LightEvent } from '@steckplan/core';
import type { Playback } from '../../lib/transport';
import { usePlayerTime, type TimeSource } from '../../lib/playerTime';
import { texts } from '../../texts';
import { ICON } from '../icons';
import { Button } from '../ui';
import { SceneTimeInput } from './ScenesSection';
import { seekAudio } from './SongMedia';

const t = texts.light.events;

export function LightEventsEditor({ doc, origin, itemId, events, audio, editable }: { doc: Y.Doc; origin: object; itemId: string; events: LightEvent[]; audio: Playback | null; editable: boolean }) {
  return (
    <section className="space-y-1.5 rounded-md border border-amber-300/70 bg-amber-50/60 p-2 dark:border-amber-800/60 dark:bg-amber-950/20" aria-label={t.title} data-testid="light-events">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-xs font-semibold tracking-wide text-amber-800 uppercase dark:text-amber-300">{t.title}</h4>
        <span className="text-xs text-slate-500">{t.hint}</span>
        <span className="flex-1" />
        {editable && (
          <Button variant="secondary" className="min-h-8 text-xs" title={t.addHint} onClick={() => addLightEvent(doc, itemId, audio?.currentTime ?? 0, '', origin)} data-testid="light-event-add">
            <Plus {...ICON} /> {t.add}
          </Button>
        )}
      </div>
      {events.length === 0 ? (
        <p className="text-xs text-slate-500">{t.none}</p>
      ) : (
        <ul className="space-y-1">
          {events.map((ev) => (
            <li key={ev.id} className="flex flex-wrap items-center gap-2" data-testid="light-event">
              <SceneTimeInput key={`${ev.id}:${ev.atSec}`} value={ev.atSec} editable={editable} onChange={(sec) => sec !== undefined && updateLightEvent(doc, ev.id, { atSec: sec }, origin)} />
              <input
                key={`${ev.id}:${ev.note}`}
                aria-label={t.note}
                placeholder={t.notePlaceholder}
                className="min-w-40 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
                defaultValue={ev.note}
                disabled={!editable}
                onBlur={(e) => e.target.value !== ev.note && updateLightEvent(doc, ev.id, { note: e.target.value }, origin)}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
              {audio && (
                <Button variant="ghost" className="min-h-8 px-1.5" aria-label={t.jump} title={t.jump} onClick={() => seekAudio(audio, ev.atSec)}>
                  <Crosshair {...ICON} />
                </Button>
              )}
              {editable && (
                <Button variant="ghost" className="min-h-8 px-1.5" aria-label={t.remove} title={t.remove} onClick={() => removeLightEvent(doc, ev.id, origin)}>
                  <Trash2 {...ICON} />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** „12,3 s“ bzw. „1:05“ */
function countdown(sec: number): string {
  if (sec < 60) return `${sec.toFixed(1).replace('.', ',')} s`;
  const m = Math.floor(sec / 60);
  return `${m}:${String(Math.floor(sec - m * 60)).padStart(2, '0')}`;
}

/** Vorstellung (Licht): die nächsten Events mit eigenem Countdown – kurz davor gelb blinkend, erreicht „jetzt“ */
export function LightEventCountdown({ events, source }: { events: LightEvent[]; source: TimeSource | null }) {
  // aktualisiert sich selbst (Anzeige in Zehntelsekunden)
  const time = usePlayerTime(source, 0.05);
  const next = upcomingLightEvents(events, time).slice(0, 3);
  if (next.length === 0) return null;
  const tp = texts.regie.performance;
  return (
    <section className="space-y-1 rounded-lg border border-amber-500/60 bg-amber-500/10 p-2" aria-label={tp.eventsTitle} data-testid="light-event-countdown">
      <div className="text-xs font-semibold tracking-wide text-amber-300 uppercase">{tp.eventsTitle}</div>
      <ul className="space-y-1">
        {next.map(({ event, inSec }, i) => {
          const now = inSec <= 0;
          const soon = !now && inSec <= 5;
          return (
            <li key={event.id} className={`flex items-baseline gap-3 ${i === 0 ? 'text-lg' : 'text-sm text-slate-300'}`} data-testid="light-event-next">
              <span className={`w-24 shrink-0 font-mono font-bold tabular-nums ${now ? 'text-red-400' : soon ? 'animate-pulse text-amber-300' : 'text-amber-200'}`} data-testid="light-event-timer">
                {now ? tp.eventNow : tp.eventIn(countdown(inSec))}
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold">{event.note || '!'}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
