import { z } from 'zod';

// The stages as the Unleash UI names them; the API calls them initial, pre-live, live, completed and archived.
export const lifecycleStage = z.enum(['define', 'develop', 'production', 'cleanup', 'archived']);

export type LifecycleStage = z.infer<typeof lifecycleStage>;
export type UnleashStage = 'initial' | 'pre-live' | 'live' | 'completed' | 'archived';

// A stage Unleash adds fails to compile here until it has a UI name.
const stages: Record<UnleashStage, LifecycleStage> = { initial: 'define', 'pre-live': 'develop', live: 'production', completed: 'cleanup', archived: 'archived' };

export const toLifecycleStage = (stage: UnleashStage): LifecycleStage => stages[stage];

const unleashStages = Object.fromEntries(Object.entries(stages).map(([unleashStage, stage]) => [stage, unleashStage])) as Record<LifecycleStage, UnleashStage>;

export const toUnleashStage = (stage: LifecycleStage): UnleashStage => unleashStages[stage];
