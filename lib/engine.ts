// What the offscreen document does with a request from the service worker.
import {
  type AnalyzeResponse,
  type OffscreenRequest,
  type ReadyResponse,
  type RestoreResponse,
  checkTextLength,
  failure,
  parseAnalyzeResult,
} from './messages';
import { describeError } from './timeout';

/** The functions of python/ainonim_bridge.py, loaded into Pyodide. */
export interface Engine {
  analyze: (text: string, mappingJson: string) => string;
  restore: (text: string, mappingJson: string) => string;
  /** Time it took to load Pyodide and polanon, in milliseconds. */
  loadMs: number;
}

export type EngineResponse = ReadyResponse | AnalyzeResponse | RestoreResponse;

async function run(engine: Promise<Engine>, request: OffscreenRequest): Promise<EngineResponse> {
  const { id } = request;
  let loaded: Engine;
  try {
    loaded = await engine;
  } catch (error) {
    return failure(
      id,
      'engine',
      `The anonymization engine failed to load: ${describeError('offscreen-load', error)}`,
    );
  }
  if (request.type === 'ainonim/offscreen-ready') return { id, ok: true, loadMs: loaded.loadMs };

  // The service worker checks the length too; this keeps the limit even if it did not.
  const tooLong = checkTextLength(id, request.text);
  if (tooLong) return tooLong;
  const mappingJson = JSON.stringify(request.mapping);

  if (request.type === 'ainonim/offscreen-analyze') {
    const started = performance.now();
    const result = parseAnalyzeResult(loaded.analyze(request.text, mappingJson));
    const analyzeMs = performance.now() - started;
    return { id, ok: true, result, analyzeMs, loadMs: loaded.loadMs };
  }
  const text: unknown = loaded.restore(request.text, mappingJson);
  if (typeof text !== 'string') throw new Error('Malformed restore result from Python');
  return { id, ok: true, text };
}

/** Build the request handler around the engine being loaded. The handler never rejects. */
export function createEngineHandler(
  engine: Promise<Engine>,
): (request: OffscreenRequest) => Promise<EngineResponse> {
  return async (request) => {
    try {
      return await run(engine, request);
    } catch (error) {
      console.error('ainonim engine error', error);
      return failure(request.id, 'engine', describeError('offscreen', error));
    }
  };
}
