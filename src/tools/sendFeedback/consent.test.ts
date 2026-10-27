import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type AskUser, createConsent } from './consent.ts';
import type { ConsentStore, Decision } from './consentStore.ts';

// In memory, so a test reads back what was stored.
const createMemoryStore = (stored?: Decision): ConsentStore & { stored?: Decision } => {
  const store: ConsentStore & { stored?: Decision } = {
    stored,
    location: '/config/unleash-mcp/feedback_consent.json',
    read: async () => store.stored,
    write: async (decision) => {
      store.stored = decision;
    },
  };
  return store;
};

// Answers every question the same way and keeps the questions asked.
const answering = (answer: Decision | undefined): AskUser & { questions: string[] } => {
  const questions: string[] = [];
  return Object.assign(async (question: string) => {
    questions.push(question);
    return answer;
  }, { questions });
};

const name = 'claude-code';

test('asks the user once and stores the answer for the next session', async () => {
  const store = createMemoryStore();
  const consent = createConsent(store);
  const ask = answering('granted');

  const decisions = await Promise.all([consent({ name, ask }), consent({ name, ask })]);

  assert.deepEqual(decisions, ['granted', 'granted']);
  assert.equal(ask.questions.length, 1);
  assert.match(ask.questions[0] ?? '', /stored in \/config\/unleash-mcp\/feedback_consent\.json/);
  assert.equal(store.stored, 'granted');
});

test('stores a refusal too, so the user is not asked again', async () => {
  const store = createMemoryStore();

  const decision = await createConsent(store)({ name, ask: answering('denied') });

  assert.equal(decision, 'denied');
  assert.equal(store.stored, 'denied');
});

test('takes the stored decision without asking', async () => {
  const ask = answering('denied');

  const decision = await createConsent(createMemoryStore('granted'))({ name, ask });

  assert.equal(decision, 'granted');
  assert.deepEqual(ask.questions, []);
});

test('denies for this session only when the user leaves the question unanswered', async () => {
  const store = createMemoryStore();
  const consent = createConsent(store);
  const ask = answering(undefined);

  const decisions = [await consent({ name, ask }), await consent({ name, ask })];

  assert.deepEqual(decisions, ['denied', 'denied']);
  assert.equal(ask.questions.length, 1);
  assert.equal(store.stored, undefined);
});

test('denies for this session only when the question cannot be asked', async () => {
  const store = createMemoryStore();

  const decision = await createConsent(store)({ name, ask: () => Promise.reject(new Error('Request timed out')) });

  assert.equal(decision, 'denied');
  assert.equal(store.stored, undefined);
});

test('denies, ignoring a stored grant, in clients that never show the user the question', async () => {
  const ask = answering('granted');

  const decisions = await Promise.all(['opencode', 'Gemini CLI', 'antigravity', 'cli', undefined].map((name) => createConsent(createMemoryStore('granted'))({ name, ask })));

  assert.deepEqual(decisions, ['denied', 'denied', 'denied', 'denied', 'denied']);
  assert.deepEqual(ask.questions, []);
});
