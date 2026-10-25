import type { NetworkInterfaceInfo } from 'node:os';

export interface LanAddress {
  address: string;
  iface: string;
}

const isPrivate = (ip: string): boolean =>
  ip.startsWith('192.168.') || ip.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);

/** Virtuaaliset sovittimet (Docker, VPN, virtuaalikoneet), joihin kaverit eivät yllä. */
const VIRTUAL =
  /^(docker|br-|bridge|veth|vmnet|vboxnet|utun|tailscale|zt|vEthernet|VirtualBox|VMware)/i;

/**
 * Lähiverkko-osoitteet, joista kaverit todennäköisimmin tavoittavat koneen,
 * paras ensin: wifi/ethernet ja yksityinen osoite ennen virtuaalisovittimia.
 */
export function lanAddresses(ifaces: NodeJS.Dict<NetworkInterfaceInfo[]>): LanAddress[] {
  const found: (LanAddress & { score: number })[] = [];
  for (const [iface, infos] of Object.entries(ifaces)) {
    for (const info of infos ?? []) {
      if (info.family !== 'IPv4' || info.internal) continue;
      if (info.address.startsWith('169.254.')) continue; // ei osoitetta reitittimeltä
      const score = (isPrivate(info.address) ? 2 : 0) + (VIRTUAL.test(iface) ? 0 : 1);
      found.push({ address: info.address, iface, score });
    }
  }
  return found.sort((a, b) => b.score - a.score).map(({ address, iface }) => ({ address, iface }));
}
