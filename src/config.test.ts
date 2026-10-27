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

test('asks the user for feedback consent unless the environment grants or refuses it', () => {
  assert.equal(readConfig(required).UNLEASH_MCP_SEND_FEEDBACK, undefined);
  assert.equal(readConfig({ ...required, UNLEASH_MCP_SEND_FEEDBACK: '' }).UNLEASH_MCP_SEND_FEEDBACK, undefined);
  assert.equal(readConfig({ ...required, UNLEASH_MCP_SEND_FEEDBACK: 'true' }).UNLEASH_MCP_SEND_FEEDBACK, true);
  assert.equal(readConfig({ ...required, UNLEASH_MCP_SEND_FEEDBACK: 'false' }).UNLEASH_MCP_SEND_FEEDBACK, false);
});

test('keeps the consent in the platform config directory unless the user picks another', () => {
  assert.equal(readConfig({ ...required, UNLEASH_MCP_CONFIG_DIR: ' ' }).UNLEASH_MCP_CONFIG_DIR, undefined);
  assert.equal(readConfig({ ...required, UNLEASH_MCP_CONFIG_DIR: '/custom/config' }).UNLEASH_MCP_CONFIG_DIR, '/custom/config');
});
