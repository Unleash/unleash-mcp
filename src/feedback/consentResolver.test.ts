import { describe, expect, it, vi } from 'vitest';
import {
  createFakeConsentStore,
  FAKE_CONSENT_WRITE_ERROR,
} from '../test-utils/fakeConsentStore.js';
import { silentLogger as logger } from '../test-utils/silentLogger.js';
import type { FeedbackConsentDecision } from './consentDecision.js';
import { FeedbackConsentResolver } from './consentResolver.js';
import type { ConsentStore } from './consentStore.js';

function createResolver(
  overrides: {
    initialConsent?: FeedbackConsentDecision;
    answer?: FeedbackConsentDecision | Error;
    store?: ConsentStore;
    clientShowsConsentPrompt?: boolean;
  } = {},
) {
  const answer = overrides.answer;
  const askUser = vi.fn(() =>
    answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer),
  );
  const resolver = new FeedbackConsentResolver({
    initialConsent: overrides.initialConsent,
    askUser,
    clientShowsConsentPrompt: () => overrides.clientShowsConsentPrompt ?? true,
    store: overrides.store ?? createFakeConsentStore().store,
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

    await expect(resolver.resolve()).resolves.toEqual({ consent: initialConsent });
    expect(askUser).not.toHaveBeenCalled();
  });

  it('denies without asking or touching the store when the client cannot show the prompt', async () => {
    const { store, written } = createFakeConsentStore({ stored: 'granted' });
    const { resolver } = createResolver({
      store,
      answer: 'granted',
      clientShowsConsentPrompt: false,
    });

    await expect(resolver.resolve()).resolves.toEqual({ consent: 'denied' });
    expect(written).toEqual([]);
  });

  it('honours explicit consent when the client cannot show the prompt', async () => {
    const { resolver } = createResolver({
      initialConsent: 'granted',
      clientShowsConsentPrompt: false,
    });

    await expect(resolver.resolve()).resolves.toEqual({ consent: 'granted' });
  });

  it('uses the stored decision before asking', async () => {
    const { store } = createFakeConsentStore({ stored: 'denied' });
    const { resolver, askUser } = createResolver({ store, answer: 'granted' });

    await expect(resolver.resolve()).resolves.toEqual({ consent: 'denied' });
    expect(askUser).not.toHaveBeenCalled();
  });

  it.each<FeedbackConsentDecision>([
    'granted',
    'denied',
  ])('persists a %s answer and does not ask again', async (answer) => {
    const { store, written } = createFakeConsentStore();
    const { resolver, askUser } = createResolver({ store, answer });

    await expect(resolver.resolve()).resolves.toEqual({ consent: answer });
    await expect(resolver.resolve()).resolves.toEqual({ consent: answer });

    expect(askUser).toHaveBeenCalledTimes(1);
    expect(written).toEqual([answer]);
  });

  it.each<{ label: string; answer: Error | undefined }>([
    { label: 'unanswered', answer: undefined },
    { label: 'failing', answer: new Error('transport closed') },
  ])('denies for the session without persisting when the prompt is $label', async ({ answer }) => {
    const { store, written } = createFakeConsentStore();
    const { resolver, askUser } = createResolver({ store, answer });

    await expect(resolver.resolve()).resolves.toEqual({ consent: 'denied' });
    await expect(resolver.resolve()).resolves.toEqual({ consent: 'denied' });

    expect(askUser).toHaveBeenCalledTimes(1);
    expect(written).toEqual([]);
  });

  it('shares one prompt between concurrent resolutions', async () => {
    const { resolver, askUser } = createResolver({ answer: 'granted' });

    const results = await Promise.all([resolver.resolve(), resolver.resolve()]);

    expect(results).toEqual([{ consent: 'granted' }, { consent: 'granted' }]);
    expect(askUser).toHaveBeenCalledTimes(1);
  });

  it('asks the user when the store cannot be read', async () => {
    const { store, written } = createFakeConsentStore({ readable: false });
    const { resolver, askUser } = createResolver({ store, answer: 'granted' });

    await expect(resolver.resolve()).resolves.toEqual({ consent: 'granted' });
    expect(askUser).toHaveBeenCalledTimes(1);
    expect(written).toEqual(['granted']);
  });

  it('reports the store error only on the call that failed to persist the answer', async () => {
    const { store } = createFakeConsentStore({ writable: false });
    const { resolver, askUser } = createResolver({ store, answer: 'granted' });

    await expect(resolver.resolve()).resolves.toEqual({
      consent: 'granted',
      warning: `${FAKE_CONSENT_WRITE_ERROR}. The consent decision is remembered for this session only; the user will be asked again next time.`,
    });
    await expect(resolver.resolve()).resolves.toEqual({ consent: 'granted' });
    expect(askUser).toHaveBeenCalledTimes(1);
  });
});
