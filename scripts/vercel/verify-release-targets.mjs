#!/usr/bin/env node

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHA = /^[0-9a-f]{40}$/u;
const ASSET = /^assets\/[A-Za-z0-9._/-]+$/u;
const ARGUMENTOS = new Set(['target', 'expected-sha', 'attempts', 'interval-ms']);

export const TARGETS = Object.freeze({
  v2: Object.freeze({
    label: 'V2 · alias Vercel',
    url: 'https://zapp-web-v2.vercel.app',
    frame: 'DENY',
    robots: 'noindex, nofollow',
  }),
  v3: Object.freeze({
    label: 'V3 · domínio principal',
    url: 'https://zappweb.app.br',
    frame: 'SAMEORIGIN',
    robots: null,
  }),
});

function inteiro(name, value, { min, max }) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} deve ser inteiro entre ${min} e ${max}`);
  }
  return parsed;
}

export function parseArgs(argv) {
  const args = {};
  for (const item of argv) {
    const match = /^--([a-z-]+)=(.*)$/u.exec(item);
    if (!match) throw new Error(`argumento inválido: ${item}`);
    if (!ARGUMENTOS.has(match[1])) throw new Error(`argumento desconhecido: --${match[1]}`);
    if (Object.hasOwn(args, match[1])) throw new Error(`argumento repetido: --${match[1]}`);
    args[match[1]] = match[2];
  }
  const target = args.target;
  if (!Object.hasOwn(TARGETS, target)) throw new Error('--target deve ser v2 ou v3');
  const expectedSha = args['expected-sha'] || null;
  if (expectedSha && !SHA.test(expectedSha)) throw new Error('--expected-sha deve ser um SHA completo');
  if (target === 'v3' && expectedSha) throw new Error('--expected-sha pertence somente ao alvo v2');
  return {
    target,
    expectedSha,
    attempts: inteiro('--attempts', args.attempts ?? '1', { min: 1, max: 60 }),
    intervalMs: inteiro('--interval-ms', args['interval-ms'] ?? '0', { min: 0, max: 60_000 }),
  };
}

function assetSeguro(value, field) {
  if (typeof value !== 'string' || !ASSET.test(value) || value.includes('..')) {
    throw new Error(`${field} inválido`);
  }
  return value;
}

export function validarVersao(target, body, { expectedSha = null, now = Date.now() } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('version.json inválido');
  if (target === 'v2') {
    if (!SHA.test(body.buildId ?? '')) throw new Error('V2 buildId inválido');
    if (expectedSha && body.buildId !== expectedSha) {
      throw new Error(`V2 ainda em ${body.buildId.slice(0, 12)}; esperado ${expectedSha.slice(0, 12)}`);
    }
    return { release: body.buildId, entry: null, entryCss: null, builtAt: null };
  }
  if (target !== 'v3') throw new Error(`alvo desconhecido: ${target}`);
  if (!SHA.test(body.gitSha ?? '') || !SHA.test(body.releaseId ?? '')) {
    throw new Error('V3 gitSha/releaseId inválido');
  }
  if (body.gitSha !== body.releaseId) throw new Error('V3 gitSha e releaseId divergem');
  if (typeof body.builtAt !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/u.test(body.builtAt)) {
    throw new Error('V3 builtAt sem fuso válido');
  }
  const builtAt = Date.parse(body.builtAt);
  if (!Number.isFinite(builtAt) || builtAt > now + 5 * 60_000) throw new Error('V3 builtAt inválido ou futuro');
  return {
    release: body.releaseId,
    entry: assetSeguro(body.entry, 'V3 entry'),
    entryCss: assetSeguro(body.entryCss, 'V3 entryCss'),
    builtAt: body.builtAt,
  };
}

function exigirHeader(headers, name, expected) {
  const value = headers.get(name) ?? '';
  if (!value.toLowerCase().includes(expected.toLowerCase())) {
    throw new Error(`header ${name} inválido`);
  }
}

const REQUEST_TIMEOUT_MS = 15_000;

async function resposta(fetchImpl, url, kind, requestTimeoutMs, consume) {
  // AbortSignal.timeout() usa timer unref'd; usar AbortController+setTimeout (ref'd)
  // garante que o temporizador mantenha o event loop vivo até disparar.
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException('The operation timed out', 'TimeoutError')),
    requestTimeoutMs,
  );
  let res;
  try {
    res = await fetchImpl(url, {
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
      headers: { 'cache-control': 'no-cache', 'user-agent': 'zapp-release-targets/1' },
    });
    if (!res || res.status !== 200) throw new Error(`${kind} HTTP ${res?.status ?? 'sem resposta'}`);
    return await consume(res);
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timer);
    if (res?.body && !res.bodyUsed) {
      try { void res.body.cancel().catch(() => {}); } catch { /* preservar o resultado da request */ }
    }
  }
}

async function umaTentativa({ target, expectedSha, fetchImpl, now, requestTimeoutMs }) {
  const config = TARGETS[target];
  const nonce = `${now}-${Math.random().toString(16).slice(2)}`;
  const version = await resposta(fetchImpl, `${config.url}/version.json?verify=${nonce}`, 'version.json', requestTimeoutMs, async (versionRes) => {
    exigirHeader(versionRes.headers, 'content-type', 'application/json');
    exigirHeader(versionRes.headers, 'cache-control', 'no-store');
    exigirHeader(versionRes.headers, 'x-content-type-options', 'nosniff');
    exigirHeader(versionRes.headers, 'referrer-policy', 'strict-origin-when-cross-origin');
    exigirHeader(versionRes.headers, 'x-frame-options', config.frame);
    if (config.robots) exigirHeader(versionRes.headers, 'x-robots-tag', config.robots);

    let body;
    try { body = await versionRes.json(); } catch { throw new Error('version.json não é JSON válido'); }
    return validarVersao(target, body, { expectedSha, now });
  });

  const html = await resposta(fetchImpl, `${config.url}/?verify=${nonce}`, 'SPA', requestTimeoutMs, async (rootRes) => {
    exigirHeader(rootRes.headers, 'content-type', 'text/html');
    exigirHeader(rootRes.headers, 'cache-control', 'no-store');
    exigirHeader(rootRes.headers, 'x-content-type-options', 'nosniff');
    exigirHeader(rootRes.headers, 'referrer-policy', 'strict-origin-when-cross-origin');
    exigirHeader(rootRes.headers, 'x-frame-options', config.frame);
    if (config.robots) exigirHeader(rootRes.headers, 'x-robots-tag', config.robots);
    return rootRes.text();
  });

  let entry = version.entry;
  if (!entry) {
    const match = html.match(/\/assets\/[A-Za-z0-9._/-]+\.js/u);
    if (!match) throw new Error('SPA V2 sem entry JavaScript');
    entry = match[0].slice(1);
  }
  const assets = [entry, version.entryCss].filter(Boolean);
  for (const asset of assets) {
    await resposta(fetchImpl, `${config.url}/${asset}`, `asset ${asset}`, requestTimeoutMs, (assetRes) => {
      exigirHeader(assetRes.headers, 'cache-control', 'immutable');
    });
  }
  return { target, label: config.label, url: config.url, ...version, entry };
}

export async function verificarAlvo({
  target,
  expectedSha = null,
  attempts = 1,
  intervalMs = 0,
  fetchImpl = globalThis.fetch,
  sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  nowImpl = () => Date.now(),
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  if (!Object.hasOwn(TARGETS, target)) return { ok: false, target, error: 'alvo inválido' };
  let error = 'falha desconhecida';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await umaTentativa({ target, expectedSha, fetchImpl, now: nowImpl(), requestTimeoutMs });
      return { ok: true, attempt, ...result };
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'falha não identificada';
      if (attempt < attempts) await sleepImpl(intervalMs);
    }
  }
  return { ok: false, target, attempts, url: TARGETS[target].url, error };
}

export function resumoMarkdown(result) {
  const config = TARGETS[result.target];
  const lines = [`### ${config?.label ?? result.target}`, '', `- URL: ${result.url ?? config?.url ?? 'desconhecida'}`];
  if (result.ok) {
    lines.push(`- Release: \`${result.release}\``, `- Tentativa: ${result.attempt}`, '- Resultado: OK');
    if (result.builtAt) lines.push(`- Build V3: ${result.builtAt}`);
  } else {
    lines.push(`- Resultado: FALHOU — ${result.error}`);
  }
  return `${lines.join('\n')}\n`;
}

async function principal(argv = process.argv.slice(2), env = process.env) {
  let options;
  try { options = parseArgs(argv); } catch (error) {
    console.error(`release-targets: ${error.message}`);
    return 2;
  }
  const result = await verificarAlvo(options);
  const summary = resumoMarkdown(result);
  console.log(summary.trimEnd());
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  return result.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await principal();
}
