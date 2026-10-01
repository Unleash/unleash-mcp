import type { FeedbackConsentDecision } from '../feedback/consentDecision.js';
import {
  CONSENT_VERSION,
  type ConsentRecord,
  type ConsentStore,
} from '../feedback/consentStore.js';

export const FAKE_CONSENT_WRITE_ERROR = 'write failed';

export interface FakeConsentStoreOptions {
  stored?: FeedbackConsentDecision;
  readable?: boolean;
  writable?: boolean;
}

export function createFakeConsentStore(options: FakeConsentStoreOptions = {}) {
  const record: ConsentRecord | null = options.stored
    ? {
        consent: options.stored,
        decidedAt: '2026-09-21T10:00:00.000Z',
        consentVersion: CONSENT_VERSION,
      }
    : null;
  const written: FeedbackConsentDecision[] = [];
  const store: ConsentStore = {
    location: 'feedback_consent.json',
    read: () =>
      (options.readable ?? true) ? { ok: true, record } : { ok: false, error: 'read failed' },
    write: (consent) => {
      written.push(consent);
      return (options.writable ?? true)
        ? { ok: true }
        : { ok: false, error: FAKE_CONSENT_WRITE_ERROR };
    },
  };
  return { store, written };
}
