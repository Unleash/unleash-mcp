import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readConfig } from './config.ts';

const required = { UNLEASH_BASE_URL: 'https://unleash.example.com', UNLEASH_PAT: 'user:token' };

test('has no feedback instance unless the user sets one', () => {
  assert.equal(readConfig(required).UNLEASH_FEEDBACK_URL, undefined);
  assert.equal(readConfig({ ...required, UNLEASH_FEEDBACK_URL: ' ' }).UNLEASH_FEEDBACK_URL, undefined);
});

test('sends feedback to the instance the user picks', () => {
  const config = readConfig({ ...required, UNLEASH_FEEDBACK_URL: 'https://sandbox.getunleash.io/enterprise' });

  assert.equal(config.UNLEASH_FEEDBACK_URL, 'https://sandbox.getunleash.io/enterprise');
});

test('refuses a feedback instance that is not an http(s) URL', () => {
  assert.throws(() => readConfig({ ...required, UNLEASH_FEEDBACK_URL: 'ftp://sandbox.getunleash.io' }));
});
