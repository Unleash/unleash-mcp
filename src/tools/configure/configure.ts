import type { UnleashClient } from '../../unleash/client.ts';
import type { Change, ConfigureInput } from './configureInput.ts';
import type { ConfigureOutput, ConfigureResult, Outcome, Target } from './configureOutput.ts';
import { createContextField, deleteContextField, updateContextField } from './contextField.ts';
import { createLegalValue, deleteLegalValue } from './legalValue.ts';
import { createReleaseTemplate } from './releaseTemplate.ts';
import { createSegment, deleteSegment, updateSegment } from './segment.ts';

/** Builds the configure tool: applies changes to Unleash resources one after another, one result per change. */
export const createConfigure =
  (unleash: UnleashClient) =>
    async ({ changes }: ConfigureInput): Promise<ConfigureOutput> => {
      const results: ConfigureResult[] = [];
      for (const change of changes) results.push(resultOf(change, await apply(unleash, change)));
      return { results };
    };

const apply = (unleash: UnleashClient, change: Change): Promise<Outcome> => {
  switch (change.kind) {
    case 'context_field':
      switch (change.action) {
        case 'create': return createContextField(unleash, change);
        case 'update': return updateContextField(unleash, change);
        case 'delete': return deleteContextField(unleash, change);
      }
    case 'legal_value':
      switch (change.action) {
        case 'create': return createLegalValue(unleash, change);
        case 'delete': return deleteLegalValue(unleash, change);
      }
    case 'release_template': return createReleaseTemplate(unleash, change);
    case 'segment':
      switch (change.action) {
        case 'create': return createSegment(unleash, change);
        case 'update': return updateSegment(unleash, change);
        case 'delete': return deleteSegment(unleash, change);
      }
  }
};

const resultOf = (change: Change, outcome: Outcome): ConfigureResult => {
  const target = targetOf(change);
  // Only the steps for resources that have an id answer one, which the types can't tie to `resource`.
  if (outcome.kind === 'applied') return { ...outcome, ...target } as ConfigureResult;
  const { kind, ...error } = outcome;
  return { kind: 'failed', ...target, error };
};

const targetOf = (change: Change): Target => {
  switch (change.kind) {
    case 'context_field': return { resource: 'context_field', action: change.action, name: change.name };
    case 'legal_value': return { resource: 'legal_value', action: change.action, field: change.field, value: change.value };
    case 'release_template': return { resource: 'release_template', action: change.action, name: change.name };
    case 'segment':
      switch (change.action) {
        case 'create': return { resource: 'segment', action: change.action, name: change.name };
        case 'update': return { resource: 'segment', action: change.action, id: change.id, name: change.name };
        case 'delete': return { resource: 'segment', action: change.action, id: change.id };
      }
  }
};
