import fs from 'node:fs/promises';
import os from 'node:os';
import { createHash } from 'node:crypto';

const PROOF_PATH = '/run/zapp-e2e/proof.json';
const MAX_PROOF_AGE_MS = 60 * 60 * 1000;
const REQUIRED_CHECKS = ['network_isolated', 'cron_disabled', 'bootstrap_complete', 'seed_ready'];

export class IsolatedAuthError extends Error {
  constructor(code, message) {
    super(`[E2E setup/${code}] ${message}`);
    this.name = 'IsolatedAuthError';
    this.code = code;
  }
}

function requireEvidence(condition, code, message) {
  if (!condition) throw new IsolatedAuthError(code, message);
}

function localOrigin(raw) {
  requireEvidence(typeof raw === 'string' && raw.trim() === raw && raw.length > 0 &&
    !/[\u0000-\u0020]/.test(raw), 'ISOLATION_CONFIGURATION', 'Origem local ausente ou inválida.');
  let url;
  try { url = new URL(raw); } catch {
    throw new IsolatedAuthError('ISOLATION_CONFIGURATION', 'Origem local inválida.');
  }
  requireEvidence(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname) &&
    !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash,
  'ISOLATION_CONFIGURATION', 'O ambiente exige uma origem HTTP de loopback, sem credenciais ou caminho.');
  return url.origin;
}

function configuration(baseURL, env, now) {
  const origin = localOrigin(baseURL);
  requireEvidence(env.ZAPP_E2E_PROOF === PROOF_PATH,
    'ISOLATION_PROOF', 'Inicie a suíte pelo controlador isolado; a prova de preparo está ausente.');
  requireEvidence(typeof env.ZAPP_E2E_RUN_ID === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(env.ZAPP_E2E_RUN_ID) &&
    typeof env.GITHUB_SHA === 'string' && /^[a-f0-9]{40}$/.test(env.GITHUB_SHA),
  'ISOLATION_PROOF', 'Identidade da execução ou SHA do checkout inválido.');
  const app = localOrigin(env.VITE_ZAPP_LOCAL_SUPABASE_URL);
  const fixture = localOrigin(env.E2E_SUPABASE_URL_OVERRIDE);
  requireEvidence(app === origin && fixture === origin,
    'ISOLATION_CONFIGURATION', 'Aplicação, fixtures e gateway devem usar a mesma origem local.');
  const key = env.VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY?.trim();
  requireEvidence(Boolean(key) && key === env.E2E_SUPABASE_PUBLISHABLE_KEY_OVERRIDE?.trim(),
    'ISOLATION_CONFIGURATION', 'Os dois pares de configuração local devem estar completos e usar a mesma chave anon.');
  let header, claims;
  try {
    const parts = key.split('.');
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error();
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new IsolatedAuthError('ISOLATION_CONFIGURATION', 'Use a chave anon sintética emitida pelo controlador.');
  }
  // A assinatura é comprovada pelo backend no preflight. Aqui recusamos, antes
  // de servir o app, uma chave privilegiada ou expirada colocada no par anon.
  requireEvidence(header?.alg === 'HS256' && claims?.role === 'anon' &&
    Number.isFinite(claims.exp) && claims.exp * 1000 > now,
  'ISOLATION_CONFIGURATION', 'A chave do frontend deve ser anon, local e ainda válida.');
  for (const name of Object.keys(env)) {
    if (/^(?:https?|all)_proxy$|^global_agent_https?_proxy$/i.test(name)) {
      requireEvidence(!env[name]?.trim(), 'ISOLATION_NETWORK', 'Proxy externo não é permitido no processo de teste.');
    }
  }
  requireEvidence(!['1', 'true'].includes(env.NODE_USE_ENV_PROXY) && !/--use-env-proxy(?:\s|$)/.test(env.NODE_OPTIONS ?? ''),
    'ISOLATION_NETWORK', 'O processo de teste não pode ativar proxy por ambiente.');
  return { origin, run_id: env.ZAPP_E2E_RUN_ID, source_sha: env.GITHUB_SHA,
    anon_key_sha256: createHash('sha256').update(key).digest('hex') };
}

/** Valida observações; não autentica e nunca devolve credenciais. */
export function validateIsolatedAuthEvidence({ baseURL, env, proof, networkNamespace, interfaces, now }) {
  const target = configuration(baseURL, env, now);
  requireEvidence(interfaces && Object.keys(interfaces).length === 1 && Array.isArray(interfaces.lo) &&
    interfaces.lo.length > 0 && interfaces.lo.every(item => item.internal === true &&
      ['127.0.0.1', '::1'].includes(item.address)),
  'ISOLATION_NETWORK', 'O driver deve executar no namespace sem saída, com somente loopback.');
  requireEvidence(typeof networkNamespace === 'string' && /^net:\[\d+\]$/.test(networkNamespace) &&
    proof?.network_namespace === networkNamespace,
  'ISOLATION_NETWORK', 'A prova não pertence ao namespace atual do driver.');
  requireEvidence(proof?.schema === 1 && proof.run_id === target.run_id &&
    proof.source_sha === target.source_sha && proof.origin === target.origin &&
    proof.anon_key_sha256 === target.anon_key_sha256,
  'ISOLATION_PROOF', 'A prova não corresponde à execução, checkout ou configuração local atual.');
  const date = value => typeof value === 'string' && /Z$/.test(value) ? Date.parse(value) : NaN;
  const created = date(proof.created_at), expires = date(proof.expires_at);
  requireEvidence(Number.isFinite(now) && Number.isFinite(created) && Number.isFinite(expires) &&
    created <= now && expires > now && expires > created && expires - created <= MAX_PROOF_AGE_MS,
  'ISOLATION_PROOF', 'A prova de preparo está vencida, no futuro ou tem duração inválida.');
  requireEvidence(REQUIRED_CHECKS.every(name => proof.checks?.[name] === true),
    'ISOLATION_PROOF', 'O preparo não confirmou isolamento, cron desligado, schema e fixtures.');
  return target;
}

export function validateBrowserEvidence(target, observation) {
  requireEvidence(observation?.identity?.run_id === target.run_id &&
    observation.identity.source_sha === target.source_sha && observation.identity.origin === target.origin &&
    observation.is_local === true && observation.effective_url === target.origin &&
    observation.local_url === target.origin && observation.anon_key_sha256 === target.anon_key_sha256,
  'ISOLATION_BROWSER', 'O gateway ou o resolver servido pelo Vite não corresponde ao backend isolado comprovado.');
}

/** Confere o processo e o Vite reais antes de auth.setup ler email/senha. */
export async function assertIsolatedAuthEnvironment({ page, baseURL }) {
  configuration(baseURL, process.env, Date.now());
  let proof, networkNamespace;
  try {
    const raw = await fs.readFile(PROOF_PATH, 'utf8');
    if (Buffer.byteLength(raw) > 8192) throw new Error();
    proof = JSON.parse(raw);
    networkNamespace = await fs.readlink('/proc/self/ns/net');
  } catch {
    throw new IsolatedAuthError('ISOLATION_PROOF', 'Não foi possível ler a prova do controlador e do namespace.');
  }
  const target = validateIsolatedAuthEvidence({ baseURL, env: process.env, proof,
    networkNamespace, interfaces: os.networkInterfaces(), now: Date.now() });
  let observation, timeout;
  try {
    const response = await page.goto(`${target.origin}/__e2e/preflight`, { timeout: 15_000 });
    if (!response?.ok() || page.url() !== `${target.origin}/__e2e/preflight`) throw new Error();
    observation = await Promise.race([
      page.evaluate(async () => {
        const identityResponse = await fetch('/__e2e/identity', { redirect: 'error', cache: 'no-store' });
        if (!identityResponse.ok) throw new Error('identity unavailable');
        const identity = await identityResponse.json();
        const config = await import('/src/config/supabase.ts');
        const key = config.LOCAL_SUPABASE?.anonKey;
        const digest = typeof key === 'string'
          ? await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)) : null;
        return { identity, is_local: config.IS_LOCAL_SUPABASE === true,
          effective_url: config.SUPABASE_URL, local_url: config.LOCAL_SUPABASE?.url ?? null,
          anon_key_sha256: digest ? Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('') : null };
      }),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error()), 10_000); }),
    ]);
  } catch {
    // Não anexar erro/cause do browser: ele pode conter URLs ou trechos de fonte.
    throw new IsolatedAuthError('ISOLATION_BROWSER', 'A prova do gateway e do resolver Vite não concluiu.');
  } finally {
    clearTimeout(timeout);
  }
  // Navegação e avaliação são assíncronas: a prova/chave pode ter vencido ou
  // o processo mudado enquanto o browser respondia. A admissão deve ser atual.
  try {
    networkNamespace = await fs.readlink('/proc/self/ns/net');
  } catch {
    throw new IsolatedAuthError('ISOLATION_NETWORK', 'Não foi possível reconfirmar o namespace antes do login.');
  }
  const current = validateIsolatedAuthEvidence({ baseURL, env: process.env, proof,
    networkNamespace, interfaces: os.networkInterfaces(), now: Date.now() });
  validateBrowserEvidence(current, observation);
}
