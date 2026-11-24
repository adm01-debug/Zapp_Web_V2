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
// Mensagens terminais de cota observadas nos registries pinados. A variante
// 'Data limit exceeded' chegou pelo ECR publico no run 45326622310 (2026-11-24) e
// nao era reconhecida, o que anulava os retries e derrubava o shard authenticated-2-of-3.
const TERMINALS = [
  'toomanyrequests: Rate exceeded',
  'toomanyrequests: Data limit exceeded',
  'toomanyrequests: You have reached your unauthenticated pull rate limit. Sign in for a higher limit: https://www.docker.com/increase-rate-limit',
];
const TERMINAL_LINES = new Set(TERMINALS.flatMap(line => [line, 'Error response from daemon: ' + line]));

// Falhas transientes de rede do daemon, distintas de cota: o run 45380016893 perdeu o
// shard deslogado-principal com Client.Timeout no token do ghcr.io e o pull so retentava
// cota. Retentar nao troca o digest pinado, entao e seguro repetir a mesma referencia.
const NETWORK_REASONS = [
  'net/http: request canceled (Client.Timeout exceeded while awaiting headers)',
  'net/http: request canceled while waiting for connection (Client.Timeout exceeded while awaiting headers)',
  'net/http: TLS handshake timeout',
  'net/http: HTTP/1.x transport connection broken: unexpected EOF',
  'remote error: tls: handshake failure',
  'unexpected EOF',
  'i/o timeout',
  'connection reset by peer',
  'connection timed out',
];
const NETWORK_PREFIX = 'Error response from daemon: Get "https://';

/** So aceita o pedido HTTP ao registry abortado por motivo transiente de rede. */
function isNetworkTerminal(line) {
  return line.startsWith(NETWORK_PREFIX) && NETWORK_REASONS.some(reason => line.endsWith(reason));
}

/** Classifica a unica linha terminal do pull nativo: 'quota', 'network' ou null (sem retry). */
function classifyPullOutput(result, image) {
  if (!Number.isInteger(result?.status) || result.status < 1 || result.status > 255 ||
      result.error || result.signal || result.timeout || result.timedOut) return null;
  // Match the existing assertPinnedImages contract, including its mandatory tag.
  const match = typeof image === 'string' && image.match(/^([a-z0-9./_-]+):([A-Za-z0-9_.-]+)@sha256:([a-f0-9]{64})$/);
  if (!match) return null;
  const [, repository, tag, digest] = match;
  const shortRepository = repository.split('/')[0].includes('.') ? repository.split('/').slice(1).join('/') : repository;
  const headers = new Set([tag, repository + '@sha256:' + digest, image].flatMap(prefix =>
    [repository, shortRepository].map(name => prefix + ': Pulling from ' + name)));
  const channels = [result.stdout, result.stderr];
  if (channels.some(value => value !== undefined && value !== null && typeof value !== 'string')) return null;
  if (channels.reduce((size, value) => size + (value?.length ?? 0), 0) > 65_536) return null;
  let terminal = null;
  for (const channel of channels) {
    const text = (channel ?? '').replaceAll('\r\n', '\n');
    if (/[^\x20-\x7e\n]/.test(text)) return null;
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      const kind = TERMINAL_LINES.has(line) ? 'quota' : isNetworkTerminal(line) ? 'network' : null;
      if (kind !== null) {
        if (index !== lines.length - 1 || terminal !== null) return null;
        terminal = kind;
      } else if (!headers.has(line) && !SIMPLE_PROGRESS.test(line) && !BYTE_PROGRESS.test(line)) return null;
    }
  }
  return terminal;
}

/** Retry only the registry failure observed in the native Docker pull. */
export function isPullRateLimited(result, image) {
  return classifyPullOutput(result, image) === 'quota';
}

/** Falha transiente de rede do registry: retentar mantem o mesmo digest pinado. */
export function isTransientPullFailure(result, image) {
  return classifyPullOutput(result, image) === 'network';
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
    const retryable = isPullRateLimited(result, image) || isTransientPullFailure(result, image);
    if (!retryable || attempt === 4) return result;
    const extra = jitter();
    if (!Number.isInteger(extra) || extra < 0 || extra > 5000) throw new Error('invalid-pull-jitter');
    const delay = DELAYS[attempt - 1] + extra;
    if (clock() + delay >= deadline) return result;
    try { await sleep(delay, signal); }
    catch (error) { cancelled(); throw error; }
  }
}
