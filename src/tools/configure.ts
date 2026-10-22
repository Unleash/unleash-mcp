import type { UnleashClient } from '../unleash/client.ts';
import type { Change, ConfigureInput } from './configureInput.ts';
import type { ConfigureOutput, ConfigureResult } from './configureOutput.ts';
import { createContextField, deleteContextField, updateContextField } from './contextField.ts';

/** Builds the configure tool: applies changes to Unleash resources one after another, one result per change. */
export const createConfigure =
  (unleash: UnleashClient) =>
    async ({ changes }: ConfigureInput): Promise<ConfigureOutput> => {
      const results: ConfigureResult[] = [];
      for (const change of changes) results.push(await configure(unleash, change));
      return { results };
    };

const configure = (unleash: UnleashClient, change: Change): Promise<ConfigureResult> => {
  switch (change.kind) {
    case 'context_field':
      switch (change.action) {
        case 'create': return createContextField(unleash, change);
        case 'update': return updateContextField(unleash, change);
        case 'delete': return deleteContextField(unleash, change);
      }
  }
};
