import type { Usage } from '../inspectOutput.ts';

// What Unleash's strategies-by-context-field and strategies-by-segment entries have in common.
type UnleashUsage = { projectId: string; featureName: string; environment: string };

// Unleash answers with one entry per strategy; a flag with several strategies on the field or segment in one
// environment is still one use, so entries are deduplicated by project, flag and environment.
export const toUsedBy = (strategies: UnleashUsage[]): Usage[] => {
  const uses = strategies.map(({ projectId, featureName, environment }): Usage => ({ project: projectId, flag: featureName, environment }));
  return uses.filter((use, index) => uses.findIndex((other) => isSameUse(use, other)) === index);
};

const isSameUse = (a: Usage, b: Usage): boolean => a.project === b.project && a.flag === b.flag && a.environment === b.environment;
