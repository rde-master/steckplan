// Netzwerkplanung: Prüfungen, Netzwerkliste, nächste freie IP.
import type { DeviceInstance, Project, Subnet, Template } from '../model/schema';
import type { Issue } from '../signalflow/checks';
import { formatIPv4, inSubnet, isReservedAddress, nextFreeIp, parseCidr, parseIPv4 } from './ip';

type NetworkEntry = NonNullable<DeviceInstance['network']>[number];

export function networkPorts(template: Template | undefined): { id: string; label: string }[] {
  return (template?.ports ?? []).filter((p) => p.isNetwork).map((p) => ({ id: p.id, label: p.label }));
}

export function checkNetwork(project: Pick<Project, 'devices' | 'network'>, templates: Map<string, Template>): Issue[] {
  const issues: Issue[] = [];
  const subnets = new Map(project.network.subnets.map((s) => [s.id, s]));
  for (const subnet of project.network.subnets) {
    const cidr = parseCidr(subnet.cidr);
    if (!cidr) {
      issues.push({ id: `subnet-cidr:${subnet.id}`, severity: 'error', message: `Subnetz „${subnet.name}“: „${subnet.cidr}“ ist kein gültiges Netz (z. B. 192.168.1.0/24).`, objectIds: [subnet.id] });
      continue;
    }
    if (subnet.gateway) {
      const gw = parseIPv4(subnet.gateway);
      if (gw === null) issues.push({ id: `gateway:${subnet.id}`, severity: 'error', message: `Subnetz „${subnet.name}“: Gateway „${subnet.gateway}“ ist keine gültige IP.`, objectIds: [subnet.id] });
      else if (!inSubnet(gw, cidr)) issues.push({ id: `gateway:${subnet.id}`, severity: 'warning', message: `Subnetz „${subnet.name}“: Gateway liegt außerhalb des Netzes.`, objectIds: [subnet.id] });
    }
  }

  const byIp = new Map<number, { device: DeviceInstance; port: string }[]>();
  for (const device of project.devices) {
    const template = templates.get(device.templateId);
    const ports = new Map(networkPorts(template).map((p) => [p.id, p.label]));
    for (const entry of device.network ?? []) {
      const where = `„${device.label}“${ports.size > 1 ? ` (${ports.get(entry.portId) ?? entry.portId})` : ''}`;
      if (entry.mode === 'dhcp') continue;
      if (!entry.ip?.trim()) {
        issues.push({ id: `ip-missing:${device.id}:${entry.portId}`, severity: 'warning', message: `${where}: statische IP fehlt.`, objectIds: [device.id] });
        continue;
      }
      const ip = parseIPv4(entry.ip);
      if (ip === null) {
        issues.push({ id: `ip-invalid:${device.id}:${entry.portId}`, severity: 'error', message: `${where}: „${entry.ip}“ ist keine gültige IP-Adresse.`, objectIds: [device.id] });
        continue;
      }
      byIp.set(ip, [...(byIp.get(ip) ?? []), { device, port: entry.portId }]);
      const subnet = entry.subnetId ? subnets.get(entry.subnetId) : undefined;
      const cidr = subnet ? parseCidr(subnet.cidr) : null;
      if (subnet && cidr) {
        if (!inSubnet(ip, cidr)) issues.push({ id: `ip-outside:${device.id}:${entry.portId}`, severity: 'warning', message: `${where}: ${entry.ip} liegt außerhalb von „${subnet.name}“ (${subnet.cidr}).`, objectIds: [device.id] });
        else if (isReservedAddress(ip, cidr)) issues.push({ id: `ip-reserved:${device.id}:${entry.portId}`, severity: 'error', message: `${where}: ${entry.ip} ist die Netz- oder Broadcast-Adresse von „${subnet.name}“.`, objectIds: [device.id] });
      }
    }
  }
  for (const [ip, list] of byIp) {
    if (list.length > 1) {
      issues.push({ id: `ip-duplicate:${ip}`, severity: 'error', message: `IP ${formatIPv4(ip)} ist mehrfach vergeben: ${list.map((l) => l.device.label).join(', ')}.`, objectIds: [...new Set(list.map((l) => l.device.id))] });
    }
  }
  return issues;
}

/** Nächste freie IP im Subnetz, berücksichtigt alle statischen IPs im Projekt. */
export function suggestIp(project: Pick<Project, 'devices'>, subnet: Subnet): string | null {
  const cidr = parseCidr(subnet.cidr);
  if (!cidr) return null;
  const used: number[] = [];
  for (const device of project.devices) for (const entry of device.network ?? []) {
    const ip = entry.mode === 'static' ? parseIPv4(entry.ip) : null;
    if (ip !== null) used.push(ip);
  }
  const free = nextFreeIp(cidr, used, parseIPv4(subnet.gateway));
  return free === null ? null : formatIPv4(free);
}

export interface NetworkRow {
  deviceId: string;
  device: string;
  port: string;
  mode: NetworkEntry['mode'] | '';
  ip: string;
  subnet: string;
  hostname: string;
}

export function buildNetworkList(project: Pick<Project, 'devices' | 'network'>, templates: Map<string, Template>): NetworkRow[] {
  const subnets = new Map(project.network.subnets.map((s) => [s.id, s]));
  const rows: NetworkRow[] = [];
  for (const device of project.devices) {
    const ports = networkPorts(templates.get(device.templateId));
    for (const port of ports) {
      const entry = device.network?.find((n) => n.portId === port.id);
      rows.push({
        deviceId: device.id,
        device: device.label,
        port: port.label,
        mode: entry?.mode ?? '',
        ip: entry?.mode === 'static' ? (entry.ip ?? '') : entry?.mode === 'dhcp' ? 'DHCP' : '',
        subnet: entry?.subnetId ? (subnets.get(entry.subnetId)?.name ?? '') : '',
        hostname: entry?.hostname ?? '',
      });
    }
  }
  return rows.sort((a, b) => (parseIPv4(a.ip) ?? Infinity) - (parseIPv4(b.ip) ?? Infinity) || a.device.localeCompare(b.device, 'de', { numeric: true }));
}

/** Eintrag für einen Netzwerk-Anschluss setzen (ersetzt den vorhandenen). */
export function withNetworkEntry(device: DeviceInstance, entry: NetworkEntry): NetworkEntry[] {
  return [...(device.network ?? []).filter((n) => n.portId !== entry.portId), entry];
}
