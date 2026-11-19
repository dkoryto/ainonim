import { describe, expect, it, vi } from 'vitest';
import { type Engine, createEngineHandler } from '~/lib/engine';
import { MAX_TEXT_LENGTH } from '~/lib/messages';

const analyzeJson = JSON.stringify({
  anonymized: '<OSOBA_1>',
  spans: [{ start: 0, end: 3, entity_type: 'PERSON', score: 0.9 }],
  mapping: { '<OSOBA_1>': 'Jan' },
});

function fakeEngine(overrides: Partial<Engine> = {}): Engine {
  return {
    analyze: vi.fn(() => analyzeJson),
    restore: vi.fn(() => 'Jan'),
    loadMs: 1400,
    ...overrides,
  };
}

describe('createEngineHandler', () => {
  it('reports readiness with the load time', async () => {
    const handle = createEngineHandler(Promise.resolve(fakeEngine()));

    await expect(handle({ type: 'ainonim/offscreen-ready', id: '1' })).resolves.toEqual({
      id: '1',
      ok: true,
      loadMs: 1400,
    });
  });

  it('calls analyze with the mapping as JSON and validates the result', async () => {
    const engine = fakeEngine();
    const handle = createEngineHandler(Promise.resolve(engine));
    const mapping = { '<OSOBA_1>': 'Jan' };

    const response = await handle({
      type: 'ainonim/offscreen-analyze',
      id: '1',
      text: 'Jan',
      mapping,
    });

    expect(engine.analyze).toHaveBeenCalledWith('Jan', '{"<OSOBA_1>":"Jan"}');
    expect(response).toMatchObject({ id: '1', ok: true, loadMs: 1400 });
  });

  it('calls restore with the mapping as JSON', async () => {
    const engine = fakeEngine();
    const handle = createEngineHandler(Promise.resolve(engine));

    const response = await handle({
      type: 'ainonim/offscreen-restore',
      id: '1',
      text: '<OSOBA_1>',
      mapping: { '<OSOBA_1>': 'Jan' },
    });

    expect(engine.restore).toHaveBeenCalledWith('<OSOBA_1>', '{"<OSOBA_1>":"Jan"}');
    expect(response).toEqual({ id: '1', ok: true, text: 'Jan' });
  });

  it('keeps text over the limit away from Python', async () => {
    const engine = fakeEngine();
    const handle = createEngineHandler(Promise.resolve(engine));

    const response = await handle({
      type: 'ainonim/offscreen-analyze',
      id: '1',
      text: 'a'.repeat(MAX_TEXT_LENGTH + 1),
      mapping: {},
    });

    expect(response).toMatchObject({ ok: false, code: 'too-long' });
    expect(engine.analyze).not.toHaveBeenCalled();
  });

  it('answers with an error when the engine failed to load', async () => {
    const handle = createEngineHandler(Promise.reject(new Error('wheel not found')));

    await expect(handle({ type: 'ainonim/offscreen-ready', id: '1' })).resolves.toEqual({
      id: '1',
      ok: false,
      code: 'engine',
      error: 'The anonymization engine failed to load: wheel not found',
    });
  });

  it('shortens a Python traceback to its last line', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const traceback =
      'Traceback (most recent call last):\n  File "<exec>", line 1\nValueError: bad mapping\n';
    const engine = fakeEngine({
      restore: () => {
        throw new Error(traceback);
      },
    });
    const handle = createEngineHandler(Promise.resolve(engine));

    const response = await handle({
      type: 'ainonim/offscreen-restore',
      id: '1',
      text: 'a',
      mapping: {},
    });

    expect(response).toEqual({
      id: '1',
      ok: false,
      code: 'engine',
      error: 'ValueError: bad mapping',
    });
  });

  it('rejects a malformed analyze result', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const handle = createEngineHandler(Promise.resolve(fakeEngine({ analyze: () => '[]' })));

    const response = await handle({
      type: 'ainonim/offscreen-analyze',
      id: '1',
      text: 'a',
      mapping: {},
    });

    expect(response).toMatchObject({ ok: false, error: 'Malformed analyze result from Python' });
  });
});
