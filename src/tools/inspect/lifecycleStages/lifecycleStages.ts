import type { components } from '../../../unleash/api.d.ts';
import type { UnleashClient } from '../../../unleash/client.ts';
import { type Failed, toFailed } from '../../shared/failed.ts';
import {
  type LifecycleStage,
  lifecycleStage,
  toLifecycleStage,
  type UnleashStage,
} from '../../shared/lifecycleStage.ts';
import type { LifecycleStages } from '../inspectOutput.ts';

type CountKey = keyof components['schemas']['featureLifecycleCountSchema'];

// The count endpoint keys its stages in camel case. A key the spec adds fails to compile here until it is mapped.
const countKeys: Record<CountKey, UnleashStage> = {
  initial: 'initial',
  preLive: 'pre-live',
  live: 'live',
  completed: 'completed',
  archived: 'archived',
};

const isCountKey = (key: string): key is CountKey => Object.hasOwn(countKeys, key);

const byLifecycleOrder = (a: LifecycleStage, b: LifecycleStage) =>
  lifecycleStage.options.indexOf(a) - lifecycleStage.options.indexOf(b);

/**
 * Lists the lifecycle stages a flag can be in, in order, as the Unleash UI names them.
 * Unleash has no endpoint for the stages themselves, so they are read off the keys of the stage counts,
 * which list every stage whether it has flags or not. The counts are dropped.
 * They come in the order a flag moves through them, whatever order Unleash sends the keys in.
 * A stage an Unleash newer than the generated types answers is left out until the tools name it.
 */
export const inspectLifecycleStages = async (unleash: UnleashClient): Promise<LifecycleStages | Failed> => {
  const counted = await unleash.GET('/api/admin/lifecycle/count');
  if (!counted.response.ok || !counted.data) return toFailed(counted);
  const stages = Object.keys(counted.data)
    .filter(isCountKey)
    .map((key): LifecycleStage => toLifecycleStage(countKeys[key]))
    .sort(byLifecycleOrder);
  return { kind: 'lifecycle_stages', stages };
};
