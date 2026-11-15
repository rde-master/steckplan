// Netzwerk des Player-Rechners für die Anzeige: verbunden?, IP-Adressen (je Anschluss), Name des WLANs, Signal und
// Band, per Kabel?, Energiesparen des WLAN-Adapters (Windows). Die Werte liefert je System ein Bordmittel
// (Windows: netsh/powercfg, macOS: networksetup/ipconfig/system_profiler, Linux: iwgetid/nmcli).
import { execFile } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { bandOfChannel, dbmToPercent } from '@steckplan/core';

export interface NetworkAddress {
  /** Name des Anschlusses, z. B. „WLAN“, „Ethernet“, „en0“ */
  name: string;
  address: string;
}

export interface NetworkInfo {
  connected: boolean;
  addresses: NetworkAddress[];
  /** Name des WLANs (wenn per WLAN verbunden und ermittelbar) */
  wifi?: string;
  /** per Kabel angeschlossen */
  wired?: boolean;
  /** WLAN-Signal 0–100 % und Band (GHz) */
  signal?: number;
  bandGHz?: number;
}

export interface WifiDetails {
  ssid?: string;
  /** Name des WLAN-Anschlusses (z. B. „WLAN“, „en0“, „wlan0“) */
  iface?: string;
  signal?: number;
  bandGHz?: number;
}

/** IPv4-Adressen der Anschlüsse (ohne „dieser Rechner“ und ohne automatische 169.254-Adressen) */
export function localAddresses(interfaces: ReturnType<typeof networkInterfaces> = networkInterfaces()): NetworkAddress[] {
  const result: NetworkAddress[] = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const e of entries ?? []) {
      if (e.family !== 'IPv4' || e.internal || e.address.startsWith('169.254.')) continue;
      result.push({ name, address: e.address });
    }
  }
  return result;
}

/** Windows: „netsh wlan show interfaces“ → SSID (nicht BSSID) */
export function parseNetsh(output: string): string | undefined {
  const m = /^\s*SSID\s*:\s*(.+?)\s*$/m.exec(output);
  return m?.[1] || undefined;
}

/** macOS: „networksetup -getairportnetwork en0“ bzw. „ipconfig getsummary en0“ → Name */
export function parseMacWifi(output: string): string | undefined {
  const a = /Current Wi-Fi Network:\s*(.+?)\s*$/m.exec(output);
  if (a?.[1]) return a[1];
  const b = /^\s*SSID\s*:\s*(.+?)\s*$/m.exec(output);
  const name = b?.[1];
  return name && name !== '<redacted>' ? name : undefined;
}

/** macOS: Gerät des WLANs aus „networksetup -listallhardwareports“ */
export function parseMacWifiDevice(output: string): string | undefined {
  const m = /Hardware Port:\s*(?:Wi-Fi|AirPort)\s*\nDevice:\s*(\S+)/.exec(output);
  return m?.[1];
}

/** Linux: „nmcli -t -f active,ssid dev wifi“ → aktives Netz */
export function parseNmcli(output: string): string | undefined {
  for (const line of output.split('\n')) {
    const m = /^(?:yes|ja):(.+)$/.exec(line.trim());
    if (m?.[1]) return m[1].replace(/\\:/g, ':');
  }
  return undefined;
}

/** Windows: „netsh wlan show interfaces“ → Name, Anschluss, Signal, Band (bzw. aus dem Kanal); deutsch und englisch */
export function parseNetshDetails(output: string): WifiDetails {
  const field = (re: RegExp) => re.exec(output)?.[1]?.trim();
  const ssid = parseNetsh(output);
  // nur, wenn verbunden (sonst stehen alte Werte da)
  if (!ssid) return {};
  const iface = field(/^\s*Name\s*:\s*(.+?)\s*$/m);
  const signal = field(/^\s*Signal\s*:\s*(\d+)\s*%/m);
  const band = field(/^\s*Band\s*:\s*([\d.,]+)\s*GHz/m);
  const channel = field(/^\s*(?:Channel|Kanal)\s*:\s*(\d+)/m);
  const bandGHz = band ? Number(band.replace(',', '.')) : channel ? bandOfChannel(Number(channel)) : undefined;
  return { ssid, ...(iface ? { iface } : {}), ...(signal ? { signal: Number(signal) } : {}), ...(bandGHz ? { bandGHz } : {}) };
}

/** Linux: „nmcli -t -f active,ssid,signal,freq,device dev wifi“ → aktives Netz */
export function parseNmcliDetails(output: string): WifiDetails {
  for (const raw of output.split('\n')) {
    const line = raw.trim();
    if (!/^(?:yes|ja):/.test(line)) continue;
    // Felder durch „:“ getrennt, „\:“ im Namen
    const parts = line.split(/(?<!\\):/).map((p) => p.replace(/\\:/g, ':'));
    const [, ssid, signal, freq, device] = parts;
    const mhz = Number(/(\d+)/.exec(freq ?? '')?.[1]);
    const bandGHz = mhz >= 5925 ? 6 : mhz >= 4900 ? 5 : mhz > 0 ? 2.4 : undefined;
    return { ...(ssid ? { ssid } : {}), ...(device ? { iface: device } : {}), ...(signal && Number.isFinite(Number(signal)) ? { signal: Number(signal) } : {}), ...(bandGHz ? { bandGHz } : {}) };
  }
  return {};
}

/** macOS: „system_profiler SPAirPortDataType“ → Kanal/Band und Signal des aktuellen Netzes */
export function parseMacProfiler(output: string): WifiDetails {
  const current = output.split(/Current Network Information:/)[1];
  if (!current) return {};
  const block = current.split(/Other Local Wi-Fi Networks:/)[0]!;
  const channel = /Channel:\s*(\d+)(?:\s*\((\d+)GHz)?/.exec(block);
  const dbm = /Signal \/ Noise:\s*(-?\d+)\s*dBm/.exec(block);
  const bandGHz = channel?.[2] ? Number(channel[2]) : channel?.[1] ? bandOfChannel(Number(channel[1])) : undefined;
  return { ...(dbm ? { signal: dbmToPercent(Number(dbm[1])) } : {}), ...(bandGHz ? { bandGHz } : {}) };
}

/** Windows: „powercfg /query … Drahtlosadapter Energiesparmodus“ → [Netzbetrieb, Akku] (0 = Höchstleistung) */
export function parsePowercfg(output: string): { ac?: number; dc?: number } {
  // nur die beiden aktuellen Werte stehen als 0x…-Zahl da (Netzbetrieb zuerst) – unabhängig von der Sprache
  const values = [...output.matchAll(/:\s*0x([0-9a-f]+)\s*$/gim)].map((m) => parseInt(m[1]!, 16));
  if (values.length < 2) return {};
  return { ac: values[values.length - 2], dc: values[values.length - 1] };
}

/** per Kabel: Adresse an einem Anschluss, der nicht das WLAN und nicht virtuell ist */
export function hasWiredAddress(addresses: NetworkAddress[], wifiIface: string | undefined): boolean {
  return addresses.some((a) => a.name !== wifiIface && /^(eth|en|ethernet|lan)/i.test(a.name) && !/^wl|wi-?fi|wlan|vethernet|virtual|vmware|vbox|docker|bridge|tun|tap|wsl/i.test(a.name));
}

function run(cmd: string, args: string[], timeout = 3000): Promise<string> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, windowsHide: true }, (error, stdout) => resolve(error ? '' : String(stdout)));
  });
}

/** WLAN-Anschluss, Signal und Band */
export async function wifiDetails(platform: NodeJS.Platform = process.platform): Promise<WifiDetails> {
  if (platform === 'win32') return parseNetshDetails(await run('netsh', ['wlan', 'show', 'interfaces']));
  if (platform === 'darwin') {
    const device = parseMacWifiDevice(await run('networksetup', ['-listallhardwareports'])) ?? 'en0';
    return { iface: device, ...parseMacProfiler(await run('system_profiler', ['SPAirPortDataType'], 10_000)) };
  }
  return parseNmcliDetails(await run('nmcli', ['-t', '-f', 'active,ssid,signal,freq,device', 'dev', 'wifi']));
}

/** Windows: Energiesparmodus des WLAN-Adapters (Untergruppe „Drahtlosadapter“, Einstellung „Energiesparmodus“) */
export async function wifiPowerSave(platform: NodeJS.Platform = process.platform): Promise<{ ac?: number; dc?: number }> {
  if (platform !== 'win32') return {};
  return parsePowercfg(await run('powercfg', ['/query', 'SCHEME_CURRENT', '19cbb8fa-5279-450e-9fac-8a3d5fedd0c1', '12bbebe6-58d6-4636-95bb-3217ef867c1a']));
}

export async function wifiName(platform: NodeJS.Platform = process.platform): Promise<string | undefined> {
  if (platform === 'win32') return parseNetsh(await run('netsh', ['wlan', 'show', 'interfaces']));
  if (platform === 'darwin') {
    const device = parseMacWifiDevice(await run('networksetup', ['-listallhardwareports'])) ?? 'en0';
    return parseMacWifi(await run('networksetup', ['-getairportnetwork', device])) ?? parseMacWifi(await run('ipconfig', ['getsummary', device]));
  }
  const iw = (await run('iwgetid', ['-r'])).trim();
  return iw || parseNmcli(await run('nmcli', ['-t', '-f', 'active,ssid', 'dev', 'wifi']));
}

export async function networkInfo(): Promise<NetworkInfo> {
  const addresses = localAddresses();
  if (!addresses.length) return { connected: false, addresses };
  const [wifi, details] = await Promise.all([wifiName().catch(() => undefined), wifiDetails().catch((): WifiDetails => ({}))]);
  const wired = hasWiredAddress(addresses, details.iface);
  return {
    connected: true,
    addresses,
    ...(wifi ? { wifi } : {}),
    ...(wired ? { wired } : {}),
    ...(wifi && details.signal !== undefined ? { signal: details.signal } : {}),
    ...(wifi && details.bandGHz !== undefined ? { bandGHz: details.bandGHz } : {}),
  };
}
