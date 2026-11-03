import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUnleashClient } from '../../unleash/client.ts';
import { changeRequestUrl, flagUrl, projectUrl } from './uiUrl.ts';

// A self-hosted Unleash can live under a path of its host, which a link built from the host alone would leave out.
const unleash = createUnleashClient({ baseUrl: 'https://unleash.example/enterprise/', headers: {}, fetch });

test('keeps the base path of the instance in every link', () => {
  assert.equal(projectUrl(unleash, 'pet-shop'), 'https://unleash.example/enterprise/projects/pet-shop');
  assert.equal(
    flagUrl(unleash, 'pet-shop', 'checkout'),
    'https://unleash.example/enterprise/projects/pet-shop/features/checkout',
  );
  assert.equal(
    changeRequestUrl(unleash, 'pet-shop', 7),
    'https://unleash.example/enterprise/projects/pet-shop/change-requests/7',
  );
});

test('escapes a flag name that would otherwise be read as a path', () => {
  assert.equal(
    flagUrl(unleash, 'pet-shop', 'checkout/v2'),
    'https://unleash.example/enterprise/projects/pet-shop/features/checkout%2Fv2',
  );
});
