import { z } from 'zod';
import { type Failed, failed } from '../shared/failed.ts';

const define = { action: z.literal('define'), project: z.string(), flag: z.string() };
const complete = { action: z.literal('complete'), project: z.string(), flag: z.string() };
const archive = { action: z.literal('archive'), project: z.string(), flag: z.string() };

const changed = z.enum(['type', 'description', 'tags', 'links']);

const applied = z.discriminatedUnion('action', [
  z.object({
    kind: z.literal('applied'),
    ...define,
    status: z.enum(['new', 'existing']).describe('new: the flag was created; existing: it was there already'),
    changed: z.array(changed).describe('What was written after the flag was read or created; empty when an existing flag already matched'),
  }),
  z.object({ kind: z.literal('applied'), ...complete }),
  z.object({ kind: z.literal('applied'), ...archive }),
]);

const error = failed.omit({ kind: true }).describe('What Unleash answered; the operation was not applied, or only in part where it takes several writes');

const failedOperation = z.discriminatedUnion('action', [
  z.object({ kind: z.literal('failed'), ...define, error }),
  z.object({ kind: z.literal('failed'), ...complete, error }),
  z.object({ kind: z.literal('failed'), ...archive, error }),
]);

const changeRequest = z.object({ id: z.number(), state: z.string() }).describe('The change request holding the operation, submitted for review');

// Only archiving waits for a change request where the project's changes need approval.
const pendingOperation = z.object({ kind: z.literal('pending_change_request'), ...archive, changeRequest });

const result = z.discriminatedUnion('kind', [applied, failedOperation, pendingOperation]);

export const flagLifecycleOutput = {
  results: z.array(result).describe('One per operation, in the order given, each naming the operation it answers'),
};

/** What the flag lifecycle tool answers. */
export type FlagLifecycleOutput = z.infer<z.ZodObject<typeof flagLifecycleOutput>>;
/** The answer to one operation: the operation it answers, and whether it was applied. */
export type FlagLifecycleResult = z.infer<typeof result>;
/** What define wrote. */
export type Changed = z.infer<typeof changed>;
/** What a step answers. Only define says whether the flag was new and what it wrote. The tool adds the operation it answers. */
export type Outcome = { kind: 'applied'; status?: 'new' | 'existing'; changed?: Changed[] } | Failed;
/** What a step answers when the operation waits for approval: the change request holding it. */
export type PendingChange = { kind: 'pending_change_request'; changeRequest: { id: number; state: string } };
