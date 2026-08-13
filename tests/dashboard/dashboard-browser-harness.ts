import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createConnection, createServer as createNetServer, type Socket } from 'node:net';
import { TextDecoder } from 'node:util';

import { createServer as createViteServer, type ViteDevServer } from '../../dashboard/node_modules/vite/dist/node/index.js';
import { getConfig } from '../../src/config.js';
import { createHttpBridge } from '../../src/http-server.js';
import { Store } from '../../src/store/index.js';

type JsonObject = Record<string, unknown>;
type EventHandler = (params: JsonObject) => void | Promise<void>;
const WEBSOCKET_GUID='258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_HANDSHAKE_BYTES=16*1024;
const MAX_FRAME_BYTES=8*1024*1024;
const DEFAULT_CDP_TIMEOUT_MS=15_000;

class NodeWebSocket {
  private buffer = Buffer.alloc(0);
  private messageHandler: ((message: string) => void) | null = null;
  private failureHandler: ((error: Error) => void) | null = null;
  private failure: Error | null = null;
  private intentionalClose = false;

  private constructor(private readonly socket: Socket, initial: Buffer) {
    this.buffer=initial;
    socket.on('data', (chunk) => { this.buffer = Buffer.concat([this.buffer, chunk]); this.readFrames(); });
    socket.on('error',(error)=>this.fail(error));
    socket.on('end',()=>this.fail(new Error('Chrome DevTools websocket ended')));
    socket.on('close',()=>{if(!this.intentionalClose)this.fail(new Error('Chrome DevTools websocket closed'));});
    if(this.buffer.length)this.readFrames();
  }

  static async connect(url: string, timeoutMs: number, signal?:AbortSignal): Promise<NodeWebSocket> {
    const endpoint = new URL(url);
    if(endpoint.protocol!=='ws:')throw new Error(`Unsupported DevTools websocket protocol: ${endpoint.protocol}`);
    const socket = createConnection({ host:endpoint.hostname, port:Number(endpoint.port) });
    await bounded(new Promise<void>((resolveSocket,reject) => {
      const cleanup=()=>{socket.off('connect',onConnect);socket.off('error',onError);};
      const onConnect=()=>{cleanup();resolveSocket();};
      const onError=(error:Error)=>{cleanup();reject(error);};
      socket.once('connect',onConnect);socket.once('error',onError);
    }),timeoutMs,'Chrome DevTools TCP connection',signal).catch((error)=>{socket.destroy();throw error;});
    const key=randomBytes(16).toString('base64');
    socket.write(`GET ${endpoint.pathname}${endpoint.search} HTTP/1.1\r\nHost: ${endpoint.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    return await bounded(new Promise<NodeWebSocket>((resolveSocket,reject)=>{
      let headers=Buffer.alloc(0);let settled=false;
      const cleanup=()=>{socket.off('data',onData);socket.off('error',onError);socket.off('end',onEnd);};
      const rejectOnce=(error:Error)=>{if(settled)return;settled=true;cleanup();socket.destroy();reject(error);};
      const onError=(error:Error)=>rejectOnce(error);const onEnd=()=>rejectOnce(new Error('Chrome DevTools websocket ended during handshake'));
      const onData=(chunk:Buffer)=>{headers=Buffer.concat([headers,chunk]);if(headers.length>MAX_HANDSHAKE_BYTES){rejectOnce(new Error('Chrome DevTools websocket handshake exceeded byte limit'));return;}const boundary=headers.indexOf('\r\n\r\n');if(boundary<0)return;try{validateHandshake(headers.subarray(0,boundary).toString('latin1'),key);if(settled)return;settled=true;cleanup();resolveSocket(new NodeWebSocket(socket,headers.subarray(boundary+4)));}catch(error){rejectOnce(asError(error));}};
      socket.on('data',onData);socket.once('error',onError);socket.once('end',onEnd);
    }),timeoutMs,'Chrome DevTools websocket handshake',signal).catch((error)=>{socket.destroy();throw error;});
  }

  onMessage(handler:(message:string)=>void):void{this.messageHandler=handler;}
  onFailure(handler:(error:Error)=>void):void{this.failureHandler=handler;if(this.failure)handler(this.failure);}
  send(message:string):void{this.writeFrame(0x1,Buffer.from(message));}
  close():void{this.intentionalClose=true;if(!this.socket.destroyed)this.writeFrame(0x8,Buffer.alloc(0));this.socket.destroy();}

  private writeFrame(opcode:number,payload:Buffer):void{
    const mask=randomBytes(4);let header:Buffer;
    if(payload.length<126){header=Buffer.from([0x80|opcode,0x80|payload.length]);}
    else if(payload.length<=0xffff){header=Buffer.alloc(4);header[0]=0x80|opcode;header[1]=0x80|126;header.writeUInt16BE(payload.length,2);}
    else{header=Buffer.alloc(10);header[0]=0x80|opcode;header[1]=0x80|127;header.writeBigUInt64BE(BigInt(payload.length),2);}
    const masked=Buffer.alloc(payload.length);for(let index=0;index<payload.length;index+=1)masked[index]=payload[index]^mask[index%4];this.socket.write(Buffer.concat([header,mask,masked]));
  }

  private readFrames():void{
    try{
      if(this.buffer.length>MAX_FRAME_BYTES+14)throw new Error('CDP frame buffer exceeded byte limit');
      while(this.buffer.length>=2){const first=this.buffer[0];const second=this.buffer[1];if((first&0x70)!==0)throw new Error('Unsupported RFC6455 extension bits');if((first&0x80)===0)throw new Error('Fragmented CDP frames are unsupported');if((second&0x80)!==0)throw new Error('Masked server CDP frame rejected');const opcode=first&0x0f;if(![0x1,0x8,0x9,0xA].includes(opcode))throw new Error(`Unsupported CDP frame opcode ${opcode}`);let length=second&0x7f;let offset=2;if(length===126){if(this.buffer.length<4)return;length=this.buffer.readUInt16BE(2);if(length<126)throw new Error('Malformed non-minimal CDP frame length');offset=4;}else if(length===127){if(this.buffer.length<10)return;const size=this.buffer.readBigUInt64BE(2);if(size<=0xffffn)throw new Error('Malformed non-minimal CDP frame length');if(size>BigInt(MAX_FRAME_BYTES))throw new Error('CDP frame exceeded byte limit');length=Number(size);offset=10;}if(length>MAX_FRAME_BYTES)throw new Error('CDP frame exceeded byte limit');if(opcode>=0x8&&length>125)throw new Error('Malformed oversized CDP control frame');if(this.buffer.length<offset+length)return;const payload=this.buffer.subarray(offset,offset+length);this.buffer=this.buffer.subarray(offset+length);if(opcode===0x1)this.messageHandler?.(new TextDecoder('utf-8',{fatal:true}).decode(payload));else if(opcode===0x8){this.fail(new Error('Chrome DevTools websocket peer closed'));return;}else if(opcode===0x9)this.writeFrame(0xA,payload);}
    }catch(error){this.fail(asError(error));}
  }

  private fail(error:Error):void{if(this.failure)return;this.failure=error;this.failureHandler?.(error);this.socket.destroy();}
}

function validateHandshake(head:string,key:string):void{const lines=head.split('\r\n');if(!/^HTTP\/1\.1 101(?:\s|$)/i.test(lines[0]??''))throw new Error(`Chrome DevTools websocket rejected: ${lines[0]??'missing status'}`);const headers=new Map<string,string>();for(const line of lines.slice(1)){const separator=line.indexOf(':');if(separator>0)headers.set(line.slice(0,separator).trim().toLowerCase(),line.slice(separator+1).trim());}if(headers.get('upgrade')?.toLowerCase()!=='websocket')throw new Error('Invalid RFC6455 Upgrade header');if(!headers.get('connection')?.toLowerCase().split(',').map((value)=>value.trim()).includes('upgrade'))throw new Error('Invalid RFC6455 Connection header');const expected=createHash('sha1').update(key+WEBSOCKET_GUID).digest('base64');if(headers.get('sec-websocket-accept')!==expected)throw new Error('Invalid RFC6455 Sec-WebSocket-Accept header');}

class CdpConnection {
  private id = 0;
  private pending = new Map<number, { resolve: (value: JsonObject) => void; reject: (error: Error) => void; timer:ReturnType<typeof setTimeout> }>();
  private handlers = new Map<string, Set<EventHandler>>();
  private closed=false;
  private readonly abortListener:()=>void;

  private constructor(private readonly socket: NodeWebSocket,private readonly sendTimeoutMs:number,private readonly lifecycleSignal?:AbortSignal) {
    this.abortListener=()=>this.failAll(lifecycleSignal?.reason instanceof Error?lifecycleSignal.reason:abortError('CDP lifecycle aborted'));
    socket.onMessage((raw) => {
      let message:{ id?: number; method?: string; params?: JsonObject; result?: JsonObject; error?: { message: string } };try{message=JSON.parse(raw);}catch{this.failAll(new Error('Malformed CDP JSON message'));return;}
      if (message.id) {
        const request = this.pending.get(message.id);
        if (!request) return;
        this.pending.delete(message.id);clearTimeout(request.timer);
        if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result ?? {});
        return;
      }
      if (message.method) for (const handler of this.handlers.get(message.method) ?? []) void Promise.resolve(handler(message.params ?? {})).catch(() => undefined);
    });
    socket.onFailure((error)=>this.failAll(error));
    if(!this.closed)lifecycleSignal?.addEventListener('abort',this.abortListener,{once:true});
  }

  static async connect(url: string, timeoutMs = 8_000,sendTimeoutMs=DEFAULT_CDP_TIMEOUT_MS,signal?:AbortSignal): Promise<CdpConnection> {
    const socket = await NodeWebSocket.connect(url,timeoutMs,signal);
    return new CdpConnection(socket,sendTimeoutMs,signal);
  }

  send(method: string, params: JsonObject = {}): Promise<JsonObject> {
    if(this.closed)return Promise.reject(new Error('CDP connection is closed'));
    const id = ++this.id;
    return new Promise((resolveRequest, reject) => {
      const timer=setTimeout(()=>this.settle(id,new Error(`CDP request timeout: ${method}`)),this.sendTimeoutMs);
      this.pending.set(id, { resolve: resolveRequest, reject,timer });
      try{this.socket.send(JSON.stringify({ id, method, params }));}catch(error){this.settle(id,asError(error));}
    });
  }

  on(method: string, handler: EventHandler): () => void {
    const handlers = this.handlers.get(method) ?? new Set<EventHandler>();
    handlers.add(handler); this.handlers.set(method, handlers);
    return () => handlers.delete(handler);
  }

  close(): void {this.failAll(new Error('CDP connection closed'));this.socket.close();}
  pendingCount():number{return this.pending.size;}
  private settle(id:number,error?:Error,value:JsonObject={}):void{const request=this.pending.get(id);if(!request)return;this.pending.delete(id);clearTimeout(request.timer);if(error)request.reject(error);else request.resolve(value);}
  private failAll(error:Error):void{if(this.closed)return;this.closed=true;this.lifecycleSignal?.removeEventListener('abort',this.abortListener);for(const id of [...this.pending.keys()])this.settle(id,error);this.handlers.clear();}
}

export interface BrowserRoute {
  includes: string;
  method?: string;
  status: number;
  body: unknown;
  delayMs?: number;
}

type HarnessPhase='bridge'|'vite'|'browser'|'target'|'cdp'|'init'|'work';
interface HarnessFaultInjection {phase?:HarnessPhase;deadlineMs?:number;cleanupFault?:'cdp'|'browser'|'vite'|'bridge'|'store'|'profile';collision?:'bridge'|'vite';onResource?:(kind:'profile'|'pid'|'port',value:string|number)=>void;}
interface DashboardBrowserOptions {observations?:number;semanticZoomCommunitySize?:number;faultInjection?:HarnessFaultInjection;webglDisabled?:boolean;}

export class DashboardBrowser {
  readonly requests: Array<{ url: string; method: string }> = [];
  readonly failedRequests: Array<{ url: string; canceled: boolean }> = [];
  readonly interceptedBodies: unknown[] = [];
  private routes: BrowserRoute[] = [];
  private requestUrls = new Map<string, string>();

  constructor(private readonly cdp: CdpConnection, readonly origin: string) {}

  async initialize(): Promise<void> {
    await this.cdp.send('Page.enable'); await this.cdp.send('Runtime.enable'); await this.cdp.send('Network.enable');
    this.cdp.on('Network.requestWillBeSent', (params) => {
      const request = params.request as { url: string; method: string };
      this.requestUrls.set(String(params.requestId),request.url);
      this.requests.push({ url: request.url, method: request.method });
    });
    this.cdp.on('Network.loadingFailed', (params) => {
      this.failedRequests.push({ url: this.requestUrls.get(String(params.requestId)) ?? '', canceled: Boolean(params.canceled) || String(params.errorText).includes('ERR_ABORTED') });
    });
    this.cdp.on('Fetch.requestPaused', async (params) => {
      const requestId = String(params.requestId); const request = params.request as { url: string; method: string; postData?: string };
      const route = this.routes.find((candidate) => request.url.includes(candidate.includes) && (!candidate.method || candidate.method === request.method));
      if (!route) { await this.cdp.send('Fetch.continueRequest', { requestId }); return; }
      if (request.postData) try { this.interceptedBodies.push(JSON.parse(request.postData)); } catch { this.interceptedBodies.push(request.postData); }
      if (route.delayMs) await delay(route.delayMs);
      const body = typeof route.body === 'string' ? route.body : JSON.stringify(route.body);
      try { await this.cdp.send('Fetch.fulfillRequest', { requestId, responseCode: route.status, responseHeaders: [{ name: 'Content-Type', value: typeof route.body === 'string' ? 'text/plain' : 'application/json' }], body: Buffer.from(body).toString('base64') }); }
      catch { /* The mounted request was aborted before the delayed synthetic response. */ }
    });
  }

  async setRoutes(routes: BrowserRoute[]): Promise<void> { this.routes = routes; await this.cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] }); }
  async clearRoutes(): Promise<void> { this.routes = []; await this.cdp.send('Fetch.disable'); }

  async goto(path: string): Promise<void> {
    await this.cdp.send('Page.navigate', { url: path.startsWith('http') ? path : `${this.origin}${path}` });
    await this.waitFor(`document.readyState === 'complete'`);
  }

  async evaluate<T>(expression: string): Promise<T> {
    const response = await this.cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (response.exceptionDetails) throw new Error(`Browser evaluation failed: ${JSON.stringify(response.exceptionDetails)}`);
    return (response.result as { value: T }).value;
  }

  async waitFor(expression: string, timeoutMs = 15_000): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await this.evaluate<boolean>(`Boolean(${expression})`)) return;
      await delay(25);
    }
    throw new Error(`Browser timeout waiting for: ${expression}`);
  }

  async click(selector: string, index = 0): Promise<void> {
    await this.evaluate(`(() => { const items=[...document.querySelectorAll(${JSON.stringify(selector)})]; const item=items[${index}]; if(!(item instanceof HTMLElement)) throw new Error('Missing clickable ${selector}'); item.click(); return true; })()`);
  }

  async clickText(selector: string, text: string): Promise<void> {
    await this.evaluate(`(() => { const item=[...document.querySelectorAll(${JSON.stringify(selector)})].find((node)=>node.textContent?.trim().includes(${JSON.stringify(text)})); if(!(item instanceof HTMLElement)) throw new Error('Missing text ${text}'); item.click(); return true; })()`);
  }

  async mouseMove(x: number, y: number): Promise<void> {
    await this.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
  }

  async mouseClick(x: number, y: number): Promise<void> {
    await this.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    await this.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  }

  async mouseWheel(x: number, y: number, deltaY: number): Promise<void> {
    await this.cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY });
  }

  async fill(selector: string, value: string): Promise<void> {
    await this.evaluate(`(() => { const item=document.querySelector(${JSON.stringify(selector)}); if(!(item instanceof HTMLInputElement || item instanceof HTMLTextAreaElement)) throw new Error('Missing field ${selector}'); const setter=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(item),'value')?.set; setter?.call(item,${JSON.stringify(value)}); item.dispatchEvent(new Event('input',{bubbles:true})); item.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
  }

  async key(key: string): Promise<void> {
    const keyCode = key.length === 1 ? key.toUpperCase().charCodeAt(0) : ({ Enter:13, Escape:27, ArrowLeft:37, ArrowUp:38, ArrowRight:39, ArrowDown:40 } as Record<string, number>)[key] ?? 0;
    const code = key.length === 1 ? `Key${key.toUpperCase()}` : key;
    await this.cdp.send('Input.dispatchKeyEvent', { type:'keyDown', key, code, windowsVirtualKeyCode:keyCode, nativeVirtualKeyCode:keyCode, text:key.length===1?key:undefined });
    await this.cdp.send('Input.dispatchKeyEvent', { type:'keyUp', key, code, windowsVirtualKeyCode:keyCode, nativeVirtualKeyCode:keyCode });
  }

  async text(selector: string): Promise<string> { return await this.evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ''`); }
  async count(selector: string): Promise<number> { return await this.evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`); }
  async attribute(selector: string, name: string): Promise<string | null> { return await this.evaluate(`document.querySelector(${JSON.stringify(selector)})?.getAttribute(${JSON.stringify(name)}) ?? null`); }
  async url(): Promise<string> { return await this.evaluate('location.href'); }
  async back(): Promise<void> { const before=await this.url();await this.evaluate('history.back()');await this.waitFor(`location.href !== ${JSON.stringify(before)}`); }
  async forward(): Promise<void> { const before=await this.url();await this.evaluate('history.forward()');await this.waitFor(`location.href !== ${JSON.stringify(before)}`); }
  async viewport(width: number, height: number): Promise<void> { await this.cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width <= 720 }); }
  async pageScale(scale: number): Promise<void> { await this.cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: scale }); }
  async coarsePointer(): Promise<void> { await this.cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); }
  async reducedMotion(): Promise<void> { await this.cdp.send('Emulation.setEmulatedMedia', { features: [{ name:'prefers-reduced-motion', value:'reduce' }] }); }
  async captureScreenshot(): Promise<string> { const response=await this.cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});return String(response.data??''); }
}

function seedDashboardStore(store: Store, observationCount: number, ownerToken: string, semanticZoomCommunitySize = 0): number {
  const db = store.getDb();
  const topicKey = (index: number) => index === 1
    ? 'browser/alpha'
    : index === 2
      ? 'browser/beta'
      : `browser/topic-${index}`;
  const upsertEntity = db.prepare(
    `INSERT INTO kg_entities (entity_key, entity_type, canonical_name, aliases_json, metadata_json, updated_at)
     VALUES (?, 'concept', ?, '[]', '{}', datetime('now'))
     ON CONFLICT(entity_key) DO UPDATE SET updated_at = datetime('now')
     RETURNING id`,
  );
  const insertTriple = db.prepare(
    `INSERT OR IGNORE INTO kg_triples (
      subject_entity_id, relation, object_entity_id, source_type, source_id,
      project, topic_key, provenance, confidence, triple_hash, extractor_version
    ) VALUES (?, ?, ?, 'observation', ?, 'browser-nebula', ?, ?, 0.9, ?, 'dashboard-browser-harness')`,
  );
  const entityId = (key: string, label: string): number => (
    upsertEntity.get(`browser:${key}`, label) as { id: number }
  ).id;
  const addStructuralEvidence = (observationId: number, index: number) => {
    const region = Math.floor((index - 1) / 50);
    const subjectId = entityId(`memory:${index}`, `Browser memory ${index}`);
    const regionId = entityId(`region:${region}`, `Browser region ${region + 1}`);
    insertTriple.run(
      subjectId,
      'USES',
      regionId,
      observationId,
      topicKey(index),
      `observation:${observationId}`,
      `browser:${observationId}:USES:${region}`,
    );
    if (observationCount === 1_000) {
      const overlap = Math.floor((index - 1) / 25);
      for (const window of [overlap, overlap + 1]) {
        const overlapId = entityId(`overlap:${window}`, `Browser overlap ${window + 1}`);
        insertTriple.run(
          subjectId,
          'IMPLEMENTS',
          overlapId,
          observationId,
          topicKey(index),
          `observation:${observationId}`,
          `browser:${observationId}:IMPLEMENTS:${window}`,
        );
      }
    }
    if (semanticZoomCommunitySize === 0 && index > 1 && (index - 1) % 50 === 0) {
      const bridgeId = entityId(`bridge:${region - 1}:${region}`, `Region ${region} to ${region + 1}`);
      const previousObservationId = observationId - 1;
      const previousSubjectId = entityId(`memory:${index - 1}`, `Browser memory ${index - 1}`);
      insertTriple.run(
        previousSubjectId,
        'REFERENCES',
        bridgeId,
        previousObservationId,
        topicKey(index - 1),
        `observation:${previousObservationId}`,
        `browser:${previousObservationId}:REFERENCES:${region - 1}:${region}`,
      );
      insertTriple.run(
        subjectId,
        'REFERENCES',
        bridgeId,
        observationId,
        topicKey(index),
        `observation:${observationId}`,
        `browser:${observationId}:REFERENCES:${region - 1}:${region}`,
      );
    }
  };

  if (observationCount <= 500) {
    let ownerObservationId = 0;
    for (let index = 1; index <= observationCount; index += 1) {
      const saved = store.saveObservation({
        title: `Browser memory ${index}`,
        content: `**What**: Browser region ${Math.floor((index - 1) / 50) + 1}\n**Why**: Supports ${Math.max(1, index - 1)}\n**Where**: Browser test atlas\n**Learned**: <private>HIDDEN_${index}</private> Public ${index} ${ownerToken}`,
        project: 'browser-nebula',
        session_id: 'browser-session',
        topic_key: topicKey(index),
        type: index % 2 ? 'decision' : 'discovery',
      });
      ownerObservationId = saved.observation.id;
      addStructuralEvidence(saved.observation.id, index);
    }
    return ownerObservationId;
  }

  return db.transaction(() => {
    db.prepare(
      `INSERT OR IGNORE INTO sessions (id, project, directory) VALUES ('browser-session', 'browser-nebula', NULL)`,
    ).run();
    const insertObservation = db.prepare(
      `INSERT INTO observations (
        id, session_id, type, title, content, project, scope, topic_key,
        normalized_hash, created_at, updated_at
      ) VALUES (?, 'browser-session', ?, ?, ?, 'browser-nebula', 'project', ?, ?, datetime('now'), datetime('now'))`,
    );
    for (let index = 1; index <= observationCount; index += 1) {
      insertObservation.run(
        index,
        index % 2 ? 'decision' : 'discovery',
        `Browser memory ${index}`,
        `Browser region ${Math.floor((index - 1) / 50) + 1}. Public ${index} ${ownerToken}`,
        topicKey(index),
        `browser-hash-${index}`,
      );
      if (index > semanticZoomCommunitySize) addStructuralEvidence(index, index);
    }
    if (semanticZoomCommunitySize > 0) {
      const prime = 37;
      const slopes = Array.from({ length: prime }, (_, slope) => slope);
      for (const slope of [...slopes, prime]) {
        const blocks = new Map<number, number[]>();
        for (let offset = 0; offset < semanticZoomCommunitySize; offset += 1) {
          const x = Math.floor(offset / prime);
          const y = offset % prime;
          const block = slope === prime ? x : ((y - slope * x) % prime + prime) % prime;
          const members = blocks.get(block) ?? [];
          members.push(offset + 1);
          blocks.set(block, members);
        }
        for (const [block, members] of blocks) {
          if (members.length < 2) continue;
          const object = entityId(`semantic-line:${slope}:${block}`, `Semantic current ${slope + 1}`);
          for (const observationId of members) {
            const subject = entityId(`memory:${observationId}`, `Browser memory ${observationId}`);
            insertTriple.run(
              subject,
              'USES',
              object,
              observationId,
              topicKey(observationId),
              `observation:${observationId}`,
              `browser:${observationId}:semantic-line:${slope}:${block}`,
            );
          }
        }
      }
    }
    return observationCount;
  })();
}

export async function withDashboardBrowser<T>(run:(browser:DashboardBrowser)=>Promise<T>,options:DashboardBrowserOptions={}):Promise<T>{
  const fault=options.faultInjection;const controller=new AbortController();const deadlineMs=fault?.deadlineMs??35_000;const deadline=setTimeout(()=>controller.abort(abortError(`Dashboard browser lifecycle deadline exceeded after ${deadlineMs}ms`)),deadlineMs);
  const ownerToken=randomBytes(12).toString('hex');
  let store:Store|null=null;let bridge:ReturnType<typeof createHttpBridge>|null=null;let vite:ViteDevServer|null=null;let chrome:ChildProcess|null=null;let cdp:CdpConnection|null=null;let profile='';let result:T|undefined;let failure:Error|null=null;
  try{
    store=new Store(':memory:');const ownerObservationId=seedDashboardStore(store,options.observations??12,ownerToken,options.semanticZoomCommunitySize??0);
    const bridgeStart=await startBridge(store,ownerObservationId,ownerToken,controller.signal,fault);bridge=bridgeStart.bridge;fault?.onResource?.('port',bridgeStart.port);await faultPoint('bridge',fault,controller.signal);
    const viteStart=await startVite(bridgeStart.port,controller.signal,fault);vite=viteStart.vite;fault?.onResource?.('port',viteStart.port);await faultPoint('vite',fault,controller.signal);
    const chromePath=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(existsSync);if(!chromePath)throw new Error('Real browser unavailable: Chrome or Edge executable is required');
    profile=mkdtempSync(resolve(tmpdir(),'thoth-dashboard-browser-'));fault?.onResource?.('profile',profile);chrome=spawn(chromePath,['--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-default-apps','--disable-breakpad','--disable-crash-reporter','about:blank'],{stdio:'ignore',windowsHide:true});if(chrome.pid)fault?.onResource?.('pid',chrome.pid);await faultPoint('browser',fault,controller.signal);
    const debugPort=await readDevToolsPort(resolve(profile,'DevToolsActivePort'),controller.signal);await faultPoint('target',fault,controller.signal);
    const response=await bounded(fetch(`http://127.0.0.1:${debugPort}/json/list`,{signal:controller.signal}),5_000,'Chrome target discovery',controller.signal);if(!response.ok)throw new Error(`Chrome target discovery failed: ${response.status}`);const targets=await bounded(response.json() as Promise<Array<{type:string;webSocketDebuggerUrl:string}>>,5_000,'Chrome target JSON',controller.signal);const pageTarget=targets.find((target)=>target.type==='page');if(!pageTarget)throw new Error('Real browser opened without a page target');
    cdp=await CdpConnection.connect(pageTarget.webSocketDebuggerUrl,5_000,DEFAULT_CDP_TIMEOUT_MS,controller.signal);await faultPoint('cdp',fault,controller.signal);const browser=new DashboardBrowser(cdp,`http://127.0.0.1:${viteStart.port}`);await browser.initialize();if(options.webglDisabled)await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type==='webgl2')return null;return original.call(this,type,...args)};globalThis.__THOTH_RESTORE_WEBGL__=()=>{HTMLCanvasElement.prototype.getContext=original}})();`});await faultPoint('init',fault,controller.signal);await faultPoint('work',fault,controller.signal);result=await bounded(run(browser),deadlineMs,'dashboard browser acceptance',controller.signal);
  }catch(error){failure=asError(error);}finally{
    clearTimeout(deadline);await requestBrowserClose(cdp);controller.abort(abortError('Dashboard browser lifecycle cleanup'));
    const cleanupErrors=await cleanupHarness({cdp,chrome,vite,bridge,store,profile},fault);
    if(cleanupErrors.length){const cleanupFailure=new AggregateError(cleanupErrors,'Dashboard browser cleanup failed');failure=failure?new AggregateError([failure,cleanupFailure],failure.message):cleanupFailure;}
  }
  if(failure)throw failure;return result as T;
}

async function startBridge(store:Store,ownerObservationId:number,ownerToken:string,signal:AbortSignal,fault?:HarnessFaultInjection):Promise<{bridge:ReturnType<typeof createHttpBridge>;port:number}>{let last:Error|null=null;for(let attempt=0;attempt<5;attempt+=1){throwIfAborted(signal);const port=await bounded(availablePort(),2_000,'bridge port selection',signal);const blocker=fault?.collision==='bridge'&&attempt===0?await occupyPort(port):null;const candidate=createHttpBridge(store,{...getConfig(),httpPort:port});try{await bounded(candidate.start(),5_000,'HTTP bridge startup',signal);if(blocker){last=new Error(`EADDRINUSE: injected bridge collision on ${port}`);await bounded(candidate.stop(),2_000,'collided bridge cleanup',signal);await closeServer(blocker);continue;}if(!await bridgeIsOwned(port,ownerObservationId,ownerToken,signal)){last=new Error(`EADDRINUSE: bridge ownership check failed on ${port}`);await bounded(candidate.stop(),2_000,'unowned bridge cleanup',signal);continue;}return{bridge:candidate,port};}catch(error){last=asError(error);await closeServer(blocker);await bounded(candidate.stop(),2_000,'failed bridge cleanup').catch(()=>undefined);if(!isAddressInUse(last))throw last;}}throw new Error(`HTTP bridge port collision retries exhausted: ${last?.message}`);}
async function startVite(backendPort:number,signal:AbortSignal,fault?:HarnessFaultInjection):Promise<{vite:ViteDevServer;port:number}>{const target=`http://127.0.0.1:${backendPort}`;const proxy=Object.fromEntries(['/stats','/context','/observations','/timeline','/projects','/observatory','/viz','/version','/operations','/operation-traces','/index','/graph/rebuild','/openapi.json'].map((path)=>[path,target]));let last:Error|null=null;for(let attempt=0;attempt<5;attempt+=1){throwIfAborted(signal);const port=await bounded(availablePort(),2_000,'Vite port selection',signal);const blocker=fault?.collision==='vite'&&attempt===0?await occupyPort(port):null;const candidate=await bounded(createViteServer({root:resolve('dashboard'),logLevel:'silent',server:{host:'127.0.0.1',port,strictPort:true,proxy}}),5_000,'Vite creation',signal);try{await bounded(candidate.listen(),5_000,'Vite startup',signal);await closeServer(blocker);return{vite:candidate,port};}catch(error){last=asError(error);await closeServer(blocker);await bounded(candidate.close(),2_000,'failed Vite cleanup').catch(()=>undefined);if(!isAddressInUse(last))throw last;}}throw new Error(`Vite port collision retries exhausted: ${last?.message}`);}
async function cleanupHarness(resources:{cdp:CdpConnection|null;chrome:ChildProcess|null;vite:ViteDevServer|null;bridge:ReturnType<typeof createHttpBridge>|null;store:Store|null;profile:string},fault?:HarnessFaultInjection):Promise<Error[]>{const errors:Error[]=[];const step=async(name:HarnessFaultInjection['cleanupFault'],action:()=>void|Promise<void>,timeoutMs=3_000)=>{try{await bounded(Promise.resolve().then(action),timeoutMs,`${name} cleanup`);if(fault?.cleanupFault===name)throw new Error(`Injected ${name} cleanup failure`);}catch(error){errors.push(asError(error));}};await step('cdp',()=>resources.cdp?.close());await step('browser',()=>terminateBrowser(resources.chrome),15_000);await step('vite',()=>resources.vite?.close());await step('bridge',()=>resources.bridge?.stop());await step('store',()=>resources.store?.close());await step('profile',()=>resources.profile?removeDirectory(resources.profile):undefined,12_000);return errors;}
async function faultPoint(phase:HarnessPhase,fault:HarnessFaultInjection|undefined,signal:AbortSignal):Promise<void>{if(fault?.phase!==phase)return;await new Promise<void>((_,reject)=>{const abort=()=>reject(signal.reason instanceof Error?signal.reason:abortError('Harness fault aborted'));if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});});}
async function availablePort():Promise<number>{return await new Promise((resolvePort,reject)=>{const server=createNetServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const address=server.address();if(!address||typeof address==='string')return reject(new Error('No test port'));const port=address.port;server.close((error)=>error?reject(error):resolvePort(port));});});}
async function occupyPort(port:number):Promise<ReturnType<typeof createNetServer>>{const server=createNetServer();await new Promise<void>((resolveListen,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>resolveListen());});return server;}
async function closeServer(server:ReturnType<typeof createNetServer>|null):Promise<void>{if(!server||!server.listening)return;await new Promise<void>((resolveClose)=>server.close(()=>resolveClose()));}
async function bridgeIsOwned(port:number,observationId:number,ownerToken:string,signal:AbortSignal):Promise<boolean>{try{const response=await fetchWithTimeout(`http://127.0.0.1:${port}/observations/${observationId}`,500,signal);return response.ok&&(await response.text()).includes(ownerToken);}catch{return false;}}
async function fetchWithTimeout(url:string,timeoutMs:number,signal:AbortSignal):Promise<Response>{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(abortError(`Fetch timeout after ${timeoutMs}ms`)),timeoutMs);const abort=()=>controller.abort(signal.reason);if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});try{return await fetch(url,{signal:controller.signal});}finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}}
function delay(milliseconds:number):Promise<void>{return new Promise((resolveDelay)=>setTimeout(resolveDelay,milliseconds));}
async function bounded<T>(promise:Promise<T>,timeoutMs:number,label:string,signal?:AbortSignal):Promise<T>{let timer:ReturnType<typeof setTimeout>|undefined;let abort:()=>void=()=>undefined;try{return await Promise.race([promise,new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} timeout after ${timeoutMs}ms`)),timeoutMs);if(signal){abort=()=>reject(signal.reason instanceof Error?signal.reason:abortError(`${label} aborted`));if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});}})]);}finally{if(timer)clearTimeout(timer);signal?.removeEventListener('abort',abort);}}
async function removeDirectory(path:string):Promise<void>{const root=resolve(tmpdir());const target=resolve(path);if(!target.startsWith(`${root}\\`)||!target.split(/[\\/]/).pop()?.startsWith('thoth-dashboard-browser-'))throw new Error(`Refusing to remove unvalidated browser profile: ${target}`);const deadline=Date.now()+10_000;let lastError:unknown;while(existsSync(target)){try{rmSync(target,{recursive:true,force:true});}catch(error){lastError=error;}if(!existsSync(target))return;if(Date.now()>=deadline)throw lastError instanceof Error?lastError:new Error(`Timed out removing browser profile: ${target}`);await delay(50);}}
async function readDevToolsPort(path:string,signal:AbortSignal):Promise<string>{const started=Date.now();while(Date.now()-started<8_000){throwIfAborted(signal);try{if(existsSync(path)){const [port]=readFileSync(path,'utf8').trim().split(/\r?\n/);if(/^\d+$/.test(port))return port;}}catch{/* Chrome may still own the new file briefly on Windows. */}await delay(25);}throw new Error('Timeout waiting for readable Chrome DevTools port');}
async function requestBrowserClose(cdp:CdpConnection|null):Promise<void>{if(!cdp)return;await bounded(cdp.send('Browser.close'),750,'Chrome graceful close').catch(()=>undefined);}
async function terminateBrowser(chrome:ChildProcess|null):Promise<void>{if(!chrome||browserHasExited(chrome.exitCode,chrome.signalCode))return;chrome.kill();try{await waitForBrowserExit(chrome,8_000,'Chrome exit');}catch{chrome.kill('SIGKILL');try{await waitForBrowserExit(chrome,5_000,'forced Chrome exit');}catch(error){if(!browserProcessHasExited(chrome.exitCode,chrome.signalCode,chrome.pid))throw error;await delay(500);}}}
async function waitForBrowserExit(chrome:ChildProcess,timeoutMs:number,label:string):Promise<void>{const deadline=Date.now()+timeoutMs;while(!browserHasExited(chrome.exitCode,chrome.signalCode)){if(Date.now()>=deadline)throw new Error(`${label} timeout after ${timeoutMs}ms`);await delay(50);}}
function browserHasExited(exitCode:number|null,signalCode:NodeJS.Signals|null):boolean{return exitCode!==null||signalCode!==null;}
function browserProcessHasExited(exitCode:number|null,signalCode:NodeJS.Signals|null,pid:number|undefined):boolean{return browserHasExited(exitCode,signalCode)||(typeof pid==='number'&&!processExists(pid));}
function processExists(pid:number):boolean{try{process.kill(pid,0);return true;}catch(error){return error instanceof Error&&'code' in error&&error.code==='EPERM';}}
function throwIfAborted(signal:AbortSignal):void{if(signal.aborted)throw(signal.reason instanceof Error?signal.reason:abortError('Harness lifecycle aborted'));}
function abortError(message:string):Error{const error=new Error(message);error.name='AbortError';return error;}
function asError(error:unknown):Error{return error instanceof Error?error:new Error(String(error));}
function isAddressInUse(error:Error):boolean{return /EADDRINUSE|address already in use|port.*in use/i.test(error.message);}

export const harnessFaultTestApi={
  async connectCdp(url:string,options:{connectTimeoutMs?:number;sendTimeoutMs?:number;signal?:AbortSignal}={}){const connection=await CdpConnection.connect(url,options.connectTimeoutMs??500,options.sendTimeoutMs??100,options.signal);return{send:(method:string,params:JsonObject={})=>connection.send(method,params),pendingCount:()=>connection.pendingCount(),close:()=>connection.close()};},
  pathExists:(path:string)=>existsSync(path),
  browserHasExited,
  browserProcessHasExited,
  processExists,
  portListens:async(port:number)=>await new Promise<boolean>((resolveCheck)=>{const socket=createConnection({host:'127.0.0.1',port});let settled=false;let timer:ReturnType<typeof setTimeout>;const settle=(listens:boolean)=>{if(settled)return;settled=true;clearTimeout(timer);socket.removeAllListeners();socket.destroy();resolveCheck(listens);};timer=setTimeout(()=>settle(false),250);timer.unref();socket.once('connect',()=>settle(true));socket.once('error',()=>settle(false));}),
};
