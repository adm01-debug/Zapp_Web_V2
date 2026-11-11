import { randomInt } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setImmediate, setTimeout } from 'node:timers/promises';

export const PULL_BUDGET_MS = 15 * 60_000;
const DELAYS = [15_000, 30_000, 60_000];
const HEX = '(?:[a-f0-9]{12}|[a-f0-9]{64})';
const SIMPLE_PROGRESS = new RegExp('^' + HEX + ': (?:Pulling fs layer|Waiting|Downloading|Extracting|Verifying Checksum|Download complete|Pull complete|Already exists)$');
const SIZE = '[0-9]+(?:\\.[0-9]+)?(?:B|kB|MB|GB|TB)';
const BAR = '\\[(?=[=> ]{1,60}\\])={0,60}>? {0,60}\\]';
const BYTE_PROGRESS = new RegExp('^' + HEX + ': (?:Downloading|Extracting) ' + BAR + ' +' + SIZE + '/' + SIZE + '$');
const TERMINAL = 'toomanyrequests: Rate exceeded';

/** Retry only the registry failure observed in the native Docker pull. */
export function isPullRateLimited(result, image) {
  if (!Number.isInteger(result?.status) || result.status < 1 || result.status > 255 ||
      result.error || result.signal || result.timeout || result.timedOut) return false;
  // Match the existing assertPinnedImages contract, including its mandatory tag.
  const match = typeof image === 'string' && image.match(/^([a-z0-9./_-]+):([A-Za-z0-9_.-]+)@sha256:([a-f0-9]{64})$/);
  if (!match) return false;
  const [, repository, tag, digest] = match;
  const shortRepository = repository.split('/')[0].includes('.') ? repository.split('/').slice(1).join('/') : repository;
  const headers = new Set([tag, repository + '@sha256:' + digest, image].flatMap(prefix =>
    [repository, shortRepository].map(name => prefix + ': Pulling from ' + name)));
  const channels = [result.stdout, result.stderr];
  if (channels.some(value => value !== undefined && value !== null && typeof value !== 'string')) return false;
  if (channels.reduce((size, value) => size + (value?.length ?? 0), 0) > 65_536) return false;
  let terminals = 0;
  for (const channel of channels) {
    const text = (channel ?? '').replaceAll('\r\n', '\n');
    if (/[^\x20-\x7e\n]/.test(text)) return false;
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (line === TERMINAL || line === 'Error response from daemon: ' + TERMINAL) {
        if (index !== lines.length - 1 || ++terminals !== 1) return false;
      } else if (!headers.has(line) && !SIMPLE_PROGRESS.test(line) && !BYTE_PROGRESS.test(line)) return false;
    }
  }
  return terminals === 1;
}

/** One budget includes every attempt and wait; runtime/bootstrap never retry. */
export async function pullPinnedImage({ image, command, onAttempt, signal,
  now = () => performance.now(), sleep = (ms, abort) => setTimeout(ms, undefined, { signal: abort }),
  jitter = () => randomInt(5001), yieldControl = () => setImmediate(),
}) {
  let previous = -Infinity;
  const clock = () => {
    const value = now();
    if (!Number.isFinite(value) || value < previous) throw new Error('invalid-pull-clock');
    previous = value;
    return value;
  };
  const deadline = clock() + PULL_BUDGET_MS;
  if (!Number.isFinite(deadline) || deadline <= previous) throw new Error('invalid-pull-clock');
  const cancelled = () => { if (signal?.aborted) throw new Error('run-cancelled'); };
  const checkpoint = async () => {
    cancelled();
    // spawnSync defers signal handlers; yield to the event loop before deciding.
    await yieldControl();
    cancelled();
  };
  const exhausted = () => ({ status: null, signal: null, error: new Error('pull-image-budget-exceeded') });
  for (let attempt = 1; attempt <= 4; attempt++) {
    await checkpoint();
    const remaining = Math.floor(deadline - clock());
    if (remaining <= 0) return exhausted();
    const result = await command(image, { timeout: remaining });
    onAttempt?.(result, attempt);
    await checkpoint();
    if (clock() >= deadline) return exhausted();
    if (!isPullRateLimited(result, image) || attempt === 4) return result;
    const extra = jitter();
    if (!Number.isInteger(extra) || extra < 0 || extra > 5000) throw new Error('invalid-pull-jitter');
    const delay = DELAYS[attempt - 1] + extra;
    if (clock() + delay >= deadline) return result;
    try { await sleep(delay, signal); }
    catch (error) { cancelled(); throw error; }
  }
}
