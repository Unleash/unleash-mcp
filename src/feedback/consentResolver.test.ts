import { describe, expect, it } from 'vitest';
import { silentLogger as logger } from '../test-utils/silentLogger.js';
import type { FeedbackConsentDecision } from './consentDecision.js';
import { FeedbackConsentResolver } from './consentResolver.js';

describe('FeedbackConsentResolver', () => {
  it.each<FeedbackConsentDecision>([
    'granted',
    'denied',
  ])('returns the initial %s consent', async (initialConsent) => {
    const resolver = new FeedbackConsentResolver({ initialConsent, logger });

    await expect(resolver.resolve()).resolves.toBe(initialConsent);
  });

  it('denies for the session when no consent was decided', async () => {
    const resolver = new FeedbackConsentResolver({ logger });

    await expect(resolver.resolve()).resolves.toBe('denied');
    await expect(resolver.resolve()).resolves.toBe('denied');
  });
});
