import { z } from 'zod';

const query = z.object({
  flag: z.string().describe('Feature flag name, as a flags search returns it'),
  environment: z.string().describe('Environment name, one of those inspecting the project lists'),
  context: z.object({
    appName: z.string().default('unleash-mcp').describe('The application asking, as its SDK is set up with'),
  }).catchall(z.string()).prefault({}).describe('Context field name to value, the names a context fields search returns'),
});

export const evaluateInput = {
  queries: z.array(query).min(1).describe('Run together; one result per query, in the order asked'),
};

export type EvaluateInput = z.infer<z.ZodObject<typeof evaluateInput>>;
export type EvaluateQuery = z.infer<typeof query>;
