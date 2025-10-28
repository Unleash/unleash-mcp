import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';

interface ProgressPayload {
  progress: number;
  message?: string;
  total?: number;
}

export function createProgressReporter(extra: RequestHandlerExtra<ServerRequest, ServerNotification>) {
  const progressToken = extra._meta?.progressToken;

  return {
    async report(payload: ProgressPayload) {
      if (!progressToken) {
        return;
      }

      const notification: ServerNotification = {
        method: 'notifications/progress',
        params: {
          progressToken,
          progress: payload.progress,
          ...(payload.total === undefined ? {} : { total: payload.total }),
          ...(payload.message ? { message: payload.message } : {})
        }
      };

      await extra.sendNotification(notification);
    }
  };
}
