import type { NetworkInterfaceInfo } from 'node:os';
import { describe, expect, it } from 'vitest';
import { lanAddresses } from './addresses';

const v4 = (address: string, internal = false) =>
  ({ address, family: 'IPv4', internal }) as NetworkInterfaceInfo;
const v6 = (address: string) =>
  ({ address, family: 'IPv6', internal: false }) as NetworkInterfaceInfo;

describe('lanAddresses', () => {
  it('wifin osoite ensin, Tailscale ja Docker perässä', () => {
    const list = lanAddresses({
      lo0: [v4('127.0.0.1', true)],
      utun4: [v4('100.101.102.103')],
      bridge100: [v4('192.168.64.1')],
      en0: [v6('fe80::1'), v4('192.168.1.23')],
    });
    expect(list.map((a) => a.address)).toEqual(['192.168.1.23', '192.168.64.1', '100.101.102.103']);
  });

  it('ohittaa paikalliset ja itse annetut osoitteet', () => {
    expect(lanAddresses({ lo: [v4('127.0.0.1', true)], en1: [v4('169.254.3.4')] })).toEqual([]);
  });

  it('tunnistaa yksityiset osoitealueet', () => {
    const list = lanAddresses({
      'Wi-Fi': [v4('172.20.10.2')],
      Ethernet: [v4('85.76.1.2')],
    });
    expect(list[0]).toEqual({ address: '172.20.10.2', iface: 'Wi-Fi' });
  });
});
