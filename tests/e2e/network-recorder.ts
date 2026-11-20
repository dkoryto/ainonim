// Records every network request of every browser target (pages, the extension's service worker,
// its offscreen document and any worker they start) over a second Chrome DevTools Protocol
// connection, independent of Playwright.
//
// Why a second connection: Playwright reports requests of pages (and of the service worker), but
// not of the extension's offscreen document, which is where Pyodide runs. A browser-wide
// `Target.setAutoAttach` reaches every target, and with `waitForDebuggerOnStart` a new target
// (such as the offscreen document, created on the first analysis) stays paused until network
// recording is on, so not even its first request is missed.
//
// Chromium must run with `--remote-debugging-port=0`; it then writes the port it picked to
// `<userDataDir>/DevToolsActivePort`.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface RecordedTarget {
  targetId: string;
  /** CDP target type: `page`, `service_worker`, `worker`, `iframe`, `other`, ... */
  type: string;
  url: string;
}

export interface RecordedRequest {
  target: RecordedTarget;
  url: string;
  method: string;
  /** Headers from `requestWillBeSent` plus the ones only `requestWillBeSentExtraInfo` reports. */
  headers: Record<string, string>;
  postData: string;
  /** True for a WebSocket handshake (`Network.webSocketCreated`). */
  webSocket: boolean;
}

interface CdpMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  sessionId?: string;
  result?: Record<string, unknown>;
  error?: { message: string };
}

interface TargetInfo {
  targetId: string;
  type: string;
  url: string;
}

const PORT_FILE = 'DevToolsActivePort';

async function readDebuggingPort(userDataDir: string, timeoutMs: number): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const [line] = (await readFile(join(userDataDir, PORT_FILE), 'utf8')).split('\n');
      const port = Number(line);
      if (Number.isInteger(port) && port > 0) return port;
    } catch {
      // Not written yet.
    }
    if (Date.now() > deadline) throw new Error(`${PORT_FILE} not found in ${userDataDir}`);
    await new Promise((done) => setTimeout(done, 50));
  }
}

export class NetworkRecorder {
  readonly requests: RecordedRequest[] = [];
  /** Every target the recorder attached to, whether or not it made a request. */
  readonly targets: RecordedTarget[] = [];

  private readonly socket: WebSocket;
  private nextId = 1;
  private readonly calls = new Map<
    number,
    { resolve: (result: Record<string, unknown>) => void; reject: (error: Error) => void }
  >();
  private readonly sessions = new Map<string, RecordedTarget>();
  private readonly byRequestId = new Map<string, RecordedRequest>();
  /** Headers that arrived (as ExtraInfo) before the request they belong to. */
  private readonly earlyHeaders = new Map<string, Record<string, string>>();
  private readonly inFlight = new Set<Promise<unknown>>();
  private readonly errors: string[] = [];

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener('message', (event: MessageEvent<string>) => {
      this.onMessage(JSON.parse(event.data) as CdpMessage);
    });
  }

  /** Connect to the Chromium that uses `userDataDir` and start recording. */
  static async start(userDataDir: string): Promise<NetworkRecorder> {
    const port = await readDebuggingPort(userDataDir, 10_000);
    const version = (await (
      await fetch(`http://127.0.0.1:${String(port)}/json/version`)
    ).json()) as { webSocketDebuggerUrl: string };
    const socket = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => {
        resolve();
      });
      socket.addEventListener('error', () => {
        reject(new Error('cannot connect to the DevTools endpoint'));
      });
    });
    const recorder = new NetworkRecorder(socket);
    // Reports URL changes of attached targets (an offscreen document attaches with an empty URL).
    await recorder.send('Target.setDiscoverTargets', { discover: true });
    await recorder.send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: true,
      flatten: true,
      // Everything (the final `{}`) but the browser target itself and the tab wrappers around
      // pages; a target that matches no entry would be left out.
      filter: [{ type: 'browser', exclude: true }, { type: 'tab', exclude: true }, {}],
    });
    return recorder;
  }

  /** Wait until the request bodies asked for so far have arrived; throws on a recorder error. */
  async settle(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.allSettled([...this.inFlight]);
    if (this.errors.length > 0) throw new Error(`network recorder: ${this.errors.join('; ')}`);
  }

  close(): void {
    this.socket.close();
  }

  private send(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    const call = new Promise<Record<string, unknown>>((resolve, reject) => {
      this.calls.set(id, { resolve, reject });
    });
    this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    return call;
  }

  /** Track a call so `settle` waits for it; a failure is kept and reported by `settle`. */
  private track(call: Promise<unknown>, what: string): void {
    const tracked = call.catch((error: unknown) => {
      this.errors.push(`${what}: ${error instanceof Error ? error.message : String(error)}`);
    });
    this.inFlight.add(tracked);
    void tracked.finally(() => this.inFlight.delete(tracked));
  }

  private onMessage(message: CdpMessage): void {
    if (message.id !== undefined) {
      const call = this.calls.get(message.id);
      this.calls.delete(message.id);
      if (message.error) call?.reject(new Error(message.error.message));
      else call?.resolve(message.result ?? {});
      return;
    }
    const params = message.params ?? {};
    switch (message.method) {
      case 'Target.attachedToTarget':
        this.onAttached(params.sessionId as string, params.targetInfo as TargetInfo);
        break;
      case 'Target.targetInfoChanged': {
        const info = params.targetInfo as TargetInfo;
        const target = this.targets.find((known) => known.targetId === info.targetId);
        if (target) target.url = info.url;
        break;
      }
      case 'Network.requestWillBeSent':
        this.onRequest(message.sessionId, params);
        break;
      case 'Network.requestWillBeSentExtraInfo':
        this.onExtraHeaders(params.requestId as string, params.headers as Record<string, string>);
        break;
      case 'Network.webSocketCreated':
        this.add(message.sessionId, {
          url: params.url as string,
          method: 'GET',
          headers: {},
          postData: '',
          webSocket: true,
        });
        break;
    }
  }

  private onAttached(sessionId: string, info: TargetInfo): void {
    // A target can be attached again (a service worker after it restarts): keep one record.
    let target = this.targets.find((known) => known.targetId === info.targetId);
    if (!target) {
      target = { targetId: info.targetId, type: info.type, url: info.url };
      this.targets.push(target);
    }
    this.sessions.set(sessionId, target);
    const setUp = async (): Promise<void> => {
      await this.send('Network.enable', {}, sessionId);
      // Workers started by this target (e.g. a Web Worker in the offscreen document).
      await this.send(
        'Target.setAutoAttach',
        { autoAttach: true, waitForDebuggerOnStart: true, flatten: true },
        sessionId,
      ).catch(() => undefined);
      // Resume a target paused on start. Targets that were already running refuse this.
      await this.send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(() => undefined);
    };
    this.track(setUp(), `attach ${info.type} ${info.url}`);
  }

  private onRequest(sessionId: string | undefined, params: Record<string, unknown>): void {
    const request = params.request as {
      url: string;
      method: string;
      headers: Record<string, string>;
      postData?: string;
      hasPostData?: boolean;
      postDataEntries?: { bytes?: string }[];
    };
    const requestId = params.requestId as string;
    const recorded = this.add(sessionId, {
      url: request.url,
      method: request.method,
      headers: { ...request.headers, ...this.earlyHeaders.get(requestId) },
      postData: request.postData ?? decodeEntries(request.postDataEntries),
      webSocket: false,
    });
    this.earlyHeaders.delete(requestId);
    this.byRequestId.set(requestId, recorded);
    // Large bodies are left out of the event and must be asked for.
    if (request.hasPostData && request.postData === undefined && sessionId) {
      this.track(
        this.send('Network.getRequestPostData', { requestId }, sessionId).then((result) => {
          recorded.postData = result.postData as string;
        }),
        `body of ${request.url}`,
      );
    }
  }

  private onExtraHeaders(requestId: string, headers: Record<string, string>): void {
    const recorded = this.byRequestId.get(requestId);
    if (recorded) Object.assign(recorded.headers, headers);
    else this.earlyHeaders.set(requestId, { ...this.earlyHeaders.get(requestId), ...headers });
  }

  private add(
    sessionId: string | undefined,
    request: Omit<RecordedRequest, 'target'>,
  ): RecordedRequest {
    const target = (sessionId && this.sessions.get(sessionId)) || {
      targetId: '?',
      type: 'unknown',
      url: '',
    };
    const recorded = { target, ...request };
    this.requests.push(recorded);
    return recorded;
  }
}

function decodeEntries(entries: { bytes?: string }[] | undefined): string {
  return (entries ?? [])
    .map((entry) => (entry.bytes ? Buffer.from(entry.bytes, 'base64').toString('utf8') : ''))
    .join('');
}
