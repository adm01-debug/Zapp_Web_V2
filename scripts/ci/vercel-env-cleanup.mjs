#!/usr/bin/env node
/**
 * V043-V065 — Remove vars perigosas/mortas do Vercel.
 * Uso: VERCEL_TOKEN=... [DRY_RUN=1] node scripts/ci/vercel-env-cleanup.mjs
 * Disparado por .github/workflows/vercel-env-cleanup.yml
 * NUNCA imprime valores ou IDs — apenas keys, targets e status HTTP.
 */

import { pathToFileURL } from 'node:url';

export const PROJECT = 'prj_J4wb8egzz8iL1CJnSOXJDtqnbvRp';

// Lista de vars a remover — derivada de docs/audits/vercel-snapshot-2026-10-18-antes.json
// e de docs/plans/PLANO_VERCEL_190_ETAPAS_2026-10-18.execucao.md (V043-V065)
export const REMOVE = Object.freeze([
  // integracaoMorta — 17 vars da integração morta icfg_l6F3AhnOcvXqyj1eMSD7Jpxb (preview)
  'POSTGRES_URL', 'POSTGRES_PRISMA_URL', 'POSTGRES_URL_NO_SSL', 'POSTGRES_URL_NON_POOLING',
  'POSTGRES_USER', 'POSTGRES_HOST', 'POSTGRES_PASSWORD', 'POSTGRES_DATABASE',
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_JWT_SECRET',
  'SUPABASE_ANON_KEY', 'SUPABASE_SECRET_KEY',
  'NX_DAEMON', 'TURBO_TEAM', 'TURBO_REMOTE_ONLY', 'TURBO_TOKEN',
  // chavesServidor — 5 chaves de servidor sem serverless neste projeto
  'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GROQ_API_KEY',
  'EVOLUTION_API_KEY', 'EVOLUTION_API_URL',
  // VITE_* nunca lidas no front (confirmado por grep em src/)
  'VITE_APP_NAME', 'VITE_APP_ENV',
  'VITE_ENABLE_ANALYTICS', 'VITE_ENABLE_DEBUG',
  'VITE_ENABLE_GAMIFICATION', 'VITE_ENABLE_GMAIL_INTEGRATION',
  'VITE_SENTRY_DSN', 'VITE_SENTRY_ENVIRONMENT', 'VITE_LOG_LEVEL',
  // locais WSL — não devem existir no Vercel (CLAUDE.md seção 4)
  'VITE_ZAPP_LOCAL_SUPABASE_URL', 'VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY',
]);

function urlDaApi(path) {
  // O ID do projeto ja e global e suficiente para autorizar estas rotas.
  // Forcar teamId faz tokens validos para o projeto receberem 403/404.
  return new URL(path, 'https://api.vercel.com');
}

function targetsLegiveis(target) {
  if (!Array.isArray(target)) return '';
  return target.filter((item) => typeof item === 'string').join(',');
}

function alvoSeguro(env) {
  return env && typeof env === 'object'
    && typeof env.id === 'string' && env.id.length > 0
    && typeof env.key === 'string' && env.key.length > 0;
}

/** Executa o cleanup e devolve o exit code, sem encerrar o processo chamador. */
export async function executarCleanup({
  token,
  dryRun = true,
  fetchImpl = globalThis.fetch,
  output = console,
  project = PROJECT,
  remove = REMOVE,
} = {}) {
  if (!token) {
    output.error('VERCEL_TOKEN ausente');
    return 1;
  }
  if (typeof fetchImpl !== 'function') {
    output.error('fetch indisponível');
    return 1;
  }

  async function apiFetch(path, opts = {}) {
    let res;
    try {
      res = await fetchImpl(urlDaApi(path), {
        ...opts,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...opts.headers,
        },
      });
    } catch {
      return { status: 0, ok: false, networkError: true, body: null };
    }
    const text = await res.text();
    let body = null;
    if (text) {
      try { body = JSON.parse(text); } catch { body = null; }
    }
    return { status: res.status, ok: res.ok, networkError: false, body };
  }

  const envs = [];
  const cursores = new Set();
  let until = null;
  for (let pagina = 0; pagina < 100; pagina += 1) {
    const path = new URL(`/v10/projects/${encodeURIComponent(project)}/env`, 'https://api.vercel.com');
    if (until) path.searchParams.set('until', until);
    const { status, ok, networkError, body } = await apiFetch(`${path.pathname}${path.search}`);
    if (!ok) {
      if (status === 403) {
        output.warn(`\n⚠️  SKIP: VERCEL_READONLY_TOKEN sem acesso ao projeto ${project} (403).`);
        output.warn('   Atualize o secret VERCEL_READONLY_TOKEN com um token com acesso ao projeto zapp_web_v2.');
        output.warn('   (Vercel Dashboard → Account Settings → Tokens → criar com escopo do projeto).');
        return 0;
      }
      output.error(networkError ? 'GET envs falhou: erro de rede' : `GET envs falhou: ${status}`);
      return 1;
    }
    if (!body || !Array.isArray(body.envs)) {
      output.error('GET envs falhou: resposta inválida');
      return 1;
    }
    envs.push(...body.envs);
    const next = body.pagination?.next;
    if (next == null || next === '') break;
    if (typeof next !== 'string' && typeof next !== 'number') {
      output.error('GET envs falhou: cursor inválido');
      return 1;
    }
    until = String(next);
    if (cursores.has(until)) {
      output.error('GET envs falhou: cursor repetido');
      return 1;
    }
    cursores.add(until);
    if (pagina === 99) {
      output.error('GET envs falhou: limite de paginação excedido');
      return 1;
    }
  }

  const removeSet = new Set(remove);
  const idsVistos = new Set();
  const reconhecidos = envs.filter((env) => env && typeof env === 'object' && removeSet.has(env.key));
  if (reconhecidos.some((env) => !alvoSeguro(env))) {
    output.error('GET envs falhou: variável alvo sem identificador seguro');
    return 1;
  }
  const targets = envs.filter((env) => {
    if (!removeSet.has(env?.key) || idsVistos.has(env.id)) return false;
    idsVistos.add(env.id);
    return true;
  });

  if (targets.length === 0) {
    output.log('Nenhuma var encontrada para remover. Ambiente já limpo.');
    return 0;
  }

  output.log(`\n${dryRun ? '[DRY_RUN]' : '[APPLY]'} Vars a remover: ${targets.length}\n`);
  output.log('KEY'.padEnd(40) + 'TARGET');
  output.log('-'.repeat(70));
  for (const env of targets) output.log(env.key.padEnd(40) + targetsLegiveis(env.target));

  if (dryRun) {
    output.log('\nRodando em DRY_RUN — nada foi removido. Passe DRY_RUN=0 para aplicar.');
    return 0;
  }

  output.log('\nRemovendo...\n');
  let removed = 0;
  let errors = 0;
  for (const env of targets) {
    const { status, ok } = await apiFetch(
      `/v10/projects/${encodeURIComponent(project)}/env/${encodeURIComponent(env.id)}`,
      { method: 'DELETE' },
    );
    output.log(`${ok ? '✓' : '✗'} ${status}  ${env.key}  [${targetsLegiveis(env.target)}]`);
    if (ok) removed += 1;
    else errors += 1;
  }

  output.log(`\nConcluído: ${removed} removidas, ${errors} erros.`);
  return errors > 0 ? 1 : 0;
}

async function principal() {
  return executarCleanup({
    token: process.env.VERCEL_TOKEN,
    dryRun: process.env.DRY_RUN !== '0',
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await principal();
}
