// Uploads the release zip to the Chrome Web Store and submits it for review (Chrome Web Store API
// v2, https://developer.chrome.com/docs/webstore/using-api). Run by the `store` job of
// .github/workflows/release.yml:
//
//   node scripts/cws-publish.ts <path to ainonim-<version>-chrome.zip>
//
// Configuration comes from the environment: CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN
// (OAuth client and refresh token with the https://www.googleapis.com/auth/chromewebstore
// scope), CWS_PUBLISHER_ID and CWS_EXTENSION_ID (Developer Dashboard), and optionally
// CWS_PUBLISH_TYPE (DEFAULT_PUBLISH, the default, or STAGED_PUBLISH). Tokens are never printed.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://chromewebstore.googleapis.com';
const PUBLISH_TYPES = ['DEFAULT_PUBLISH', 'STAGED_PUBLISH'] as const;
/** Review states a successful submission can end in. */
const SUBMITTED_STATES = ['PENDING_REVIEW', 'STAGED', 'PUBLISHED', 'PUBLISHED_TO_TESTERS'];

type PublishType = (typeof PUBLISH_TYPES)[number];

export interface Config {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  publisherId: string;
  extensionId: string;
  publishType: PublishType;
}

export interface Options {
  fetch?: typeof fetch;
  log?: (line: string) => void;
  /** Wait between polls of an upload the store processes asynchronously. */
  pollMs?: number;
  /** Polls before giving up on such an upload. */
  maxPolls?: number;
}

/** The configuration from `env`, or an error naming every missing or invalid variable. */
export function readConfig(env: Record<string, string | undefined>): Config {
  const names = {
    clientId: 'CWS_CLIENT_ID',
    clientSecret: 'CWS_CLIENT_SECRET',
    refreshToken: 'CWS_REFRESH_TOKEN',
    publisherId: 'CWS_PUBLISHER_ID',
    extensionId: 'CWS_EXTENSION_ID',
  } as const;
  const missing = Object.values(names).filter((name) => !env[name]);
  const publishType = env.CWS_PUBLISH_TYPE || 'DEFAULT_PUBLISH';
  const problems = missing.map((name) => `${name} is not set`);
  if (!PUBLISH_TYPES.includes(publishType as PublishType)) {
    problems.push(`CWS_PUBLISH_TYPE must be one of ${PUBLISH_TYPES.join(', ')}`);
  }
  if (problems.length > 0) throw new Error(problems.join('; '));
  return {
    clientId: env[names.clientId] ?? '',
    clientSecret: env[names.clientSecret] ?? '',
    refreshToken: env[names.refreshToken] ?? '',
    publisherId: env[names.publisherId] ?? '',
    extensionId: env[names.extensionId] ?? '',
    publishType: publishType as PublishType,
  };
}

async function json(response: Response, what: string): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!response.ok) {
    // Google's error bodies describe the request, never the credentials.
    throw new Error(`${what} failed: HTTP ${String(response.status)} ${text}`);
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`${what} returned a body that is not JSON: ${text.slice(0, 200)}`);
  }
}

export async function accessToken(config: Config, fetchFn: typeof fetch): Promise<string> {
  const response = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) {
    // The token endpoint's error names the problem (e.g. invalid_grant) without echoing secrets,
    // but only the status and that name are shown, to be safe.
    let reason = '';
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === 'string') reason = ` (${body.error})`;
    } catch {
      // No JSON body: the status is all there is to say.
    }
    throw new Error(`Getting an access token failed: HTTP ${String(response.status)}${reason}`);
  }
  const body = (await response.json()) as { access_token?: unknown };
  if (typeof body.access_token !== 'string') throw new Error('The token response has no token.');
  return body.access_token;
}

function itemPath(config: Config): string {
  return `publishers/${encodeURIComponent(config.publisherId)}/items/${encodeURIComponent(config.extensionId)}`;
}

async function waitForUpload(
  config: Config,
  auth: Record<string, string>,
  options: Required<Options>,
): Promise<void> {
  for (let poll = 0; poll < options.maxPolls; poll++) {
    await new Promise((resolve) => setTimeout(resolve, options.pollMs));
    const status = await json(
      await options.fetch(`${API}/v2/${itemPath(config)}:fetchStatus`, { headers: auth }),
      'Checking the upload',
    );
    const state = status.lastAsyncUploadState;
    if (state === 'SUCCEEDED') return;
    if (state !== 'IN_PROGRESS') throw new Error(`The upload ended as ${String(state)}.`);
    options.log('The store is still processing the upload…');
  }
  throw new Error('The store did not finish processing the upload in time.');
}

/** Upload `zip` and submit it for review. Resolves with the item's review state. */
export async function publish(
  zip: Uint8Array<ArrayBuffer>,
  config: Config,
  options: Options = {},
): Promise<string> {
  const opts: Required<Options> = {
    fetch: options.fetch ?? fetch,
    log: options.log ?? console.log,
    pollMs: options.pollMs ?? 5_000,
    maxPolls: options.maxPolls ?? 60,
  };
  const auth = { authorization: `Bearer ${await accessToken(config, opts.fetch)}` };

  const upload = await json(
    await opts.fetch(`${API}/upload/v2/${itemPath(config)}:upload`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/zip' },
      body: zip,
    }),
    'Uploading the package',
  );
  if (upload.uploadState === 'IN_PROGRESS') await waitForUpload(config, auth, opts);
  else if (upload.uploadState !== 'SUCCEEDED') {
    throw new Error(`The upload ended as ${String(upload.uploadState)}.`);
  }
  const version = typeof upload.crxVersion === 'string' ? upload.crxVersion : '(being processed)';
  opts.log(`Uploaded version ${version}.`);

  const published = await json(
    await opts.fetch(`${API}/v2/${itemPath(config)}:publish`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ publishType: config.publishType }),
    }),
    'Submitting for review',
  );
  const state = String(published.state);
  const warnings = (published.warningInfo as { warnings?: unknown[] } | undefined)?.warnings ?? [];
  for (const warning of warnings) opts.log(`Store warning: ${JSON.stringify(warning)}`);
  if (!SUBMITTED_STATES.includes(state)) throw new Error(`The submission ended as ${state}.`);
  opts.log(`Submitted: the item is now ${state}.`);
  return state;
}

async function main(): Promise<void> {
  const zipPath = process.argv[2];
  if (!zipPath) throw new Error('Usage: node scripts/cws-publish.ts <package.zip>');
  const config = readConfig(process.env);
  // A copy, so the bytes sit in a plain ArrayBuffer as fetch's body type wants.
  await publish(new Uint8Array(await readFile(zipPath)), config);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
