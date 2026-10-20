/** Read-only audit probes. Imports actual baseline TypeScript after stripping types.
 * No browser, network, database, provider or production fixture is used.
 * This is NOT a Vitest or hardware playback result.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attestProvenance, installNetworkBlock, sha256Of } from '../lib/source-provenance.mjs';

const root = process.env.RECONCILIATION_REPO || process.cwd();
// Um caminho de checkout não é permissão para executar outra fonte: o HEAD e o SHA-256
// dos dois módulos executados são atestados ANTES de ler ou importar qualquer coisa.
const pins = JSON.parse(readFileSync(new URL('./source-pins.json', import.meta.url), 'utf8'));
const provenance = attestProvenance({ root, pins });
// Bloqueio de rede instalado antes da carga do código: as tentativas são medidas, não declaradas.
const network = installNetworkBlock(globalThis);
const outDir = process.env.RECONCILIATION_OUTPUT || path.dirname(fileURLToPath(import.meta.url));
mkdirSync(outDir,{recursive:true});
const out = path.join(outDir,'volume_offline_results.json');
const paths = ['src/lib/mediaVolumeStore.ts', 'src/lib/mediaVolumeElement.ts'];
for (const p of paths) if (!(p in provenance.expected.source_sha256)) throw new Error(`Unattested module: ${p}`);
const originals = Object.fromEntries(paths.map(p => [p, readFileSync(`${root}/${p}`, 'utf8')]));
let seq = 0;
const asUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${++seq}`;
const strip = text => stripTypeScriptTypes(text, { mode: 'strip' });
const results = [];

class MemoryStorage {
  data = new Map();
  getItem(k) { return this.data.get(k) ?? null; }
  setItem(k, v) { this.data.set(k, String(v)); }
}
class FakeMedia extends EventTarget {
  _volume = 1;
  muted = false;
  readyState = 0;
  currentTime = 0;
  constructor(readonly = false) { super(); this.readonly = readonly; }
  get volume() { return this._volume; }
  set volume(v) { if (!this.readonly) this._volume = v; }
}
function install({ readonly = false, audioContext = false, blockedStorage = false, broadcast = false } = {}) {
  const calls = { contexts: 0, sources: 0, gains: 0, closes: 0, resumes: 0, disconnects: 0, broadcasts: 0 };
  const windowObject = new EventTarget();
  const storage = new MemoryStorage();
  if (blockedStorage) {
    storage.getItem = () => { throw new Error('storage denied'); };
    storage.setItem = () => { throw new Error('storage denied'); };
  }
  windowObject.localStorage = storage;
  globalThis.window = windowObject;
  globalThis.document = { createElement: () => new FakeMedia(readonly) };
  const channels = [];
  globalThis.BroadcastChannel = broadcast ? class {
    constructor(name) { this.name = name; channels.push(this); }
    postMessage(data) {
      calls.broadcasts++;
      for (const c of channels) if (c !== this && c.name === this.name) c.onmessage?.({ data });
    }
  } : undefined;
  const nodes = [];
  globalThis.AudioContext = audioContext ? class {
    state = 'suspended';
    destination = { audit: 'destination' };
    constructor() { calls.contexts++; }
    createMediaElementSource() { calls.sources++; return { connect() {} }; }
    createGain() {
      calls.gains++;
      const node = { gain: { value: 1 }, connect() {}, disconnect() { calls.disconnects++; } };
      nodes.push(node);
      return node;
    }
    resume() { calls.resumes++; this.state = 'running'; return Promise.resolve(); }
    close() { calls.closes++; this.state = 'closed'; return Promise.resolve(); }
  } : undefined;
  globalThis.webkitAudioContext = undefined;
  return { calls, storage, windowObject, nodes, media: () => new FakeMedia(readonly) };
}
const adaptations = new Map();
const recordAdaptation = (kind, module, code) => adaptations.set(module, { kind, module, executed_sha256: sha256Of(code) });
const STORE_ALIAS = "'@/lib/mediaVolumeStore'";
async function modules() {
  const storeCode = strip(originals[paths[0]]);
  recordAdaptation('type-strip', paths[0], storeCode);
  const storeUrl = asUrl(storeCode);
  const store = await import(storeUrl);
  const elementStripped = strip(originals[paths[1]]);
  // O hash registra o código que o harness executa, com a URL volátil normalizada:
  // a substituição em si fica declarada, o resto dos bytes é verificável.
  recordAdaptation('type-strip+alias-rewrite', paths[1], elementStripped.replace(STORE_ALIAS, '"<runtime-store-module-url>"'));
  const element = await import(asUrl(elementStripped.replace(STORE_ALIAS, JSON.stringify(storeUrl))));
  return { store, element };
}
async function run(id, purpose, body) {
  try {
    const observations = await body();
    results.push({ id, purpose, harness_result: 'PASS', ...observations });
  } catch (error) {
    results.push({ id, purpose, harness_result: 'FAIL', error: String(error?.stack ?? error) });
  }
}

await run('VOL-P01', 'Store: default, stable snapshots, persisted values, mute and reload', async () => {
  const env = install();
  const { store } = await modules();
  assert.deepEqual(store.getSnapshot(), { volume: 80, muted: false });
  const before = store.getSnapshot();
  store.setVolume(80);
  assert.equal(store.getSnapshot(), before);
  store.setVolume(35);
  store.setMuted(true);
  store.toggleMuted();
  assert.deepEqual(store.getSnapshot(), { volume: 35, muted: false });
  const reloaded = await modules();
  assert.deepEqual(reloaded.store.getSnapshot(), { volume: 35, muted: false });
  assert.equal(env.storage.getItem('zapp.media.volume'), '35');
  return { requirement_result: 'PASS', observed: { default: 80, persistedAfterReload: 35, volumeAfterUnmute: 35 } };
});

await run('VOL-P02', 'Store: invalid reads, blocked storage, clamped writes and quadratic gain', async () => {
  install({ blockedStorage: true });
  const { store } = await modules();
  assert.deepEqual(store.getSnapshot(), { volume: 80, muted: false });
  for (const input of [null, undefined, '', 'garbage', '-1', '101', '1.5', Number.NaN]) assert.equal(store.sanitizeStoredVolume(input), 80);
  store.setVolume(105); assert.equal(store.getSnapshot().volume, 100);
  store.setVolume(-5); assert.equal(store.getSnapshot().volume, 0);
  store.setVolume(34.7); assert.equal(store.getSnapshot().volume, 35);
  const gains = [0, 50, 100].map(n => store.toGain(n));
  assert.deepEqual(gains, [0, 0.25, 1]);
  return { requirement_result: 'PASS', observed: { blockedStorageFallback: 80, gains, clampedWrites: [100, 0, 35] } };
});

await run('VOL-P03', 'Store: two module instances broadcast state without echo', async () => {
  const env = install({ broadcast: true });
  const a = await modules();
  const b = await modules();
  let seenA = 0, seenB = 0;
  const ua = a.store.subscribe(() => seenA++);
  const ub = b.store.subscribe(() => seenB++);
  a.store.setVolume(65);
  a.store.setMuted(true);
  assert.deepEqual(b.store.getSnapshot(), { volume: 65, muted: true });
  assert.equal(env.calls.broadcasts, 2);
  assert.equal(seenA, 2); assert.equal(seenB, 2);
  ua(); ub();
  return { requirement_result: 'PASS', observed: { stateInSecondModule: b.store.getSnapshot(), broadcasts: 2, subscriberCalls: [seenA, seenB] }, limitation: 'Simulated BroadcastChannel; not two real browser tabs.' };
});

await run('VOL-P04', 'Store: storage-event fallback and unsubscribe', async () => {
  const env = install();
  const { store } = await modules();
  let calls = 0;
  const unsubscribe = store.subscribe(() => calls++);
  const event = Object.assign(new Event('storage'), { key: 'zapp.media.volume', newValue: '55' });
  env.windowObject.dispatchEvent(event);
  assert.equal(store.getSnapshot().volume, 55);
  assert.equal(calls, 1);
  unsubscribe();
  store.setVolume(60);
  assert.equal(calls, 1);
  return { requirement_result: 'PASS', observed: { externalVolume: 55, callbacksBeforeAndAfterUnsubscribe: 1 } };
});

await run('VOL-P05', 'Element: native apply, subscription, metadata reload and detached cleanup', async () => {
  const env = install({ audioContext: true });
  const { store, element } = await modules();
  const media = env.media();
  const detach = element.attachMediaVolume(media);
  assert.equal(media.volume, 0.8 ** 2);
  store.setVolume(50);
  assert.equal(media.volume, 0.25);
  media.volume = 1;
  media.dispatchEvent(new Event('loadedmetadata'));
  assert.equal(media.volume, 0.25);
  assert.equal(env.calls.contexts, 0);
  detach();
  store.setVolume(20);
  assert.equal(media.volume, 0.25);
  return { requirement_result: 'PASS', observed: { nativeGain: 0.25, contextsBeforePlay: 0, gainAfterDetach: media.volume } };
});

await run('VOL-P06', 'Element: native play creates a context that cleanup never closes', async () => {
  const env = install({ audioContext: true });
  const { element } = await modules();
  const media = env.media();
  const detach = element.attachMediaVolume(media);
  assert.equal(element.detectNativeVolumeSupport(), true);
  assert.equal(env.calls.contexts, 0);
  media.dispatchEvent(new Event('play'));
  const afterPlay = { ...env.calls };
  detach();
  assert.equal(env.calls.contexts, 1);
  assert.equal(env.calls.sources, 0);
  assert.equal(env.calls.gains, 0);
  assert.equal(env.calls.closes, 0);
  return {
    requirement_result: 'VALIDATED_FAIL', finding_id: 'VOL-01',
    expected: 'No context on the native-volume path; if one is created, release it after the last bound element detaches.',
    observed: { afterPlay, afterDetach: { ...env.calls } },
    limitation: 'Control flow and constructor/close calls proven on actual source with browser API doubles; no hardware audio, battery or browser-limit measurement.'
  };
});

await run('VOL-P07', 'Element: fallback nodes are reused and the context closes only after the last element', async () => {
  const env = install({ readonly: true, audioContext: true });
  const { store, element } = await modules();
  const a = env.media(), b = env.media();
  const detachA = element.attachMediaVolume(a);
  const detachB = element.attachMediaVolume(b);
  assert.equal(env.calls.contexts, 0);
  a.dispatchEvent(new Event('play'));
  b.dispatchEvent(new Event('play'));
  store.setVolume(50);
  assert.equal(env.calls.contexts, 1);
  assert.equal(env.calls.sources, 2);
  assert.deepEqual(env.nodes.map(n => n.gain.value), [0.25, 0.25]);
  detachA(); assert.equal(env.calls.closes, 0);
  detachB(); assert.equal(env.calls.closes, 1);
  return { requirement_result: 'PASS', observed: { calls: { ...env.calls }, nodeGains: [0.25, 0.25] }, limitation: 'Read-only volume simulated; not iOS playback.' };
});

await run('VOL-P08', 'Element: neither native volume nor AudioContext reports unavailable', async () => {
  install({ readonly: true });
  const { element } = await modules();
  assert.equal(element.isMediaVolumeControllable(), false);
  return { requirement_result: 'PASS', observed: { isMediaVolumeControllable: false } };
});

const report = {
  // O rótulo do baseline é o HEAD observado e atestado, nunca um literal fixo.
  baseline_commit: provenance.observed.head,
  baseline_sha_expected: provenance.expected.baseline_sha,
  provenance,
  executed_at: new Date().toISOString(), node_version: process.version,
  method: 'Actual TypeScript modules stripped in memory; import alias rewritten only to the actual store module. DOM, storage, BroadcastChannel and WebAudio are offline test doubles.',
  source_sha256: provenance.observed.source_sha256,
  harness_adaptation: [...adaptations.values()],
  production_changes: false, database_queries: 0,
  // Medição, não literal: o bloqueio de rede conta cada tentativa observada.
  network_requests: network.attempts.length,
  network_attempts: network.attempts,
  results,
  summary: { probes: results.length, harness_passed: results.filter(r => r.harness_result === 'PASS').length, requirement_passed: results.filter(r => r.requirement_result === 'PASS').length, requirement_failed: results.filter(r => r.requirement_result === 'VALIDATED_FAIL').length },
};
writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (results.some(r => r.harness_result === 'FAIL')) process.exitCode = 1;
