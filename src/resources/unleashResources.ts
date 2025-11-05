import type {
  Resource,
  ResourceTemplate,
  TextResourceContents,
} from '@modelcontextprotocol/sdk/types.js';

import type { ServerContext } from '../context.js';
import type { FeatureFlagSummary, UnleashProjectSummary } from '../unleash/client.js';

export const PROJECTS_RESOURCE_URI = 'unleash://projects';
export const PROJECTS_RESOURCE_TEMPLATE = 'unleash://projects{?limit,order,offset}';
export const FEATURE_FLAGS_RESOURCE_TEMPLATE =
  'unleash://projects/{projectId}/feature-flags{?limit,order,offset}';

const DEFAULT_PROJECT_PAGE_SIZE = 20;
const DEFAULT_FLAG_PAGE_SIZE = 50;

export function listStaticResources(): Resource[] {
  return [];
}

export function listResourceTemplates(): ResourceTemplate[] {
  return [
    {
      name: 'unleash-projects-filtered',
      uriTemplate: PROJECTS_RESOURCE_TEMPLATE,
      mimeType: 'application/json',
      description:
        'Unleash projects with optional query parameters. Use limit to control page size, order=asc|desc to sort by creation time, and offset to paginate.',
    },
    {
      name: 'unleash-feature-flags-by-project',
      uriTemplate: FEATURE_FLAGS_RESOURCE_TEMPLATE,
      mimeType: 'application/json',
      description:
        'Feature flags for a specific Unleash project. Replace {projectId}; optional limit/order/offset parameters help paginate flags alphabetically.',
    },
  ];
}

export async function readProjectsResource(
  context: ServerContext,
  options: { limit?: number; order?: 'asc' | 'desc'; offset?: number } = {}
): Promise<TextResourceContents> {
  try {
    const { projects, fetchedAt, fromCache } = await getCachedProjects(context);

    const order = options.order ?? 'desc';
    const sorted = sortProjects(projects, order);
    const effectiveLimit = options.limit ?? DEFAULT_PROJECT_PAGE_SIZE;
    const { slice, nextOffset } = applyPagination(sorted, effectiveLimit, options.offset);

    return {
      uri: buildProjectsUri({ ...options, limit: effectiveLimit }),
      mimeType: 'application/json',
      text: JSON.stringify(
        {
          fetchedAt: new Date(fetchedAt).toISOString(),
          cached: fromCache,
          dryRun: context.config.server.dryRun,
          order,
          limit: effectiveLimit,
          offset: options.offset ?? 0,
          nextOffset,
          totalProjects: projects.length,
          projects: slice,
        },
        null,
        2
      ),
    };
  } catch (error) {
    context.logger.error('Failed to read Unleash projects resource', error);
    throw error;
  }
}

export async function readFeatureFlagsResource(
  context: ServerContext,
  projectId: string,
  options: { limit?: number; order?: 'asc' | 'desc'; offset?: number } = {}
): Promise<TextResourceContents> {
  try {
    const { flags, fetchedAt, fromCache } = await getCachedFeatureFlags(context, projectId);

    const order = options.order ?? 'asc';
    const sorted = sortFeatureFlags(flags, order);
    const effectiveLimit = options.limit ?? DEFAULT_FLAG_PAGE_SIZE;
    const { slice, nextOffset } = applyPagination(sorted, effectiveLimit, options.offset);

    return {
      uri: buildFeatureFlagsUri(projectId, { ...options, limit: effectiveLimit }),
      mimeType: 'application/json',
      text: JSON.stringify(
        {
          fetchedAt: new Date(fetchedAt).toISOString(),
          cached: fromCache,
          dryRun: context.config.server.dryRun,
          projectId,
          order,
          limit: effectiveLimit,
          offset: options.offset ?? 0,
          nextOffset,
          totalFlags: flags.length,
          flags: slice,
        },
        null,
        2
      ),
    };
  } catch (error) {
    context.logger.error('Failed to read Unleash feature flags resource', error);
    throw error;
  }
}

export function isFeatureFlagsUri(uri: string): boolean {
  return /^unleash:\/\/projects\/[^/]+\/feature-flags(?:\?.*)?$/.test(uri);
}

export function isProjectsUri(uri: string): boolean {
  return uri === PROJECTS_RESOURCE_URI || uri.startsWith(`${PROJECTS_RESOURCE_URI}?`);
}

export function parseProjectsResourceOptions(
  uri: string
): { limit?: number; order?: 'asc' | 'desc'; offset?: number } {
  if (!isProjectsUri(uri)) {
    return {};
  }

  const queryIndex = uri.indexOf('?');
  if (queryIndex === -1) {
    return {};
  }

  const query = uri.slice(queryIndex + 1);
  const params = new URLSearchParams(query);

  const limitParam = params.get('limit');
  const orderParam = params.get('order');
  const offsetParam = params.get('offset');

  const limit = limitParam ? parsePositiveInteger(limitParam) : undefined;
  const order = normalizeOrder(orderParam);
  const offset = offsetParam ? parseNonNegativeInteger(offsetParam) : undefined;

  return {
    limit,
    order,
    offset,
  };
}

export function extractProjectIdFromFeatureUri(uri: string): string | undefined {
  const baseUri = uri.split('?')[0];
  const match = baseUri.match(/^unleash:\/\/projects\/([^/]+)\/feature-flags$/);
  if (!match) {
    return undefined;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function parseFeatureFlagsResourceOptions(
  uri: string
): { limit?: number; order?: 'asc' | 'desc'; offset?: number } {
  if (!isFeatureFlagsUri(uri)) {
    return {};
  }

  const queryIndex = uri.indexOf('?');
  if (queryIndex === -1) {
    return {};
  }

  const query = uri.slice(queryIndex + 1);
  const params = new URLSearchParams(query);

  const limitParam = params.get('limit');
  const orderParam = params.get('order');
  const offsetParam = params.get('offset');

  const limit = limitParam ? parsePositiveInteger(limitParam) : undefined;
  const order = orderParam ? normalizeOrder(orderParam) : undefined;
  const offset = offsetParam ? parseNonNegativeInteger(offsetParam) : undefined;

  return {
    limit,
    order,
    offset,
  };
}

export function buildFeatureFlagsUri(
  projectId: string,
  options: { limit?: number; order?: 'asc' | 'desc'; offset?: number } = {}
): string {
  const base = `unleash://projects/${encodeURIComponent(projectId)}/feature-flags`;
  const params = new URLSearchParams();

  if (typeof options.limit === 'number') {
    params.set('limit', String(options.limit));
  }

  if (options.order) {
    params.set('order', options.order);
  }

  if (typeof options.offset === 'number') {
    params.set('offset', String(options.offset));
  }

  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

function buildProjectsUri(options: { limit?: number; order?: 'asc' | 'desc'; offset?: number }): string {
  const params = new URLSearchParams();

  if (typeof options.limit === 'number') {
    params.set('limit', String(options.limit));
  }

  if (options.order) {
    params.set('order', options.order);
  }

  if (typeof options.offset === 'number') {
    params.set('offset', String(options.offset));
  }

  const query = params.toString();
  return query ? `${PROJECTS_RESOURCE_URI}?${query}` : PROJECTS_RESOURCE_URI;
}

function sortProjects(
  projects: UnleashProjectSummary[],
  order: 'asc' | 'desc'
): UnleashProjectSummary[] {
  const direction = order === 'asc' ? 1 : -1;

  return [...projects].sort((a, b) => {
    const dateA = a.createdAt ? Date.parse(a.createdAt) : Number.NaN;
    const dateB = b.createdAt ? Date.parse(b.createdAt) : Number.NaN;

    const hasDateA = Number.isFinite(dateA);
    const hasDateB = Number.isFinite(dateB);

    if (hasDateA && !hasDateB) {
      return -1;
    }

    if (!hasDateA && hasDateB) {
      return 1;
    }

    if (hasDateA && hasDateB) {
      if (dateA === dateB) {
        return a.name.localeCompare(b.name) * direction;
      }
      return (dateA - dateB) * direction;
    }

    return a.name.localeCompare(b.name) * direction;
  });
}

function sortFeatureFlags(
  flags: FeatureFlagSummary[],
  order: 'asc' | 'desc'
): FeatureFlagSummary[] {
  const direction = order === 'asc' ? 1 : -1;

  return [...flags].sort((a, b) => {
    const nameA = a.name ?? '';
    const nameB = b.name ?? '';

    if (nameA === nameB) {
      const dateA = a.createdAt ? Date.parse(a.createdAt) : Number.NaN;
      const dateB = b.createdAt ? Date.parse(b.createdAt) : Number.NaN;

      if (Number.isFinite(dateA) && Number.isFinite(dateB)) {
        return (dateA - dateB) * direction;
      }

      return 0;
    }

    return nameA.localeCompare(nameB) * direction;
  });
}

function applyPagination<T>(
  items: T[],
  limit?: number,
  offset?: number
): { slice: T[]; nextOffset?: number } {
  const safeLimit = typeof limit === 'number' && Number.isFinite(limit)
    ? Math.max(0, Math.floor(limit))
    : undefined;
  const safeOffset = typeof offset === 'number' && Number.isFinite(offset)
    ? Math.max(0, Math.floor(offset))
    : 0;

  const start = safeOffset;
  const end = safeLimit !== undefined ? start + safeLimit : undefined;

  const slice = items.slice(start, end);

  const nextOffset = safeLimit !== undefined && start + safeLimit < items.length
    ? start + safeLimit
    : undefined;

  return {
    slice,
    nextOffset,
  };
}

function parsePositiveInteger(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return undefined;
}

function parseNonNegativeInteger(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }

  return undefined;
}

function normalizeOrder(value: string | null): 'asc' | 'desc' | undefined {
  if (!value) {
    return undefined;
  }

  const lower = value.toLowerCase();
  if (lower === 'asc' || lower === 'desc') {
    return lower;
  }

  return undefined;
}

const PROJECTS_CACHE_TTL_MS = 60_000;
let cachedProjects: {
  data: UnleashProjectSummary[];
  fetchedAt: number;
} | null = null;

const FEATURE_FLAGS_CACHE_TTL_MS = 60_000;
const cachedFeatureFlags = new Map<
  string,
  {
    data: FeatureFlagSummary[];
    fetchedAt: number;
  }
>();

async function getCachedProjects(context: ServerContext): Promise<{
  projects: UnleashProjectSummary[];
  fetchedAt: number;
  fromCache: boolean;
}> {
  const now = Date.now();

  if (cachedProjects && now - cachedProjects.fetchedAt < PROJECTS_CACHE_TTL_MS) {
    return {
      projects: cachedProjects.data,
      fetchedAt: cachedProjects.fetchedAt,
      fromCache: true,
    };
  }

  const data = await context.unleashClient.listProjects();
  cachedProjects = {
    data,
    fetchedAt: now,
  };

  return {
    projects: data,
    fetchedAt: now,
    fromCache: false,
  };
}

async function getCachedFeatureFlags(
  context: ServerContext,
  projectId: string
): Promise<{
  flags: FeatureFlagSummary[];
  fetchedAt: number;
  fromCache: boolean;
}> {
  const now = Date.now();
  const cached = cachedFeatureFlags.get(projectId);

  if (cached && now - cached.fetchedAt < FEATURE_FLAGS_CACHE_TTL_MS) {
    return {
      flags: cached.data,
      fetchedAt: cached.fetchedAt,
      fromCache: true,
    };
  }

  const data = await context.unleashClient.listFeatureFlags(projectId);
  cachedFeatureFlags.set(projectId, {
    data,
    fetchedAt: now,
  });

  return {
    flags: data,
    fetchedAt: now,
    fromCache: false,
  };
}
