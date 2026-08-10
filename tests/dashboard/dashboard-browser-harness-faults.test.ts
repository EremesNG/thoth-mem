import { createHash } from 'node:crypto';
import { createServer, type Server, type Socket } from 'node:net';
import { describe, expect, it } from 'vitest';

import { harnessFaultTestApi, withDashboardBrowser } from './dashboard-browser-harness.js';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

describe('dashboard browser harness faults', () => {
  it('bounds a stalled CDP send and clears pending ownership', async () => {
    const peer = await startPeer('stall');
    try {
      const cdp = await harnessFaultTestApi.connectCdp(peer.url, { sendTimeoutMs: 80 });
      await expect(cdp.send('Runtime.enable')).rejects.toThrow(/timeout/i);
      expect(cdp.pendingCount()).toBe(0);
      cdp.close();
    } finally {
      await peer.close();
    }
  });

  it.each(['destroy', 'end', 'close-frame', 'malformed-json'] as const)(
    'rejects and clears every pending request when the peer emits %s',
    async (mode) => {
      const peer = await startPeer(mode);
      try {
        const cdp = await harnessFaultTestApi.connectCdp(peer.url, { sendTimeoutMs: 2_000 });
        let settlements = 0;
        await expect(cdp.send('Runtime.enable').finally(() => { settlements += 1; })).rejects.toThrow();
        expect(cdp.pendingCount()).toBe(0);
        expect(settlements).toBe(1);
        cdp.close();
      } finally {
        await peer.close();
      }
    },
  );

  it('aborts and clears every pending CDP request', async () => {
    const peer = await startPeer('stall');
    const controller = new AbortController();
    try {
      const cdp = await harnessFaultTestApi.connectCdp(peer.url, { signal: controller.signal, sendTimeoutMs: 2_000 });
      const pending = cdp.send('Runtime.enable');
      controller.abort(new Error('injected abort'));
      await expect(pending).rejects.toThrow(/abort/i);
      expect(cdp.pendingCount()).toBe(0);
      cdp.close();
    } finally {
      await peer.close();
    }
  });

  it.each([
    ['bad-status', /rejected/i],
    ['bad-upgrade', /upgrade/i],
    ['bad-connection', /connection/i],
    ['bad-accept', /accept/i],
    ['oversized-handshake', /byte limit/i],
  ] as const)('rejects malformed RFC6455 handshake %s', async (mode, message) => {
    const peer = await startPeer(mode);
    try {
      await expect(harnessFaultTestApi.connectCdp(peer.url)).rejects.toThrow(message);
    } finally {
      await peer.close();
    }
  });

  it.each([
    ['fragmented-frame', /fragmented/i],
    ['masked-frame', /masked server/i],
    ['binary-frame', /opcode/i],
    ['nonminimal-frame', /non-minimal/i],
    ['oversized-frame', /byte limit/i],
  ] as const)('rejects malformed RFC6455 payload %s and clears pending state', async (mode, message) => {
    const peer = await startPeer(mode);
    try {
      const cdp = await harnessFaultTestApi.connectCdp(peer.url, { sendTimeoutMs: 2_000 });
      await expect(cdp.send('Runtime.enable')).rejects.toThrow(message);
      expect(cdp.pendingCount()).toBe(0);
      cdp.close();
    } finally {
      await peer.close();
    }
  });

  it.each(['bridge', 'vite', 'browser', 'target', 'cdp', 'init', 'work'] as const)(
    'applies the hard lifecycle deadline and cleans resources after %s setup stalls',
    async (phase) => {
      const evidence = createEvidence();
      await expect(withDashboardBrowser(async () => undefined, {
        faultInjection: { phase, deadlineMs: 600, onResource: evidence.record },
      })).rejects.toThrow(/deadline/i);
      await expectResourcesClean(evidence);
    },
    10_000,
  );

  it('continues independently bounded cleanup after one cleanup step fails', async () => {
    const evidence = createEvidence();
    await expect(withDashboardBrowser(async () => undefined, {
      faultInjection: { cleanupFault: 'browser', deadlineMs: 5_000, onResource: evidence.record },
    })).rejects.toThrow(/cleanup failed/i);
    await expectResourcesClean(evidence);
  }, 10_000);

  it.each(['bridge', 'vite'] as const)('recovers deterministically from an injected %s port collision', async (collision) => {
    const evidence = createEvidence();
    await withDashboardBrowser(async (browser) => {
      await browser.goto('/');
      await browser.waitFor(`document.querySelectorAll('.graph-navigator li').length > 0`);
      expect(await browser.count('.graph-navigator li')).toBeGreaterThan(0);
    }, { faultInjection: { collision, deadlineMs: 10_000, onResource: evidence.record } });
    await expectResourcesClean(evidence);
  }, 15_000);
});

type PeerMode =
  | 'stall' | 'destroy' | 'end' | 'close-frame' | 'malformed-json'
  | 'bad-status' | 'bad-upgrade' | 'bad-connection' | 'bad-accept' | 'oversized-handshake'
  | 'fragmented-frame' | 'masked-frame' | 'binary-frame' | 'nonminimal-frame' | 'oversized-frame';

interface Evidence {
  profiles: string[];
  pids: number[];
  ports: number[];
  record: (kind: 'profile' | 'pid' | 'port', value: string | number) => void;
}

function createEvidence(): Evidence {
  const evidence: Evidence = {
    profiles: [], pids: [], ports: [],
    record(kind, value) {
      if (kind === 'profile') evidence.profiles.push(String(value));
      if (kind === 'pid') evidence.pids.push(Number(value));
      if (kind === 'port') evidence.ports.push(Number(value));
    },
  };
  return evidence;
}

async function expectResourcesClean(evidence: Evidence): Promise<void> {
  expect(evidence.profiles.every((path) => !harnessFaultTestApi.pathExists(path))).toBe(true);
  expect(evidence.pids.every((pid) => !harnessFaultTestApi.processExists(pid))).toBe(true);
  expect((await Promise.all(evidence.ports.map((port) => harnessFaultTestApi.portListens(port)))).every((listens) => !listens)).toBe(true);
}

async function startPeer(mode: PeerMode): Promise<{ url: string; close: () => Promise<void> }> {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    let request = '';
    let upgraded = false;
    socket.on('data', (chunk) => {
      if (upgraded) {
        respondToFrame(socket, mode);
        return;
      }
      request += chunk.toString('latin1');
      if (!request.includes('\r\n\r\n')) return;
      const key = /Sec-WebSocket-Key:\s*(.+)\r\n/i.exec(request)?.[1]?.trim() ?? '';
      const accept = mode === 'bad-accept' ? 'invalid' : createHash('sha1').update(key + GUID).digest('base64');
      if (mode === 'oversized-handshake') {
        socket.write(`HTTP/1.1 101 Switching Protocols\r\nX-Fill: ${'x'.repeat(17_000)}`);
        return;
      }
      socket.write(`${mode === 'bad-status' ? 'HTTP/1.1 200 OK' : 'HTTP/1.1 101 Switching Protocols'}\r\n`);
      socket.write(`Upgrade: ${mode === 'bad-upgrade' ? 'h2c' : 'websocket'}\r\n`);
      socket.write(`Connection: ${mode === 'bad-connection' ? 'keep-alive' : 'keep-alive, Upgrade'}\r\n`);
      socket.write(`Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
      upgraded = true;
    });
  });
  const port = await listen(server);
  return {
    url: `ws://127.0.0.1:${port}/devtools/page/fault`,
    close: async () => {
      const closed = [...sockets].map((socket) => new Promise<void>((resolveClose) => socket.once('close', () => resolveClose())));
      for (const socket of sockets) socket.destroy();
      await Promise.all(closed);
      await close(server);
      expect(sockets.size).toBe(0);
    },
  };
}

function respondToFrame(socket: Socket, mode: PeerMode): void {
  if (mode === 'destroy') { socket.destroy(); return; }
  if (mode === 'end') { socket.end(); return; }
  if (mode === 'close-frame') { socket.write(frame(0x8, Buffer.alloc(0))); return; }
  if (mode === 'malformed-json') { socket.write(frame(0x1, Buffer.from('{invalid'))); return; }
  if (mode === 'fragmented-frame') { socket.write(frame(0x1, Buffer.from('{}'), { fin: false })); return; }
  if (mode === 'masked-frame') { socket.write(frame(0x1, Buffer.from('{}'), { masked: true })); return; }
  if (mode === 'binary-frame') { socket.write(frame(0x2, Buffer.from('{}'))); return; }
  if (mode === 'nonminimal-frame') { socket.write(Buffer.from([0x81, 126, 0, 2, 0x7b, 0x7d])); return; }
  if (mode === 'oversized-frame') {
    const header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(9_000_000n, 2); socket.write(header);
  }
}

function frame(opcode: number, payload: Buffer, options: { fin?: boolean; masked?: boolean } = {}): Buffer {
  const fin = options.fin === false ? 0 : 0x80;
  const masked = options.masked ? 0x80 : 0;
  return Buffer.concat([Buffer.from([fin | opcode, masked | payload.length]), payload]);
}

function listen(server: Server): Promise<number> {
  return new Promise((resolvePort, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('missing peer port'));
      resolvePort(address.port);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolveClose) => server.close(() => resolveClose()));
}
