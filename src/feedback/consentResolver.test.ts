import { describe, expect, it, vi } from 'vitest';
import { silentLogger as logger } from '../test-utils/silentLogger.js';
import type { FeedbackConsentDecision } from './consentDecision.js';
import { FeedbackConsentResolver } from './consentResolver.js';
import { CONSENT_VERSION, type ConsentRecord, type ConsentStore } from './consentStore.js';

function createStore(overrides: { stored?: FeedbackConsentDecision; writable?: boolean } = {}) {
  const record: ConsentRecord | null = overrides.stored
    ? {
        feedback: overrides.stored,
        decidedAt: '2026-09-21T10:00:00.000Z',
        consentVersion: CONSENT_VERSION,
      }
    : null;
  const written: FeedbackConsentDecision[] = [];
  const store: ConsentStore = {
    location: 'consent.json',
    read: () => record,
    write: (feedback) => {
      written.push(feedback);
      return overrides.writable ?? true;
    },
  };
  return { store, written };
}

function createResolver(
  overrides: {
    initialConsent?: FeedbackConsentDecision;
    answer?: FeedbackConsentDecision | Error;
    store?: ConsentStore;
  } = {},
) {
  const answer = overrides.answer;
  const askUser = vi.fn(() =>
    answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer),
  );
  const resolver = new FeedbackConsentResolver({
    initialConsent: overrides.initialConsent,
    askUser,
    store: overrides.store ?? createStore().store,
    logger,
  });
  return { resolver, askUser };
}

describe('FeedbackConsentResolver', () => {
  it.each<FeedbackConsentDecision>([
    'granted',
    'denied',
  ])('returns the initial %s consent without asking', async (initialConsent) => {
    const { resolver, askUser } = createResolver({ initialConsent, answer: 'granted' });

    await expect(resolver.resolve()).resolves.toBe(initialConsent);
    expect(askUser).not.toHaveBeenCalled();
  });

  it('uses the stored decision before asking', async () => {
    const { store } = createStore({ stored: 'denied' });
    const { resolver, askUser } = createResolver({ store, answer: 'granted' });

    await expect(resolver.resolve()).resolves.toBe('denied');
    expect(askUser).not.toHaveBeenCalled();
  });

  it.each<FeedbackConsentDecision>([
    'granted',
    'denied',
  ])('persists a %s answer and does not ask again', async (answer) => {
    const { store, written } = createStore();
    const { resolver, askUser } = createResolver({ store, answer });

    await expect(resolver.resolve()).resolves.toBe(answer);
    await expect(resolver.resolve()).resolves.toBe(answer);

    expect(askUser).toHaveBeenCalledTimes(1);
    expect(written).toEqual([answer]);
  });

  it.each<{ label: string; answer: Error | undefined }>([
    { label: 'unanswered', answer: undefined },
    { label: 'failing', answer: new Error('transport closed') },
  ])('denies for the session without persisting when the prompt is $label', async ({ answer }) => {
    const { store, written } = createStore();
    const { resolver, askUser } = createResolver({ store, answer });

    await expect(resolver.resolve()).resolves.toBe('denied');
    await expect(resolver.resolve()).resolves.toBe('denied');

    expect(askUser).toHaveBeenCalledTimes(1);
    expect(written).toEqual([]);
  });

  it('shares one prompt between concurrent resolutions', async () => {
    const { resolver, askUser } = createResolver({ answer: 'granted' });

    const results = await Promise.all([resolver.resolve(), resolver.resolve()]);

    expect(results).toEqual(['granted', 'granted']);
    expect(askUser).toHaveBeenCalledTimes(1);
  });

  it('keeps the answer in memory when the store cannot persist it', async () => {
    const { store } = createStore({ writable: false });
    const { resolver, askUser } = createResolver({ store, answer: 'granted' });

    await expect(resolver.resolve()).resolves.toBe('granted');
    await expect(resolver.resolve()).resolves.toBe('granted');
    expect(askUser).toHaveBeenCalledTimes(1);
  });
});
