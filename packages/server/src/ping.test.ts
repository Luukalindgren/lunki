import { describe, expect, it } from 'vitest';
import { createServer } from './server';

describe('WebSocket-ping', () => {
  it('pingaa selvästi alle Cloudflaren 100 s hiljaisuusrajan', () => {
    const transport = createServer().transport as unknown as {
      pingIntervalMS: number;
      pingMaxRetries: number;
    };
    expect(transport.pingIntervalMS).toBeGreaterThan(0);
    expect(transport.pingIntervalMS).toBeLessThanOrEqual(30_000);
    expect(transport.pingMaxRetries).toBeGreaterThan(0);
  });
});
