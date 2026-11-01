// IPv4 und CIDR (PLAN.md 7.3) – kleine eigene Funktionen, keine Zusatzbibliothek.

export function parseIPv4(text: string | undefined): number | null {
  if (!text) return null;
  const parts = text.trim().split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value;
}

export function formatIPv4(value: number): string {
  return [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join('.');
}

export interface Cidr {
  network: number;
  prefix: number;
  broadcast: number;
  /** Anzahl Adressen im Netz */
  size: number;
}

/** „192.168.1.0/24“ → Netz; die Netzadresse wird aus der IP berechnet (192.168.1.17/24 → 192.168.1.0). */
export function parseCidr(text: string | undefined): Cidr | null {
  const match = /^\s*([\d.]+)\s*\/\s*(\d{1,2})\s*$/.exec(text ?? '');
  if (!match) return null;
  const ip = parseIPv4(match[1]);
  const prefix = Number(match[2]);
  if (ip === null || prefix > 32) return null;
  const size = 2 ** (32 - prefix);
  const network = Math.floor(ip / size) * size;
  return { network, prefix, broadcast: network + size - 1, size };
}

export function formatCidr(cidr: Cidr): string {
  return `${formatIPv4(cidr.network)}/${cidr.prefix}`;
}

export function inSubnet(ip: number, cidr: Cidr): boolean {
  return ip >= cidr.network && ip <= cidr.broadcast;
}

/** Netz- oder Broadcast-Adresse (bei /31 und /32 gibt es keine). */
export function isReservedAddress(ip: number, cidr: Cidr): boolean {
  return cidr.prefix < 31 && (ip === cidr.network || ip === cidr.broadcast);
}

/** Erste freie Adresse im Netz (ohne Netz-/Broadcast-Adresse, Gateway und belegte). */
export function nextFreeIp(cidr: Cidr, used: Iterable<number>, gateway?: number | null): number | null {
  const taken = new Set(used);
  if (gateway !== null && gateway !== undefined) taken.add(gateway);
  const first = cidr.prefix >= 31 ? cidr.network : cidr.network + 1;
  const last = cidr.prefix >= 31 ? cidr.broadcast : cidr.broadcast - 1;
  for (let ip = first; ip <= last; ip++) if (!taken.has(ip)) return ip;
  return null;
}
