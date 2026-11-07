// OSC 1.0 lesen (UDP-Pakete): Nachrichten und Bundles; Argumente int32, float32, string, blob (übersprungen),
// True/False/Nil/Impulse. Daraus werden Befehle für die Vorstellung.
import { parseRemoteCommand, type RemoteAction, type RemoteCommand } from '@steckplan/core';

export interface OscMessage {
  address: string;
  args: (number | string | boolean | null)[];
}

function readString(buf: Buffer, offset: number): { value: string; next: number } {
  const end = buf.indexOf(0, offset);
  if (end < 0) throw new Error('OSC: Zeichenkette ohne Ende');
  return { value: buf.toString('utf8', offset, end), next: (end + 4) & ~3 };
}

/** Ein UDP-Paket in Nachrichten zerlegen (Bundles werden aufgelöst) */
export function parseOsc(buf: Buffer): OscMessage[] {
  if (buf.length >= 16 && buf.toString('ascii', 0, 8) === '#bundle\0') {
    const out: OscMessage[] = [];
    let offset = 16; // „#bundle“ + Zeitmarke
    while (offset + 4 <= buf.length) {
      const size = buf.readInt32BE(offset);
      offset += 4;
      if (size <= 0 || offset + size > buf.length) break;
      out.push(...parseOsc(buf.subarray(offset, offset + size)));
      offset += size;
    }
    return out;
  }
  const address = readString(buf, 0);
  if (!address.value.startsWith('/')) throw new Error('OSC: keine Adresse');
  let offset = address.next;
  const args: OscMessage['args'] = [];
  if (offset < buf.length && buf[offset] === 0x2c) {
    const tags = readString(buf, offset);
    offset = tags.next;
    for (const tag of tags.value.slice(1)) {
      switch (tag) {
        case 'i':
          args.push(buf.readInt32BE(offset));
          offset += 4;
          break;
        case 'f':
          args.push(buf.readFloatBE(offset));
          offset += 4;
          break;
        case 'd':
          args.push(buf.readDoubleBE(offset));
          offset += 8;
          break;
        case 'h':
          args.push(Number(buf.readBigInt64BE(offset)));
          offset += 8;
          break;
        case 's':
        case 'S': {
          const s = readString(buf, offset);
          args.push(s.value);
          offset = s.next;
          break;
        }
        case 'b': {
          const size = buf.readInt32BE(offset);
          offset += 4 + ((size + 3) & ~3);
          args.push(null);
          break;
        }
        case 'T':
          args.push(true);
          break;
        case 'F':
          args.push(false);
          break;
        case 'N':
        case 'I':
          args.push(null);
          break;
        default:
          throw new Error(`OSC: unbekannter Typ ${tag}`);
      }
    }
  }
  return [{ address: address.value, args }];
}

const ADDRESSES: Record<string, RemoteAction> = {
  play: 'play',
  start: 'play',
  pause: 'pause',
  stop: 'stop',
  toggle: 'toggle',
  forward: 'forward',
  back: 'back',
  seek: 'seek',
  item: 'item',
  lied: 'item',
  next: 'next',
  prev: 'prev',
  'scene/next': 'sceneNext',
  'scene/prev': 'scenePrev',
  'tc/forward': 'tcForward',
  'tc/back': 'tcBack',
  tap: 'tap',
};

/** Standard-Sprungweite für /forward und /back ohne Argument (Sekunden) */
export const DEFAULT_NUDGE = 5;
/** Standard-Verschiebung des Timecodes (/tc/forward, /tc/back) ohne Argument (Sekunden) */
export const DEFAULT_TC_NUDGE = 0.1;

/**
 * OSC-Nachricht → Befehl. Adressen unter /steckplan/… (z. B. /steckplan/play, /steckplan/item 3).
 * Taster senden oft beim Loslassen 0 – bei Befehlen ohne Wert wird 0/false ignoriert.
 */
export function oscToCommand(message: OscMessage): RemoteCommand | null {
  // Nummer in der Adresse: /steckplan/lied/13 bzw. /steckplan/item/13 (für Pulte, die ohne Wert senden)
  const numbered = /^\/steckplan\/(?:lied|item)\/(\d{1,3})$/.exec(message.address);
  if (numbered) {
    const first = message.args[0];
    if (first === 0 || first === false) return null; // Loslassen eines Tasters
    return parseRemoteCommand('item', Number(numbered[1]));
  }
  const match = /^\/steckplan\/(.+)$/.exec(message.address);
  const action = match ? ADDRESSES[match[1]!] : undefined;
  if (!action) return null;
  const first = message.args[0];
  const value = typeof first === 'number' ? first : typeof first === 'string' ? Number(first) : undefined;
  const needsValue = action === 'seek' || action === 'item';
  const relative = action === 'forward' || action === 'back' || action === 'tcForward' || action === 'tcBack';
  const takesValue = needsValue || relative;
  if (!takesValue && (first === 0 || first === false)) return null; // Loslassen eines Tasters
  if (relative) {
    if (value === 0) return null;
    return parseRemoteCommand(action, value ?? (action === 'tcForward' || action === 'tcBack' ? DEFAULT_TC_NUDGE : DEFAULT_NUDGE));
  }
  return parseRemoteCommand(action, takesValue ? value : undefined);
}
