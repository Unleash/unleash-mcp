import type { Logger } from '../context.js';
import { describeError } from '../utils/errors.js';
import type { FeedbackConsentDecision } from './consentDecision.js';
import type { ConsentStore } from './consentStore.js';
import type { AskUser } from './elicitation.js';

export interface FeedbackConsentResolverOptions {
  initialConsent?: FeedbackConsentDecision;
  askUser: AskUser;
  store: ConsentStore;
  logger: Logger;
}

export class FeedbackConsentResolver {
  private consent?: FeedbackConsentDecision;
  private pendingPrompt: Promise<FeedbackConsentDecision> | null = null;
  private readonly askUser: AskUser;
  private readonly consentStore: ConsentStore;
  private readonly logger: Logger;

  constructor(options: FeedbackConsentResolverOptions) {
    this.consent = options.initialConsent;
    this.askUser = options.askUser;
    this.consentStore = options.store;
    this.logger = options.logger;
  }

  async resolve(): Promise<FeedbackConsentDecision> {
    if (this.consent) return this.consent;
    if (this.pendingPrompt) return this.pendingPrompt;

    const maybeStoredConsent = this.consentStore.read();
    if (maybeStoredConsent) {
      this.consent = maybeStoredConsent.feedback;
      this.logger.info(`Feedback consent: ${this.consent} (from ${this.consentStore.location})`);
      return this.consent;
    }

    this.pendingPrompt = this.promptUser();
    return this.pendingPrompt;
  }

  private async promptUser(): Promise<FeedbackConsentDecision> {
    const answer = await this.askUser().catch((error: unknown) => {
      this.logger.warn(`Feedback consent prompt failed: ${describeError(error)}`);
      return undefined;
    });
    if (!answer) return this.denyForThisSession();

    this.consent = answer;
    const persisted = this.consentStore.write(answer);
    this.logger.info(
      `Feedback consent ${answer} by user${persisted ? '' : ' (remembered for this session only)'}`,
    );
    return answer;
  }

  private denyForThisSession(): FeedbackConsentDecision {
    this.consent = 'denied';
    this.logger.info('No feedback consent recorded; feedback stays disabled for this session');
    return 'denied';
  }
}
