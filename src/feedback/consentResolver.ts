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

export interface FeedbackConsentResolution {
  consent: FeedbackConsentDecision;
  warning?: string;
}

export class FeedbackConsentResolver {
  private consent?: FeedbackConsentDecision;
  private pendingPrompt: Promise<FeedbackConsentResolution> | null = null;
  private readonly askUser: AskUser;
  private readonly consentStore: ConsentStore;
  private readonly logger: Logger;

  constructor(options: FeedbackConsentResolverOptions) {
    this.consent = options.initialConsent;
    this.askUser = options.askUser;
    this.consentStore = options.store;
    this.logger = options.logger;
  }

  async resolve(): Promise<FeedbackConsentResolution> {
    if (this.consent) return { consent: this.consent };
    if (this.pendingPrompt) return this.pendingPrompt;

    const stored = this.consentStore.read();
    if (!stored.ok) {
      this.logger.warn(stored.error);
    } else if (stored.record) {
      this.consent = stored.record.consent;
      this.logger.info(`Feedback consent: ${this.consent} (from ${this.consentStore.location})`);
      return { consent: this.consent };
    }

    this.pendingPrompt = this.promptUser();
    return this.pendingPrompt;
  }

  private async promptUser(): Promise<FeedbackConsentResolution> {
    const answer = await this.askUser().catch((error: unknown) => {
      this.logger.warn(`Feedback consent prompt failed: ${describeError(error)}`);
      return undefined;
    });
    if (!answer) return this.denyForThisSession();

    this.consent = answer;
    this.logger.info(`Feedback consent ${answer} by user`);
    const persisted = this.consentStore.write(answer);
    if (persisted.ok) return { consent: answer };
    const warning = `${persisted.error}. The consent decision is remembered for this session only; the user will be asked again next time.`;
    this.logger.warn(warning);
    return { consent: answer, warning };
  }

  private denyForThisSession(): FeedbackConsentResolution {
    this.consent = 'denied';
    this.logger.info('No feedback consent recorded; feedback stays disabled for this session');
    return { consent: 'denied' };
  }
}
