// Führen, Kopfzeile: Stand jedes gekoppelten Players auf einen Blick – Punkt (grün gut, gelb schwankt, rot getrennt,
// grau aus), Name und Laufzeit in ms; jede Sekunde neu. Klick öffnet die Einzelheiten (Einstellungen rechts).
import { MonitorPlay } from 'lucide-react';
import { playerLinkQuality, type PlayerLinkQuality, type PlayerStatus } from '@steckplan/core';
import { usePlayersOverview } from '../../lib/players';
import { texts } from '../../texts';
import { QUALITY_DOT, QUALITY_TEXT } from './PlayersPanel';

const t = texts.players;

/** Verbindung eines Players; führt hier jemand und ist sein Textfenster nicht mit diesem Projekt verbunden: gestört */
export function badgeQuality(p: PlayerStatus, leadingHere: boolean): { quality: PlayerLinkQuality; note?: string } {
  if (p.online && p.report?.phase && p.report.phase !== 'ready') return { quality: 'weak', note: t.phases[p.report.phase] };
  const quality = playerLinkQuality(p);
  if (leadingHere && quality === 'good' && p.link && !p.link.leadRoom) return { quality: 'weak', note: t.notInLeadProject };
  return { quality };
}

function tooltip(p: PlayerStatus, quality: PlayerLinkQuality, note: string | undefined): string {
  const link = p.link;
  const lines = [`${p.name}: ${t.quality[quality]}`];
  if (note) lines.push(note);
  if (link?.rttMs !== undefined && link.connections > 0) lines.push(`${t.latency}: ${t.ms(link.rttMs)}`);
  const detail = link ? t.linkDetail(link.avgMs, link.maxMs, link.lost) : '';
  if (detail) lines.push(`${detail} (${t.linkWindow})`);
  if (link && link.connections > 0 && link.silentMs >= 2000) lines.push(t.silent(Math.floor(link.silentMs / 1000)));
  return lines.join('\n');
}

export function PlayerStatusBadge({ leadingHere, onOpen }: { leadingHere: boolean; onOpen: () => void }) {
  const { overview, stale } = usePlayersOverview();
  const players = overview?.players ?? [];
  if (!players.length) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      title={stale ? t.stale : t.badgeTitle}
      aria-label={t.title}
      className={`flex min-w-0 items-center gap-3 rounded-md border px-2 py-1 text-xs hover:bg-slate-800 ${stale ? 'border-red-700' : 'border-slate-700'}`}
      data-testid="player-badge"
      data-stale={stale || undefined}
    >
      <MonitorPlay size={14} className="shrink-0 text-sky-400" aria-hidden />
      {players.map((p) => {
        const { quality, note } = stale ? { quality: 'offline' as const, note: t.stale } : badgeQuality(p, leadingHere);
        const link = p.link;
        const ms = link?.rttMs !== undefined && link.connections > 0 && quality !== 'offline' && quality !== 'bad' ? link.rttMs : undefined;
        return (
          <span key={p.id} className="flex min-w-0 items-center gap-1.5" title={tooltip(p, quality, note)} data-testid="player-badge-item" data-quality={quality}>
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${QUALITY_DOT[quality]}`} aria-hidden />
            <span className="max-w-[9rem] truncate text-slate-200">{p.name}</span>
            {/* feste Breite, damit nichts springt */}
            <span className={`w-[4.5em] text-right tabular-nums ${QUALITY_TEXT[quality]}`} data-testid="player-badge-ms">
              {ms !== undefined ? t.ms(ms) : t.qualityShort[quality] || '–'}
            </span>
          </span>
        );
      })}
    </button>
  );
}
