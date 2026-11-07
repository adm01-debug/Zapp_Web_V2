import assert from 'node:assert/strict';
import test from 'node:test';
import { FORCE_ONLINE_SCRIPT, installIsolatedOnlineState, isolatedOnlinePlugin } from '../e2e-isolated/force-online.mjs';
import { syntheticCredentials } from '../e2e-isolated/runtime-contract.mjs';
import { serviceConfiguration } from '../e2e-isolated/stack.mjs';

test('isolated online bootstrap forces the local gateway online and swallows native offline events', () => {
  const navigator = {};
  let listener;
  let capture;
  const window = {
    addEventListener(name, value, options) {
      assert.equal(name, 'offline');
      listener = value;
      capture = options;
    },
  };
  installIsolatedOnlineState(window, navigator);
  assert.equal(navigator.onLine, true);
  assert.equal(capture, true);
  let stopped = 0;
  listener({ stopImmediatePropagation: () => { stopped += 1; } });
  assert.equal(stopped, 1);
});

test('isolated Vite plugin injects the bootstrap only when explicitly enabled', () => {
  assert.equal(isolatedOnlinePlugin(false).transformIndexHtml, undefined);
  const transform = isolatedOnlinePlugin(true).transformIndexHtml;
  const tags = transform.handler();
  assert.deepEqual(tags, [{
    tag: 'script',
    children: FORCE_ONLINE_SCRIPT,
    injectTo: 'head-prepend',
  }]);
  assert.equal(transform.order, 'pre');
  assert.match(FORCE_ONLINE_SCRIPT, /window, navigator/);
});

test('isolated Vite service opts into the closed online bootstrap config', () => {
  const config = serviceConfiguration({
    credentials: syntheticCredentials(1_800_000_000_000),
    runId: 'zapp-e2e-force-online',
    sourceSha: 'a'.repeat(40),
    fullSuite: true,
  });
  assert.equal(config.vite.env.ZAPP_E2E_FORCE_ONLINE, '1');
  const at = config.vite.args.indexOf('--config');
  assert.notEqual(at, -1);
  assert.equal(config.vite.args[at + 1], 'scripts/e2e-isolated/vite.config.ts');
});
