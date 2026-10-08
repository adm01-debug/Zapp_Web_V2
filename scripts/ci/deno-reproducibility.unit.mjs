import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8');
test('Edge contract CI pins its runtime and isolated frozen lock', () => {
  const workflow = read('../../.github/workflows/ci.yml');
  assert.match(workflow, /deno-version: '2\.9\.5'/);
  assert.match(workflow, /deno test --config scripts\/ci\/deno\.json --frozen --allow-env/);
  // E49: lista hardcoded substituída por glob; verificar o glob em vez do path literal
  assert.match(workflow, /supabase\/functions\/\*\*\/\*\.test\.ts/);
  const config = JSON.parse(read('./deno.json'));
  assert.deepEqual(config.lock, { path: './deno.lock', frozen: true });
  assert.equal(config.nodeModulesDir, 'none');
  const lock = JSON.parse(read('./deno.lock'));
  assert.equal(lock.version, '5');
  assert.ok(Object.keys(lock.remote ?? {}).length > 0);
  for (const digest of Object.values(lock.remote)) assert.match(digest, /^[a-f0-9]{64}$/);
  assert.match(read('../../.gitignore'), /^!scripts\/ci\/deno\.lock$/m);
});

// SL-026 (E70 da auditoria de GitHub Actions, 2026-10-01): o contrato das Edge
// Functions (Deno check + Deno tests) e o do egress-proxy (Go) saíram do job
// obrigatório `lint-and-typecheck` para o job `🦕 Edge contracts`.
//
// Por que isso virou teste: enquanto os comandos moravam no job required, TODA PR
// — inclusive as que não tocam `supabase/functions/**` nem
// `infrastructure/preview-egress-proxy/**` — pagava o setup de Deno e de Go antes
// de o `🔍 Lint & TypeCheck` (required check) responder. Reintroduzir um comando
// de Deno/Go no lint é uma edição de uma linha que nenhum gate perceberia; aqui
// ela fica presa.

/** Bloco de um job do `ci.yml`: do cabeçalho `  <id>:` até o próximo job. */
function blocoDoJob(yaml, id) {
  const linhas = yaml.split('\n');
  const inicio = linhas.findIndex((l) => l === `  ${id}:`);
  if (inicio === -1) return null;
  let fim = inicio + 1;
  // Cabeçalho de job = 2 espaços + identificador + ':'. Comentários (2 espaços +
  // '#') e chaves internas (4 espaços) não encerram o bloco.
  for (; fim < linhas.length; fim += 1) {
    if (/^ {2}[A-Za-z0-9_-]+:/.test(linhas[fim])) break;
  }
  // Comentário não executa: o bloco devolvido é só código (mesma regra do
  // scripts/ci/check-test-inventory.mjs). Sem isso, o comentário que DOCUMENTA a
  // separação faria o teste do lint acusar `deno check` de volta.
  return linhas
    .slice(inicio, fim)
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');
}

/** ids de todos os jobs do `ci.yml`. */
function jobsDoCi(yaml) {
  const secao = yaml.split(/^jobs:\s*$/m)[1] ?? '';
  return [...secao.matchAll(/^ {2}([A-Za-z0-9_-]+):\s*$/gm)].map((m) => m[1]);
}

test('E70: o contrato das Edge Functions roda em job próprio, fora do lint', () => {
  const workflow = read('../../.github/workflows/ci.yml');
  const edge = blocoDoJob(workflow, 'edge-contracts');
  assert.ok(edge, 'job `edge-contracts` sumiu do ci.yml: Deno/Go voltaram para o job de lint');
  assert.match(edge, /^ {4}name: 🦕 Edge contracts$/m, 'o job de Edge precisa se chamar 🦕 Edge contracts');
  assert.match(edge, /deno check --config scripts\/ci\/deno\.json --frozen/);
  assert.match(edge, /deno test --config scripts\/ci\/deno\.json --frozen/);
  assert.match(edge, /go test \.\/\.\.\./);
});

test('E70: o job obrigatório do lint não instala nem roda Deno/Go', () => {
  const workflow = read('../../.github/workflows/ci.yml');
  const lint = blocoDoJob(workflow, 'lint-and-typecheck');
  assert.ok(lint, 'job `lint-and-typecheck` sumiu do ci.yml');
  // O nome é preservado de propósito: é o context required `🔍 Lint & TypeCheck`
  // (conferido abaixo contra o baseline da branch protection). Renomear o job
  // faria os PRs ficarem presos num check que nunca reporta.
  assert.match(lint, /^ {4}name: 🔍 Lint & TypeCheck$/m);
  for (const comando of [/setup-deno/, /setup-go/, /deno check/, /deno test/, /go test \.\/\.\.\./]) {
    assert.doesNotMatch(lint, comando, `lint-and-typecheck ainda carrega ${comando}`);
  }
});

test('E70: `🔍 Lint & TypeCheck` continua sendo o context required', () => {
  const baseline = JSON.parse(read('./github-settings-baseline.json'));
  const required = baseline.branch_protection_main.required_status_checks;
  assert.ok(
    required.includes('🔍 Lint & TypeCheck'),
    'a branch protection exige `🔍 Lint & TypeCheck`; o job do ci.yml tem de manter esse nome',
  );
});

test('E70: nenhum job passa a depender do Edge contracts antes de E100', () => {
  // `needs: edge-contracts` tornaria o job bloqueante de fato, antes da janela de
  // 1 semana de observação (E100/SL-120 é quem adiciona o required check).
  const workflow = read('../../.github/workflows/ci.yml');
  const jobs = jobsDoCi(workflow);
  assert.ok(jobs.includes('edge-contracts'), `jobs lidos: ${jobs.join(', ')}`);
  for (const id of jobs) {
    if (id === 'edge-contracts') continue;
    assert.doesNotMatch(
      blocoDoJob(workflow, id),
      /needs:[^\n]*edge-contracts/,
      `o job \`${id}\` passou a depender de edge-contracts: ele deixa de ser opcional`,
    );
  }
});
