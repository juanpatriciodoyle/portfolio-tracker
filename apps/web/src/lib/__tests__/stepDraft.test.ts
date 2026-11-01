import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createMemoryStorage } from '../../test/memoryStorage';
import { clearAllDrafts, clearDraft, loadDraft, saveDraft } from '../stepDraft';

const schema = z.object({ name: z.string(), count: z.number() });

describe('step drafts', () => {
  it('brings back what was saved, with the step the person was on', () => {
    const storage = createMemoryStorage();

    saveDraft(storage, 'onboarding', { step: 2, values: { name: 'Joe', count: 3 } });

    expect(loadDraft(storage, 'onboarding', schema)).toEqual({ step: 2, values: { name: 'Joe', count: 3 } });
  });

  it('finds nothing when nothing was saved', () => {
    expect(loadDraft(createMemoryStorage(), 'onboarding', schema)).toBeNull();
  });

  it('keeps drafts under different keys apart', () => {
    const storage = createMemoryStorage();
    saveDraft(storage, 'a', { step: 0, values: { name: 'A', count: 1 } });
    saveDraft(storage, 'b', { step: 1, values: { name: 'B', count: 2 } });

    expect(loadDraft(storage, 'a', schema)?.values.name).toBe('A');
    expect(loadDraft(storage, 'b', schema)?.values.name).toBe('B');
  });

  it('forgets a draft once it is cleared', () => {
    const storage = createMemoryStorage();
    saveDraft(storage, 'a', { step: 0, values: { name: 'A', count: 1 } });

    clearDraft(storage, 'a');

    expect(loadDraft(storage, 'a', schema)).toBeNull();
  });

  it('ignores a draft that is damaged or in an older shape instead of failing', () => {
    const storage = createMemoryStorage({
      'draft:broken': '{not json',
      'draft:old': JSON.stringify({ step: 1, values: { name: 7 } }),
      'draft:noStep': JSON.stringify({ values: { name: 'x', count: 1 } }),
    });

    expect(loadDraft(storage, 'broken', schema)).toBeNull();
    expect(loadDraft(storage, 'old', schema)).toBeNull();
    expect(loadDraft(storage, 'noStep', schema)).toBeNull();
  });

  it('clears every draft and nothing else', () => {
    const storage = createMemoryStorage({ auth_token: 'abc' });
    saveDraft(storage, 'a', { step: 0, values: { name: 'A', count: 1 } });
    saveDraft(storage, 'b', { step: 0, values: { name: 'B', count: 1 } });

    clearAllDrafts(storage);

    expect(loadDraft(storage, 'a', schema)).toBeNull();
    expect(loadDraft(storage, 'b', schema)).toBeNull();
    expect(storage.getItem('auth_token')).toBe('abc');
  });

  it('carries on when the storage refuses to save', () => {
    const storage = createMemoryStorage();
    storage.setItem = () => {
      throw new Error('quota');
    };

    expect(() => saveDraft(storage, 'a', { step: 0, values: { name: 'A', count: 1 } })).not.toThrow();
  });
});
