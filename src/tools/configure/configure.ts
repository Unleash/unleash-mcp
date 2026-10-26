import type { UnleashClient } from '../../unleash/client.ts';
import type { Change, ConfigureInput } from './configureInput.ts';
import type { ConfigureOutput, ConfigureResult, Outcome, PendingChange, Target } from './configureOutput.ts';
import { type ChangeRequestReader, createChangeRequestReader } from '../shared/changeRequest.ts';
import { createContextField, deleteContextField, updateContextField } from './contextField.ts';
import { createLegalValue, deleteLegalValue } from './legalValue.ts';
import { createReleaseTemplate } from './releaseTemplate.ts';
import { createSegment, deleteSegment, updateSegment } from './segment.ts';
import { createTagType, deleteTagType, updateTagType } from './tagType.ts';
import { deleteTag } from './tag.ts';

/** Builds the configure tool: applies changes to Unleash resources one after another, one result per change. */
export const createConfigure = (unleash: UnleashClient) => {
  const environmentsOf = createChangeRequestReader(unleash);
  return async ({ changes }: ConfigureInput): Promise<ConfigureOutput> => {
    const results: ConfigureResult[] = [];
    for (const change of changes) results.push(resultOf(change, await apply(unleash, environmentsOf, change)));
    return { results };
  };
};

const apply = (unleash: UnleashClient, environmentsOf: ChangeRequestReader, change: Change): Promise<Outcome | PendingChange> => {
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
    case 'tag_type':
      switch (change.action) {
        case 'create': return createTagType(unleash, change);
        case 'update': return updateTagType(unleash, change);
        case 'delete': return deleteTagType(unleash, change);
      }
    case 'tag': return deleteTag(unleash, change);
    case 'release_template': return createReleaseTemplate(unleash, change);
    case 'segment':
      switch (change.action) {
        case 'create': return createSegment(unleash, change);
        case 'update': return updateSegment(unleash, environmentsOf, change);
        case 'delete': return deleteSegment(unleash, environmentsOf, change);
      }
  }
};

const resultOf = (change: Change, outcome: Outcome | PendingChange): ConfigureResult => {
  const target = targetOf(change);
  // Only the steps for resources that have an id answer one, and only segment updates and deletes wait for a
  // change request, which the types can't tie to `resource` and `action`.
  if (outcome.kind !== 'failed') return { ...outcome, ...target } as ConfigureResult;
  const { kind, ...error } = outcome;
  return { kind: 'failed', ...target, error };
};

const targetOf = (change: Change): Target => {
  switch (change.kind) {
    case 'context_field': return { resource: 'context_field', action: change.action, name: change.name };
    case 'legal_value': return { resource: 'legal_value', action: change.action, field: change.field, value: change.value };
    case 'tag_type': return { resource: 'tag_type', action: change.action, name: change.name };
    case 'tag': return { resource: 'tag', action: change.action, type: change.type, value: change.value };
    case 'release_template': return { resource: 'release_template', action: change.action, name: change.name };
    case 'segment':
      switch (change.action) {
        case 'create': return { resource: 'segment', action: change.action, name: change.name };
        case 'update': return { resource: 'segment', action: change.action, id: change.id, name: change.name };
        case 'delete': return { resource: 'segment', action: change.action, id: change.id };
      }
  }
};
