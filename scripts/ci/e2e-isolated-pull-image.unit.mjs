import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { setTimeout } from 'node:timers/promises';
import { isPullRateLimited as classifyPullRateLimit, pullPinnedImage, PULL_BUDGET_MS } from '../e2e-isolated/pull-image.mjs';
import { assertPinnedImages } from '../e2e-isolated/run.mjs';

const IMAGE = 'public.ecr.aws/supabase/postgrest:v14.5@sha256:b574528fe109c8343c1247155734d03df8c34b462f342dca0ccc20244fc36ef9';
const RATE = { status: 1, stdout: '', stderr: 'toomanyrequests: Rate exceeded\n' };
const OK = { status: 0, stdout: 'downloaded\n', stderr: '' };
const isPullRateLimited = result => classifyPullRateLimit(result, IMAGE);

for (const [name, result, expected] of [
  ['observed registry error', RATE, true],
  ['daemon prefix', { ...RATE, stderr: 'Error response from daemon: toomanyrequests: Rate exceeded' }, true],
  ['stdout channel', { ...RATE, stdout: RATE.stderr, stderr: '' }, true],
  ['bound header and CRLF', { ...RATE, stderr: 'v14.5: Pulling from supabase/postgrest\r\ntoomanyrequests: Rate exceeded  \r\n' }, true],
  ['unrecognized Docker retry output', { ...RATE, stdout: 'layer: Retrying in 1 second\n' }, false],
  ['successful process', { ...RATE, status: 0 }, false],
  ['error object', { ...RATE, error: new Error('controlled failure') }, false],
  ['signal', { ...RATE, signal: 'SIGTERM' }, false],
  ['timeout flag', { ...RATE, timeout: true }, false],
  ['timedOut flag', { ...RATE, timedOut: true }, false],
  ['null status', { ...RATE, status: null }, false],
  ['boolean status', { ...RATE, status: false }, false],
  ['string status', { ...RATE, status: '1' }, false],
  ['fractional status', { ...RATE, status: 1.5 }, false],
  ['negative status', { ...RATE, status: -1 }, false],
  ['oversized status', { ...RATE, status: 256 }, false],
  ['buffer channel', { ...RATE, stdout: Buffer.from('not decoded') }, false],
  ['object channel', { ...RATE, stderr: {} }, false],
  ['missing output', { status: 1 }, false],
  ['oversized output', { ...RATE, stdout: 'x'.repeat(65_536) }, false],
  ['quoted diagnostic', { ...RATE, stderr: 'documentation mentions toomanyrequests: Rate exceeded' }, false],
  ['unobserved HTTP429 format', { ...RATE, stderr: 'unexpected status: 429 Too Many Requests' }, false],
  ['unrelated 429', { ...RATE, stderr: 'downloading layer 429' }, false],
  ['nonterminal diagnostic', { ...RATE, stderr: RATE.stderr + 'unknown failure' }, false],
  ['unknown detail', { ...RATE, stderr: 'toomanyrequests: another registry policy' }, false],
]) test('pull rate-limit classification: ' + name, () => assert.equal(isPullRateLimited(result), expected));

for (const failure of ['unauthorized: authentication required', 'denied: permission', 'manifest unknown',
  'no matching manifest for linux/amd64', 'x509: unknown authority', 'certificate rejected',
  'TLS handshake failed', 'no space left on device', 'network is unreachable', 'no such host',
  'connection refused', 'invalid reference format', 'permission denied']) {
  for (const mixed of [false, true]) test('pull permanent error never retries: ' + failure + '/mixed=' + mixed, () => {
    assert.equal(isPullRateLimited({ ...RATE, stderr: failure + (mixed ? '\n' + RATE.stderr : '') }), false);
  });
}

for (const failure of ['context deadline exceeded', 'i/o timeout', 'Client.Timeout exceeded while awaiting headers',
  'context canceled', 'authentication required', 'manifest not found', 'request cancelled', 'operation timed out',
  'connection reset by peer', 'temporary failure in name resolution', 'no route to host',
  'requested access to the resource is denied', 'read: connection reset by peer', 'write: broken pipe',
  'unexpected EOF', 'disk quota exceeded', 'failed to register layer: read-only file system',
  'pull access denied for image, repository does not exist']) {
  for (const channel of ['stderr', 'stdout', 'split', 'daemon', 'case-crlf']) {
    test('pull contradictory Docker diagnostic never retries: ' + failure + '/' + channel, () => {
      const result = { ...RATE };
      if (channel === 'stderr') result.stderr = failure + '\n' + RATE.stderr;
      if (channel === 'stdout') { result.stdout = failure + '\n' + RATE.stderr; result.stderr = ''; }
      if (channel === 'split') result.stdout = failure + '\n';
      if (channel === 'daemon') result.stderr = failure + '\nError response from daemon: ' + RATE.stderr;
      if (channel === 'case-crlf') result.stderr = failure.toUpperCase() + '\r\n' + RATE.stderr.replace('\n', '\r\n');
      assert.equal(isPullRateLimited(result), false);
    });
  }
}

// Complete two-line public logs from artifacts 13767668449 and 13766269407;
// both native jobs returned this same diagnostic before application bootstrap.
const GOLDEN = 'public.ecr.aws/supabase/postgrest@sha256:b574528fe109c8343c1247155734d03df8c34b462f342dca0ccc20244fc36ef9: Pulling from supabase/postgrest\ntoomanyrequests: Rate exceeded';
for (const artifact of [13767668449, 13766269407]) {
  const [header, terminal] = GOLDEN.split('\n');
  for (const [channel, result] of [
    ['stderr', { status: 1, stderr: GOLDEN }],
    ['stdout', { status: 1, stdout: GOLDEN }],
    ['split', { status: 1, stdout: header, stderr: terminal }],
    ['reversed', { status: 1, stdout: terminal, stderr: header }],
    ['CRLF', { status: 1, stderr: GOLDEN.replaceAll('\n', '\r\n') }],
  ]) test('native pull golden: ' + artifact + '/' + channel, () => assert.equal(isPullRateLimited(result), true));
}
for (const state of ['Pulling fs layer', 'Waiting', 'Downloading', 'Extracting', 'Verifying Checksum',
  'Download complete', 'Pull complete', 'Already exists']) for (const length of [12, 64]) {
  test('closed Docker progress accepts ' + state + '/hex=' + length, () => {
    assert.equal(isPullRateLimited({ ...RATE, stdout: 'a'.repeat(length) + ': ' + state }), true);
  });
}
for (const state of ['Downloading', 'Extracting']) for (const size of ['0B/10B', '1.25kB/2MB', '1MB/1GB']) {
  test('closed Docker progress accepts numeric bytes: ' + state + '/' + size, () => {
    assert.equal(isPullRateLimited({ ...RATE, stdout: 'abcdef123456: ' + state + ' [===>     ] ' + size }), true);
  });
}
for (const line of ['arbitrary unknown line', 'layer: Waiting', 'abcdefgh1234: Waiting', 'abc123: Downloading',
  'A'.repeat(12) + ': Waiting', 'abcdef123456: Downloading context deadline exceeded',
  'abcdef123456: Downloading [error] 1MB/2MB', 'abcdef123456: Downloading [>=>] 1MB/2MB',
  'abcdef123456: Extracting [==> ] secret/2MB', 'abcdef123456: Waiting unauthorized',
  'v99: Pulling from supabase/postgrest', 'v14.5: Pulling from foreign/repository',
  'v14.5: Pulling from supabase/postgrest unknown', 'abcdef123456: Retrying in 1 second',
  'abcdef123456: Verifying checksum', 'abcdef123456: Pull complete extra', 'Pulling from supabase/postgrest']) {
  test('closed Docker progress rejects unknown or false progress: ' + line, () => {
    assert.equal(isPullRateLimited({ ...RATE, stdout: line }), false);
  });
}
for (const [name, result] of [
  ['not terminal', { ...RATE, stderr: RATE.stderr + 'abcdef123456: Waiting' }],
  ['duplicate same channel', { ...RATE, stderr: RATE.stderr.repeat(2) }],
  ['duplicate channels', { ...RATE, stdout: RATE.stderr }],
  ['wrong terminal casing', { ...RATE, stderr: RATE.stderr.toUpperCase() }],
  ['missing terminal', { status: 1, stdout: 'abcdef123456: Waiting' }],
  ['ANSI', { ...RATE, stdout: '\x1b[31mabcdef123456: Waiting' }],
  ['bare CR', { ...RATE, stdout: 'abcdef123456: Waiting\r' }],
  ['tab', { ...RATE, stdout: 'abcdef123456:\tWaiting' }],
  ['NUL', { ...RATE, stdout: '\0' }],
  ['Unicode', { ...RATE, stdout: '☃' }],
]) test('closed Docker output rejects ' + name, () => assert.equal(isPullRateLimited(result), false));

const LOCK = JSON.parse(readFileSync(new URL('../e2e-isolated/images.lock.json', import.meta.url), 'utf8'));
for (const [role, image] of Object.entries(assertPinnedImages(LOCK))) {
  const [, repository, tag, digest] = image.match(/^(.+):([^:]+)@sha256:([a-f0-9]{64})$/);
  const variants = [
    ['real pinned image', image, true],
    ['digest-only', repository + '@sha256:' + digest, false],
    ['registry port', image.replace(/^([^/]+)\//, '$1:5443/'), false],
    ['no tag or digest', repository, false],
    ['no digest', repository + ':' + tag, false],
    ['short SHA', image.slice(0, -1), false],
    ['invalid SHA hex', image.slice(0, -1) + 'z', false],
    ['uppercase SHA', repository + ':' + tag + '@sha256:' + digest.toUpperCase(), false],
    ['different syntactically valid SHA', repository + ':' + tag + '@sha256:' + 'a'.repeat(64), true],
    ['whitespace tag', repository + ':bad tag@sha256:' + digest, false],
  ];
  for (const [name, reference, accepted] of variants) for (const channel of ['terminal', 'stderr', 'split', 'reversed', 'CRLF']) {
    test('pull image admission matches validator: ' + role + '/' + name + '/' + channel, () => {
      const changed = structuredClone(LOCK); changed.images[role] = reference;
      if (accepted) assert.doesNotThrow(() => assertPinnedImages(changed));
      else assert.throws(() => assertPinnedImages(changed), /image-lock-review-required/);
      const split = reference.match(/^(.+):([^:]+)@sha256:([a-f0-9]{64})$/);
      const repo = split?.[1] ?? repository;
      const short = repo.split('/')[0].includes('.') ? repo.split('/').slice(1).join('/') : repo;
      const header = (split ? repo + '@sha256:' + split[3] : reference) + ': Pulling from ' + short;
      const terminal = RATE.stderr.trim();
      const result = channel === 'terminal' ? RATE : channel === 'stderr' ? { status: 1, stderr: header + '\n' + terminal }
        : channel === 'split' ? { status: 1, stdout: header, stderr: terminal }
          : channel === 'reversed' ? { status: 1, stdout: terminal, stderr: header }
            : { status: 1, stdout: header + '\r\n' + terminal };
      assert.equal(classifyPullRateLimit(result, reference), accepted);
    });
  }
  test('pull header is bound to requested digest: ' + role, () => {
    const short = repository.split('/')[0].includes('.') ? repository.split('/').slice(1).join('/') : repository;
    const result = { status: 1, stderr: repository + '@sha256:' + digest + ': Pulling from ' + short + '\n' + RATE.stderr };
    assert.equal(classifyPullRateLimit(result, repository + ':' + tag + '@sha256:' + 'a'.repeat(64)), false);
  });
}

function fixture(results, { extra = 0, afterCommand, afterSleep, yieldControl = async () => {} } = {}) {
  let time = 0;
  const calls = [], waits = [], observations = [];
  const options = { image: IMAGE, now: () => time, jitter: () => extra, yieldControl,
    command: (image, commandOptions) => {
      calls.push({ image, ...commandOptions });
      const entry = results[Math.min(calls.length - 1, results.length - 1)];
      time += entry.duration ?? 0;
      afterCommand?.(calls.length);
      return entry.result ?? entry;
    },
    onAttempt: (result, attempt) => observations.push({ result, attempt }),
    sleep: async (delay, signal) => { waits.push(delay); time += delay; await afterSleep?.(waits.length, signal); },
  };
  return { options, calls, waits, observations, advance: ms => { time += ms; } };
}

for (const failures of [0, 1, 2, 3]) test('pull succeeds after ' + failures + ' throttled attempts without changing digest', async () => {
  const f = fixture([...Array(failures).fill(RATE), OK]);
  assert.equal(await pullPinnedImage(f.options), OK);
  assert.equal(f.calls.length, failures + 1);
  assert.deepEqual(f.waits, [15_000, 30_000, 60_000].slice(0, failures));
  assert.deepEqual(f.calls.map(call => call.image), Array(failures + 1).fill(IMAGE));
  assert.deepEqual(f.calls.map(call => call.timeout), [900_000, 885_000, 855_000, 795_000].slice(0, failures + 1));
  assert.deepEqual(f.observations.map(x => x.attempt), Array.from({ length: failures + 1 }, (_, i) => i + 1));
});

test('persistent throttling stops at four attempts and at most 120s of waiting', async () => {
  const f = fixture([RATE], { extra: 5000 });
  assert.equal(await pullPinnedImage(f.options), RATE);
  assert.equal(f.calls.length, 4);
  assert.deepEqual(f.waits, [20_000, 35_000, 65_000]);
  assert.equal(f.waits.reduce((a, b) => a + b), 120_000);
  assert.equal(f.observations.length, 4);
});

for (const failure of [{ ...RATE, stderr: 'unauthorized: denied' }, { ...RATE, error: new Error('ETIMEDOUT') },
  { ...RATE, signal: 'SIGKILL' }, { ...RATE, timeout: true }]) test('a permanent/process failure after a retry stops immediately: ' + String(failure.stderr), async () => {
  const f = fixture([RATE, failure, OK]);
  assert.equal(await pullPinnedImage(f.options), failure);
  assert.equal(f.calls.length, 2); assert.equal(f.waits.length, 1);
});

for (const duration of [PULL_BUDGET_MS, PULL_BUDGET_MS + 1]) for (const result of [OK, RATE]) {
  test('post-command deadline fails closed: ' + duration + '/status=' + result.status, async () => {
    const f = fixture([{ result, duration }, OK]);
    const actual = await pullPinnedImage(f.options);
    assert.equal(actual.status, null); assert.match(actual.error.message, /pull-image-budget-exceeded/);
    assert.equal(f.calls.length, 1); assert.equal(f.waits.length, 0);
    assert.equal(f.observations[0].result, result, 'the actual attempt is still logged');
    assert.equal(result.status, result === OK ? 0 : 1, 'never mutate a subprocess result');
  });
}
test('success just before the deadline remains valid', async () => {
  const f = fixture([{ result: OK, duration: PULL_BUDGET_MS - 1 }]);
  assert.equal(await pullPinnedImage(f.options), OK);
});
for (const failures of [1, 3]) test('later success at the shared deadline never returns status zero: ' + failures, async () => {
  const delay = [15_000, 30_000, 60_000].slice(0, failures).reduce((a, b) => a + b);
  const f = fixture([...Array(failures).fill(RATE), { result: OK, duration: PULL_BUDGET_MS - delay }]);
  assert.notEqual((await pullPinnedImage(f.options)).status, 0);
  assert.equal(f.calls.length, failures + 1);
});
for (const duration of [885_000, 890_000]) test('insufficient remaining budget does not schedule a wait: ' + duration, async () => {
  const f = fixture([{ result: RATE, duration }, OK]);
  assert.equal(await pullPinnedImage(f.options), RATE);
  assert.equal(f.calls.length, 1); assert.equal(f.waits.length, 0);
});
test('late timer cannot start another attempt beyond the shared deadline', async () => {
  const f = fixture([RATE, OK], { afterSleep: () => f.advance(PULL_BUDGET_MS) });
  assert.notEqual((await pullPinnedImage(f.options)).status, 0);
  assert.equal(f.calls.length, 1);
});
for (const extra of [-1, 5001, NaN, '0']) test('invalid jitter fails closed: ' + String(extra), async () => {
  const f = fixture([RATE, OK], { extra });
  await assert.rejects(pullPinnedImage(f.options), /invalid-pull-jitter/);
  assert.equal(f.calls.length, 1); assert.equal(f.waits.length, 0);
});
for (const invalid of [NaN, Infinity, '0', -Infinity]) test('invalid monotonic clock fails before command: ' + String(invalid), async () => {
  const f = fixture([OK]);
  await assert.rejects(pullPinnedImage({ ...f.options, now: () => invalid }), /invalid-pull-clock/);
  assert.equal(f.calls.length, 0);
});
test('a backwards clock is rejected before another command', async () => {
  const f = fixture([RATE, OK], { afterSleep: () => f.advance(-20_000) });
  await assert.rejects(pullPinnedImage(f.options), /invalid-pull-clock/);
  assert.equal(f.calls.length, 1);
});

test('an already cancelled pull does not call Docker', async () => {
  const f = fixture([RATE]); const abort = new AbortController(); abort.abort();
  await assert.rejects(pullPinnedImage({ ...f.options, signal: abort.signal }), /run-cancelled/);
  assert.equal(f.calls.length, 0);
});
test('cancellation after a command logs its evidence and prevents success/retry', async () => {
  for (const result of [RATE, OK]) {
    const abort = new AbortController(), f = fixture([result], { afterCommand: () => abort.abort() });
    await assert.rejects(pullPinnedImage({ ...f.options, signal: abort.signal }), /run-cancelled/);
    assert.equal(f.calls.length, 1); assert.equal(f.observations.length, 1); assert.equal(f.waits.length, 0);
  }
});
test('the real retry timer aborts promptly without a second Docker command', { timeout: 5000 }, async () => {
  const abort = new AbortController(); let calls = 0;
  let entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  const pending = pullPinnedImage({ image: IMAGE, signal: abort.signal, command: () => { calls++; return RATE; },
    sleep: (delay, signal) => {
      const realTimer = setTimeout(delay, undefined, { signal }); entered(); return realTimer;
    },
  });
  const rejected = assert.rejects(pending, /run-cancelled/);
  await waiting;
  const start = performance.now();
  const cancellation = setTimeout(50).then(() => abort.abort());
  await rejected; await cancellation;
  assert.equal(calls, 1); assert.ok(performance.now() - start < 2000);
});
test('a real signal pending during spawnSync is handled before retrying', { timeout: 5000 }, async () => {
  const abort = new AbortController(); let calls = 0;
  const cancel = () => abort.abort(); process.once('SIGTERM', cancel);
  try {
    await assert.rejects(pullPinnedImage({ image: IMAGE, signal: abort.signal, command: () => {
      calls++;
      const sent = spawnSync(process.execPath, ['-e', 'process.kill(' + process.pid + ', "SIGTERM")']);
      assert.equal(sent.status, 0);
      return RATE;
    } }), /run-cancelled/);
    assert.equal(calls, 1);
  } finally { process.off('SIGTERM', cancel); }
});
