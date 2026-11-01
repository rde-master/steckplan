// WLAN-QR-Code im Standardformat WIFI:T:WPA;S:<SSID>;P:<Passwort>;H:<true|false>;;
import type { WifiNetwork } from '../model/schema';

/** Sonderzeichen escapen: \ ; , : " */
export function escapeWifi(value: string): string {
  return value.replace(/([\\;,:"])/g, '\\$1');
}

export function wifiQrPayload(network: Pick<WifiNetwork, 'ssid' | 'security' | 'hidden'>, password: string | undefined): string {
  const open = network.security === 'open';
  const parts = [`T:${open ? 'nopass' : 'WPA'}`, `S:${escapeWifi(network.ssid)}`];
  if (!open) parts.push(`P:${escapeWifi(password ?? '')}`);
  parts.push(`H:${network.hidden ? 'true' : 'false'}`);
  return `WIFI:${parts.join(';')};;`;
}
