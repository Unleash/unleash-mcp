import type { Logger } from '../context.js';
import type { FeedbackConsentDecision } from './consentDecision.js';

export interface FeedbackConsentResolverOptions {
  initialConsent?: FeedbackConsentDecision;
  logger: Logger;
}

export class FeedbackConsentResolver {
  private consent?: FeedbackConsentDecision;
  private readonly logger: Logger;

  constructor(options: FeedbackConsentResolverOptions) {
    this.consent = options.initialConsent;
    this.logger = options.logger;
  }

  async resolve(): Promise<FeedbackConsentDecision> {
    if (this.consent) return this.consent;
    return this.denyForThisSession();
  }

  private denyForThisSession(): FeedbackConsentDecision {
    this.consent = 'denied';
    this.logger.info('No feedback consent recorded; feedback stays disabled for this session');
    return 'denied';
  }
}
