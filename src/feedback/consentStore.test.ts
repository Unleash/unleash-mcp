import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CONSENT_VERSION, FileConsentStore, resolveConfigDir } from './consentStore.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unleash-mcp-consent-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('FileConsentStore', () => {
  it('yields no record when the file does not exist', () => {
    const store = new FileConsentStore(path.join(tmpDir, 'feedback_consent.json'));

    expect(store.read()).toEqual({ ok: true, record: null });
  });

  it('reports an error when the file cannot be read', () => {
    const location = path.join(tmpDir, 'feedback_consent.json');
    fs.mkdirSync(location);
    const store = new FileConsentStore(location);

    expect(store.read()).toMatchObject({
      ok: false,
      error: expect.stringContaining(`Could not read consent file ${location}`),
    });
  });

  it('reports an error for a file that is not JSON', () => {
    const location = path.join(tmpDir, 'feedback_consent.json');
    fs.writeFileSync(location, 'not json');
    const store = new FileConsentStore(location);

    expect(store.read()).toEqual({
      ok: false,
      error: `Consent file ${location} has unexpected contents`,
    });
  });

  it('reports an error for a record with a mismatched consent version', () => {
    const location = path.join(tmpDir, 'feedback_consent.json');
    fs.writeFileSync(
      location,
      JSON.stringify({
        consent: 'granted',
        decidedAt: '2026-09-21T10:00:00.000Z',
        consentVersion: CONSENT_VERSION + 1,
      }),
    );
    const store = new FileConsentStore(location);

    expect(store.read()).toMatchObject({ ok: false });
  });

  it('reports an error for a record with an unexpected feedback value', () => {
    const location = path.join(tmpDir, 'feedback_consent.json');
    fs.writeFileSync(
      location,
      JSON.stringify({
        consent: 'maybe',
        decidedAt: '2026-09-21T10:00:00.000Z',
        consentVersion: CONSENT_VERSION,
      }),
    );
    const store = new FileConsentStore(location);

    expect(store.read()).toMatchObject({ ok: false });
  });

  it('persists a granted decision and reads it back', () => {
    const location = path.join(tmpDir, 'feedback_consent.json');
    const store = new FileConsentStore(location);

    const written = store.write('granted');
    const result = store.read();

    expect(written).toEqual({ ok: true });
    expect(result).toMatchObject({
      ok: true,
      record: {
        consent: 'granted',
        consentVersion: CONSENT_VERSION,
        decidedAt: expect.any(String),
      },
    });
  });

  it('creates missing parent directories', () => {
    const location = path.join(tmpDir, 'a', 'b', 'c', 'feedback_consent.json');
    const store = new FileConsentStore(location);

    const written = store.write('granted');

    expect(written).toEqual({ ok: true });
    expect(store.read()).toMatchObject({ ok: true, record: { consent: 'granted' } });
  });

  it('overwrites an earlier decision with a later one', () => {
    const location = path.join(tmpDir, 'feedback_consent.json');
    const store = new FileConsentStore(location);

    store.write('granted');
    store.write('denied');

    expect(store.read()).toMatchObject({ ok: true, record: { consent: 'denied' } });
  });

  it('leaves no state behind when the write fails', () => {
    const blocker = path.join(tmpDir, 'blocker');
    fs.writeFileSync(blocker, 'not a directory'); // creates a file
    const location = path.join(blocker, 'nested', 'feedback_consent.json'); // blocker is a file, path is invalid
    const store = new FileConsentStore(location);

    const written = store.write('granted');

    expect(written).toMatchObject({
      ok: false,
      error: expect.stringContaining(`Could not save feedback consent to ${location}`),
    });
    expect(fs.existsSync(location)).toBe(false);
    const tmpFiles = fs.readdirSync(tmpDir).filter((entry) => entry.endsWith('.tmp'));
    expect(tmpFiles).toEqual([]);
  });
});

describe('resolveConfigDir', () => {
  const home = os.homedir();

  it.each<{
    name: string;
    env: NodeJS.ProcessEnv;
    platform: NodeJS.Platform;
    expected: string;
  }>([
    {
      name: 'honours XDG_CONFIG_HOME on darwin',
      env: { XDG_CONFIG_HOME: '/tmp/xdg-config' },
      platform: 'darwin',
      expected: path.join('/tmp/xdg-config', 'unleash-mcp'),
    },
    {
      name: 'honours XDG_CONFIG_HOME on linux',
      env: { XDG_CONFIG_HOME: '/tmp/xdg-config' },
      platform: 'linux',
      expected: path.join('/tmp/xdg-config', 'unleash-mcp'),
    },
    {
      name: 'honours XDG_CONFIG_HOME on win32',
      env: { XDG_CONFIG_HOME: '/tmp/xdg-config' },
      platform: 'win32',
      expected: path.join('/tmp/xdg-config', 'unleash-mcp'),
    },
    {
      name: 'falls back to Application Support on darwin',
      env: {},
      platform: 'darwin',
      expected: path.join(home, 'Library', 'Application Support', 'unleash-mcp'),
    },
    {
      name: 'falls back to APPDATA on win32 when set',
      env: { APPDATA: '/custom/appdata' },
      platform: 'win32',
      expected: path.join('/custom/appdata', 'unleash-mcp'),
    },
    {
      name: 'falls back to AppData/Roaming on win32 without APPDATA',
      env: {},
      platform: 'win32',
      expected: path.join(home, 'AppData', 'Roaming', 'unleash-mcp'),
    },
    {
      name: 'falls back to .config on linux',
      env: {},
      platform: 'linux',
      expected: path.join(home, '.config', 'unleash-mcp'),
    },
  ])('$name', ({ env, platform, expected }) => {
    expect(resolveConfigDir(env, platform)).toBe(expected);
  });
});
