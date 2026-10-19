/**
 * V043-V065 — Remove vars perigosas/mortas do Vercel.
 * Uso: VERCEL_TOKEN=... [DRY_RUN=1] node scripts/ci/vercel-env-cleanup.mjs
 * Disparado por .github/workflows/vercel-env-cleanup.yml
 * NUNCA imprime valores — apenas keys, targets e status HTTP.
 */

const PROJECT = 'prj_J4wb8egzz8iL1CJnSOXJDtqnbvRp';
const TEAM    = 'team_QyN41X0q8hrqhW80AwokbFLv';
const DRY_RUN = process.env.DRY_RUN !== '0';

const TOKEN = process.env.VERCEL_TOKEN;
if (!TOKEN) { console.error('VERCEL_TOKEN ausente'); process.exit(1); }

// Lista de vars a remover — derivada de docs/audits/vercel-snapshot-2026-10-18-antes.json
// e de docs/plans/PLANO_VERCEL_190_ETAPAS_2026-10-18.execucao.md (V043-V065)
const REMOVE = [
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
];

async function apiFetch(path, opts = {}) {
  const url = `https://api.vercel.com${path}${path.includes('?') ? '&' : '?'}teamId=${TEAM}`;
  const res = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...opts.headers },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, ok: res.ok, body };
}

// Busca todas as vars (com paginação)
async function fetchAllEnvs() {
  let envs = [];
  let until = null;
  do {
    const qs = until ? `?until=${until}` : '';
    const { status, ok, body } = await apiFetch(`/v10/projects/${PROJECT}/env${qs}`);
    if (!ok) { console.error(`GET envs falhou: ${status}`, JSON.stringify(body)); process.exit(1); }
    envs = envs.concat(body.envs ?? []);
    until = body.pagination?.next ?? null;
  } while (until);
  return envs;
}

const envs = await fetchAllEnvs();
const removeSet = new Set(REMOVE);
const targets = envs.filter(e => removeSet.has(e.key));

if (targets.length === 0) {
  console.log('Nenhuma var encontrada para remover. Ambiente já limpo.');
  process.exit(0);
}

console.log(`\n${DRY_RUN ? '[DRY_RUN]' : '[APPLY]'} Vars a remover: ${targets.length}\n`);
console.log('KEY'.padEnd(40) + 'TARGET'.padEnd(30) + 'ID');
console.log('-'.repeat(90));
for (const e of targets) {
  console.log(e.key.padEnd(40) + (e.target ?? []).join(',').padEnd(30) + e.id);
}

if (DRY_RUN) {
  console.log('\nRodando em DRY_RUN — nada foi removido. Passe DRY_RUN=0 para aplicar.');
  process.exit(0);
}

// APPLY
console.log('\nRemovendo...\n');
let removed = 0, errors = 0;
for (const e of targets) {
  const { status, ok } = await apiFetch(`/v10/projects/${PROJECT}/env/${e.id}`, { method: 'DELETE' });
  const icon = ok ? '✓' : '✗';
  console.log(`${icon} ${status}  ${e.key}  [${(e.target ?? []).join(',')}]`);
  if (ok) removed++; else errors++;
}

console.log(`\nConcluído: ${removed} removidas, ${errors} erros.`);
if (errors > 0) process.exit(1);
