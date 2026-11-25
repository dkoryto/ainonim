import { describe, expect, it } from 'vitest';
import { type Config, publish, readConfig } from '~/scripts/cws-publish';

const ENV = {
  CWS_CLIENT_ID: 'client-id',
  CWS_CLIENT_SECRET: 'client-secret-value',
  CWS_REFRESH_TOKEN: 'refresh-token-value',
  CWS_PUBLISHER_ID: 'publisher-1',
  CWS_EXTENSION_ID: 'abcdefghijklmnopabcdefghijklmnop',
};
const ACCESS_TOKEN = 'access-token-value';
const ZIP = new Uint8Array([0x50, 0x4b, 3, 4]);
const ITEM = 'publishers/publisher-1/items/abcdefghijklmnopabcdefghijklmnop';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

type Reply = { status?: number; body: unknown };

/** A fetch that answers by URL suffix, each suffix with its replies in order. */
function fakeFetch(replies: Record<string, Reply[]>): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchFn = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: init?.body,
    });
    const key = Object.keys(replies).find((suffix) => url.endsWith(suffix));
    const reply = key === undefined ? undefined : replies[key]?.shift();
    if (!reply) throw new Error(`unexpected request ${url}`);
    const text = typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body);
    return Promise.resolve(new Response(text, { status: reply.status ?? 200 }));
  };
  return { fetch: fetchFn, calls };
}

const token: Reply = { body: { access_token: ACCESS_TOKEN, expires_in: 3600 } };

function run(replies: Record<string, Reply[]>, config: Config = readConfig(ENV)) {
  const { fetch, calls } = fakeFetch(replies);
  const log: string[] = [];
  const result = publish(ZIP, config, {
    fetch,
    log: (line) => log.push(line),
    pollMs: 0,
    maxPolls: 3,
  });
  return { result, calls, log };
}

describe('readConfig', () => {
  it('names every missing variable', () => {
    expect(() => readConfig({})).toThrow(
      'CWS_CLIENT_ID is not set; CWS_CLIENT_SECRET is not set; CWS_REFRESH_TOKEN is not set; ' +
        'CWS_PUBLISHER_ID is not set; CWS_EXTENSION_ID is not set',
    );
  });

  it('publishes after review by default and accepts a staged publish', () => {
    expect(readConfig(ENV).publishType).toBe('DEFAULT_PUBLISH');
    expect(readConfig({ ...ENV, CWS_PUBLISH_TYPE: 'STAGED_PUBLISH' }).publishType).toBe(
      'STAGED_PUBLISH',
    );
  });

  it('rejects an unknown publish type', () => {
    expect(() => readConfig({ ...ENV, CWS_PUBLISH_TYPE: 'NOW' })).toThrow(
      'CWS_PUBLISH_TYPE must be one of DEFAULT_PUBLISH, STAGED_PUBLISH',
    );
  });
});

describe('publish', () => {
  it('exchanges the refresh token, uploads the zip and submits it for review', async () => {
    const { result, calls, log } = run({
      '/token': [token],
      ':upload': [{ body: { uploadState: 'SUCCEEDED', crxVersion: '0.5.2' } }],
      ':publish': [{ body: { state: 'PENDING_REVIEW' } }],
    });

    await expect(result).resolves.toBe('PENDING_REVIEW');
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST https://oauth2.googleapis.com/token',
      `POST https://chromewebstore.googleapis.com/upload/v2/${ITEM}:upload`,
      `POST https://chromewebstore.googleapis.com/v2/${ITEM}:publish`,
    ]);
    const [tokenCall, uploadCall, publishCall] = calls;
    expect(String(tokenCall?.body)).toBe(
      'client_id=client-id&client_secret=client-secret-value&refresh_token=refresh-token-value&grant_type=refresh_token',
    );
    expect(uploadCall?.headers.authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(uploadCall?.body).toBe(ZIP);
    expect(publishCall?.body).toBe('{"publishType":"DEFAULT_PUBLISH"}');
    expect(log).toEqual(['Uploaded version 0.5.2.', 'Submitted: the item is now PENDING_REVIEW.']);
  });

  it('waits for an upload the store processes asynchronously', async () => {
    const { result, calls } = run({
      '/token': [token],
      ':upload': [{ body: { uploadState: 'IN_PROGRESS' } }],
      ':fetchStatus': [
        { body: { lastAsyncUploadState: 'IN_PROGRESS' } },
        { body: { lastAsyncUploadState: 'SUCCEEDED' } },
      ],
      ':publish': [{ body: { state: 'STAGED' } }],
    });

    await expect(result).resolves.toBe('STAGED');
    expect(calls.filter((c) => c.url.endsWith(':fetchStatus'))).toHaveLength(2);
  });

  it('gives up when the asynchronous upload fails or never finishes', async () => {
    const failed = run({
      '/token': [token],
      ':upload': [{ body: { uploadState: 'IN_PROGRESS' } }],
      ':fetchStatus': [{ body: { lastAsyncUploadState: 'FAILED' } }],
    });
    await expect(failed.result).rejects.toThrow('The upload ended as FAILED.');

    const slow = run({
      '/token': [token],
      ':upload': [{ body: { uploadState: 'IN_PROGRESS' } }],
      ':fetchStatus': Array.from({ length: 3 }, () => ({
        body: { lastAsyncUploadState: 'IN_PROGRESS' },
      })),
    });
    await expect(slow.result).rejects.toThrow('did not finish processing the upload in time');
  });

  it('stops before submitting when the upload fails', async () => {
    const { result, calls } = run({
      '/token': [token],
      ':upload': [{ body: { uploadState: 'FAILED' } }],
    });
    await expect(result).rejects.toThrow('The upload ended as FAILED.');
    expect(calls.some((c) => c.url.endsWith(':publish'))).toBe(false);
  });

  it('reports an HTTP error with its status and body', async () => {
    const { result } = run({
      '/token': [token],
      ':upload': [{ status: 400, body: { error: { message: 'Version must be higher' } } }],
    });
    await expect(result).rejects.toThrow(
      'Uploading the package failed: HTTP 400 {"error":{"message":"Version must be higher"}}',
    );
  });

  it('logs store warnings and fails a submission that was not accepted', async () => {
    const { result, log } = run({
      '/token': [token],
      ':upload': [{ body: { uploadState: 'SUCCEEDED', crxVersion: '0.5.2' } }],
      ':publish': [
        {
          body: {
            state: 'REJECTED',
            warningInfo: { warnings: [{ reason: 'R', description: 'D' }] },
          },
        },
      ],
    });
    await expect(result).rejects.toThrow('The submission ended as REJECTED.');
    expect(log).toContain('Store warning: {"reason":"R","description":"D"}');
  });

  it('never puts a credential in a message or a log line', async () => {
    const { result, log } = run({
      '/token': [
        {
          status: 400,
          body: { error: 'invalid_grant', error_description: 'Token refresh-token-value expired' },
        },
      ],
    });
    const error = await result.then(
      () => new Error('expected a failure'),
      (reason: unknown) => reason as Error,
    );
    expect(error.message).toBe('Getting an access token failed: HTTP 400 (invalid_grant)');
    for (const text of [error.message, ...log]) {
      for (const secret of [ENV.CWS_CLIENT_SECRET, ENV.CWS_REFRESH_TOKEN, ACCESS_TOKEN]) {
        expect(text).not.toContain(secret);
      }
    }
  });
});
