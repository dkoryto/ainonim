// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditableField } from '~/lib/content/fields/text';
import {
  type FieldState,
  forgetField,
  stateOf,
  sweepRemovedFields,
} from '~/lib/content/masking-field';

function field(): HTMLTextAreaElement {
  const textarea = document.createElement('textarea');
  document.body.append(textarea);
  return textarea;
}

let fields: Map<EditableField, FieldState>;

beforeEach(() => {
  vi.useFakeTimers();
  fields = new Map();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('stateOf', () => {
  it('creates an idle state once and returns the same one after', () => {
    const textarea = field();
    const state = stateOf(fields, textarea);
    expect(state).toMatchObject({ status: 'idle', badge: null, busy: false, generation: 0 });
    expect(stateOf(fields, textarea)).toBe(state);
  });
});

describe('forgetField', () => {
  it('drops the field and makes a pending answer stale', () => {
    const textarea = field();
    const state = stateOf(fields, textarea);
    forgetField(fields, textarea);
    expect(fields.has(textarea)).toBe(false);
    expect(state.generation).toBe(1);
    forgetField(fields, textarea);
    expect(state.generation).toBe(1);
  });
});

describe('sweepRemovedFields', () => {
  it('forgets the fields that left the page a little after the removal', async () => {
    const kept = field();
    const removed = field();
    stateOf(fields, kept);
    stateOf(fields, removed);
    const stop = sweepRemovedFields(document, fields);
    removed.remove();
    await vi.advanceTimersByTimeAsync(0);
    expect(fields.has(removed)).toBe(true);
    await vi.advanceTimersByTimeAsync(200);
    expect([...fields.keys()]).toEqual([kept]);
    stop();
  });

  it('does nothing once stopped', async () => {
    const removed = field();
    stateOf(fields, removed);
    const stop = sweepRemovedFields(document, fields);
    removed.remove();
    await vi.advanceTimersByTimeAsync(0);
    stop();
    await vi.advanceTimersByTimeAsync(200);
    expect(fields.has(removed)).toBe(true);
  });
});
