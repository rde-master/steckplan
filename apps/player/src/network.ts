// Netzwerk des Player-Rechners für die Anzeige: verbunden?, IP-Adressen (je Anschluss) und Name des WLANs.
// Den WLAN-Namen liefert je System ein Bordmittel (Windows: netsh, macOS: networksetup/ipconfig, Linux: iwgetid/nmcli).
import { execFile } from 'node:child_process';
import { networkInterfaces } from 'node:os';

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

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 3000, windowsHide: true }, (error, stdout) => resolve(error ? '' : String(stdout)));
  });
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
  const wifi = addresses.length ? await wifiName().catch(() => undefined) : undefined;
  return { connected: addresses.length > 0, addresses, ...(wifi ? { wifi } : {}) };
}
