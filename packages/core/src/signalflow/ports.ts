// Wirksame Anschlüsse einer Instanz im Signalfluss.
// Geräte: Anschlüsse der Vorlage (Eingänge links, Ausgänge und Ein-/Ausgänge rechts).
// Multicore (Kabeltyp mit Adern): je Ader ein Anschluss an Ende A (links) und Ende B (rechts).
import type { CableChannel, PortDef, Template } from '../model/schema';

export type PortRole = 'in' | 'out' | 'bi';
export type PortSide = 'left' | 'right';

export interface EffectivePort {
  id: string;
  label: string;
  connector: string;
  signal: string;
  role: PortRole;
  side: PortSide;
  isNetwork?: boolean;
  isPower?: boolean;
  fuseA?: number;
  phase?: 'L1' | 'L2' | 'L3' | '3P';
  /** nur Anzeige (z. B. Netzwerk-Kanal am Pult), kein Anschluss zum Verbinden */
  virtual?: boolean;
}

export function isMulticore(template: Template | undefined): boolean {
  return template?.kind === 'cableType' && template.channels !== undefined;
}

/** Kann die Vorlage im Signalfluss als Kasten platziert werden? */
export function isPlaceableInSignalFlow(template: Template): boolean {
  return template.kind !== 'cableType' || isMulticore(template);
}

export function endNames(template: Pick<Template, 'endALabel' | 'endBLabel'>): { a: string; b: string } {
  return { a: template.endALabel?.trim() || 'A', b: template.endBLabel?.trim() || 'B' };
}

function channelPorts(channel: CableChannel, ends: { a: string; b: string }): [EffectivePort, EffectivePort] {
  const roleA: PortRole = channel.direction === 'aToB' ? 'in' : channel.direction === 'bToA' ? 'out' : 'bi';
  const roleB: PortRole = channel.direction === 'aToB' ? 'out' : channel.direction === 'bToA' ? 'in' : 'bi';
  return [
    { id: `${channel.id}:a`, label: `${channel.label} (${ends.a})`, connector: channel.connectorA, signal: channel.signal, role: roleA, side: 'left' },
    { id: `${channel.id}:b`, label: `${channel.label} (${ends.b})`, connector: channel.connectorB, signal: channel.signal, role: roleB, side: 'right' },
  ];
}

function devicePort(port: PortDef): EffectivePort {
  return {
    id: port.id,
    label: port.label,
    connector: port.connector,
    signal: port.signal,
    role: port.direction,
    side: port.direction === 'in' ? 'left' : 'right',
    ...(port.isNetwork ? { isNetwork: true } : {}),
    ...(port.isPower ? { isPower: true } : {}),
    ...(port.fuseA ? { fuseA: port.fuseA } : {}),
    ...(port.phase ? { phase: port.phase } : {}),
  };
}

export function templatePorts(template: Template | undefined): EffectivePort[] {
  if (!template) return [];
  if (isMulticore(template)) {
    const ends = endNames(template);
    return (template.channels ?? []).flatMap((c) => channelPorts(c, ends));
  }
  return (template.ports ?? []).map(devicePort);
}

/** Grobe Signalart (für Farben und Symbole, z. B. auf Etiketten) */
export type SignalKind = 'audio' | 'dmx' | 'network' | 'power' | 'video' | 'other';

export function signalKind(port: Pick<EffectivePort, 'signal' | 'isNetwork' | 'isPower'> | undefined): SignalKind {
  if (!port) return 'other';
  if (port.isPower) return 'power';
  if (port.isNetwork) return 'network';
  const s = port.signal.toLowerCase();
  if (/strom|power|netzspannung|230|400 ?v/.test(s)) return 'power';
  if (/dmx|artnet|art-net|sacn/.test(s)) return 'dmx';
  if (/netz|ethernet|lan|dante|avb|aes67|madi/.test(s)) return 'network';
  if (/video|sdi|hdmi|dvi|vga/.test(s)) return 'video';
  if (/audio|aes|mic|line|analog|lautspr|speaker|spdif/.test(s)) return 'audio';
  return 'other';
}

export function findPort(template: Template | undefined, portId: string): EffectivePort | undefined {
  return templatePorts(template).find((p) => p.id === portId);
}

/** Kann ein Signal von a nach b fließen? (Ausgang → Eingang; Ein-/Ausgänge passen in beide Richtungen) */
export function canFlow(from: PortRole, to: PortRole): boolean {
  return (from === 'out' || from === 'bi') && (to === 'in' || to === 'bi');
}

export function normalizeConnector(connector: string | undefined): string {
  return (connector ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}
