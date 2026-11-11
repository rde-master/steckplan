// Steckplan Player (/player): alle Projekte mit Texten sind beim Start verbunden (Texte geladen, bleiben aktuell);
// sichtbar ist das Textfenster des Projekts, in dem gerade geführt wird. Führt niemand: „Bereit“.
import { useCallback, useEffect, useState } from 'react';
import { VERSION, type PlayerCatalog } from '@steckplan/core';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { texts } from '../texts';
import { LyricsPage } from './LyricsPage';

const t = texts.player;

interface PlayerNetwork {
  connected: boolean;
  addresses: { name: string; address: string }[];
  wifi?: string;
}

/** Netzwerk des Player-Rechners (nur im Steckplan Player, über dessen Preload) */
function usePlayerNetwork(): PlayerNetwork | null {
  const [network, setNetwork] = useState<PlayerNetwork | null>(null);
  useEffect(() => {
    const player = (globalThis as { steckplanPlayer?: { onNetwork?: (cb: (n: PlayerNetwork) => void) => () => void } }).steckplanPlayer;
    return player?.onNetwork?.((n) => setNetwork(n));
  }, []);
  return network;
}
/** Neuere Version des Players (nur im Steckplan Player; fehlt in älteren Playern) */
function usePlayerUpdate(): string | null {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    const player = (globalThis as { steckplanPlayer?: { onUpdate?: (cb: (u: { version?: unknown } | null) => void) => () => void } }).steckplanPlayer;
    return player?.onUpdate?.((u) => setVersion(u && typeof u.version === 'string' ? u.version : null));
  }, []);
  return version;
}

/** Wer führt, falls ein Projekt nicht vorgeladen ist (neu angelegt) */
const STATE_POLL_MS = 2000;
const VERSION_RELOAD_KEY = 'steckplan.versionReloadAt';

/**
 * Wurde die Steuersoftware aktualisiert, läuft hier noch die alte Oberfläche: neu laden – aber nur, solange nichts
 * gezeigt wird (nicht mitten in der Vorstellung) und höchstens einmal je Minute (keine Schleife).
 */
export function shouldReloadForVersion(serverVersion: string | undefined, ownVersion: string, showing: boolean, lastReloadAt: number, now: number): boolean {
  if (!serverVersion || serverVersion === ownVersion || showing) return false;
  return now - lastReloadAt >= 60_000;
}

export function PlayerPage() {
  const name = useSession((s) => s.session?.name ?? '');
  const network = usePlayerNetwork();
  const update = usePlayerUpdate();
  const [serverVersion, setServerVersion] = useState<string | undefined>(undefined);
  const [catalog, setCatalog] = useState<PlayerCatalog | null>(null);
  const [error, setError] = useState(false);
  const [serverLead, setServerLead] = useState<string | null>(null);
  // je Projekt: führt dort jemand? (live aus der Verbindung des Textfensters)
  const [leading, setLeading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    api
      .playerCatalog()
      .then((c) => alive && setCatalog(c))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const poll = () =>
      void api
        .playerState()
        .then((s) => {
          if (!alive) return;
          setServerLead(s.leadProjectId);
          setServerVersion(s.version);
        })
        .catch(() => undefined);
    poll();
    const timer = window.setInterval(poll, STATE_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    document.title = t.title;
  }, []);

  const onLead = useCallback((projectId: string, lead: boolean) => setLeading((current) => (current[projectId] === lead ? current : { ...current, [projectId]: lead })), []);

  const ids = catalog?.projects.map((p) => p.id) ?? [];
  if (serverLead && !ids.includes(serverLead)) ids.push(serverLead);
  // live gemeldet geht vor; sonst laut Server
  const shown = ids.find((id) => leading[id]) ?? (serverLead && leading[serverLead] !== false ? serverLead : null);
  const media = catalog?.projects.reduce((n, p) => n + p.media.length, 0) ?? 0;

  const showing = shown !== null;
  useEffect(() => {
    try {
      const last = Number(sessionStorage.getItem(VERSION_RELOAD_KEY)) || 0;
      if (!shouldReloadForVersion(serverVersion, VERSION, showing, last, Date.now())) return;
      sessionStorage.setItem(VERSION_RELOAD_KEY, String(Date.now()));
    } catch {
      // ohne Speicher kein Neuladen (sonst droht eine Schleife)
      return;
    }
    window.location.reload();
  }, [serverVersion, showing]);

  return (
    <div className="dark fixed inset-0 cursor-none overflow-hidden bg-black text-slate-100 select-none" data-testid="player-page">
      {ids.map((id) => (
        <LyricsPage key={id} id={id} player={{ visible: id === shown, onLead }} />
      ))}
      {!shown && (
        <div className="flex h-full flex-col items-center justify-center gap-4 text-center" data-testid="player-ready">
          <img src="/icon.png" alt="" className="mb-[2vh] h-[14vw] w-[14vw] drop-shadow-[0_0_3vw_rgb(56_189_248/0.25)]" data-testid="player-logo" />
          <div className="flex items-center gap-4 text-[5vw] font-semibold text-emerald-400">
            <span className="inline-block h-[3vw] w-[3vw] rounded-full bg-emerald-500 shadow-[0_0_2vw_rgb(16_185_129/0.7)]" aria-hidden />
            {error ? t.notReady : t.ready}
          </div>
          <p className="text-[1.6vw] text-slate-400">{catalog ? t.loaded(catalog.projects.length, media) : error ? t.catalogError : t.loading}</p>
          <p className="text-[1.3vw] text-slate-500">{t.waiting}</p>
          <div className="absolute bottom-[3vh] flex flex-col items-center gap-[0.8vh]">
            {network && (
              <p className="flex flex-wrap justify-center gap-x-[2vw] gap-y-[0.5vh] text-[1.25vw] text-slate-400" data-testid="player-network">
                <span className="flex items-center gap-[0.5vw]">
                  <span className={`inline-block h-[0.8vw] w-[0.8vw] rounded-full ${network.connected ? 'bg-emerald-400' : 'bg-red-400'}`} aria-hidden />
                  <b className="font-semibold text-slate-200">{network.connected ? t.networkConnected : t.networkNone}</b>
                </span>
                {network.wifi && (
                  <span>
                    {t.wifi}: <b className="font-semibold text-slate-200">{network.wifi}</b>
                  </span>
                )}
                {network.addresses.map((a) => (
                  <span key={`${a.name}-${a.address}`}>
                    IP {a.name}: <b className="font-semibold text-slate-200">{a.address}</b>
                  </span>
                ))}
              </p>
            )}
            {update && (
              <p className="text-[1.25vw] text-sky-400" data-testid="player-update">
                {t.updateAvailable(update)}
              </p>
            )}
            {name && <p className="text-[1.1vw] text-slate-600">{name}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
