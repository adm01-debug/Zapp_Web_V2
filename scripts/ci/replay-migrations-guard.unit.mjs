// Teste do gate do replay das migrations, que vive no JOB `replay-migrations` de
// `.github/workflows/db-guard.yml`. Le o YAML como texto (mesmo estilo dos outros
// `*-workflow.unit.mjs` do repo) para travar o que o job precisa cumprir:
//   * rodar o replay-local.sh DE VERDADE (nao uma copia inline);
//   * so gastar minutos quando o PR toca supabase/migrations/**;
//   * nao usar o docker-shim (que FINJE o docker e nao aplicaria nada);
//   * publicar log/TSV mesmo no vermelho, para o revisor ver a migration culpada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { findMutableActionRefs, findUnauthorizedActionOwners, loadAllowedOwnerRepos } from './check-workflow-pins.mjs';

const RAIZ = new URL('../../', import.meta.url);
const dbGuard = await readFile(new URL('.github/workflows/db-guard.yml', RAIZ), 'utf8');
const script = await readFile(new URL('scripts/db-audit/replay-local.sh', RAIZ), 'utf8');

// Bloco do job: de `  replay-migrations:` ate o proximo job de topo (ou o fim).
const inicio = dbGuard.indexOf('\n  replay-migrations:');
assert.ok(inicio >= 0, 'db-guard.yml nao tem o job `replay-migrations`');
const resto = dbGuard.slice(inicio + 1);
const offset = '  replay-migrations:'.length + 1;
const fim = resto.slice(offset).search(/\n  [a-z][a-z0-9_-]*:/u);
const job = fim >= 0 ? resto.slice(0, offset + fim + 1) : resto;

test('o job existe e tem teto de tempo declarado', () => {
  assert.match(job, /^  replay-migrations:\s*$/m);
  assert.match(job, /^\s{4}timeout-minutes:\s*\d+\s*$/m, 'o job precisa de timeout-minutes');
});

test('roda o script de verdade (nao uma copia inline)', () => {
  assert.match(job, /run:\s*bash scripts\/db-audit\/replay-local\.sh\s*$/m);
});

test('dispatch executa replay completo; detecção de diff continua protegida', () => {
  assert.match(dbGuard, /^  workflow_dispatch:/m);
  assert.doesNotMatch(dbGuard, /^  (?:push|pull_request|merge_group):/m);
  assert.match(job, /if \[ "\$\{\{ github.event_name \}\}" = "workflow_dispatch" \]; then\s+echo "mudou=true"/u);
  assert.match(job, /git diff --name-only[^\n]*supabase\/migrations/u, 'o gate olha o diff de supabase/migrations');
  assert.match(job, /id:\s*mudou\s*$/m, 'o passo precisa de id para os `if:` seguintes');
  assert.match(job, /echo "mudou=true" >> "\$GITHUB_OUTPUT"/u);
  const guardas = job.match(/if:\s*steps\.mudou\.outputs\.mudou == 'true'/gu) ?? [];
  assert.equal(guardas.length, 2, 'o pull da imagem e o replay sao as etapas caras; cada uma precisa do guard');
});

test('nao usa o docker-shim (ele FINJE o docker e nao aplica migration)', () => {
  const executavel = job.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');
  assert.doesNotMatch(executavel, /docker-shim/u);
  assert.doesNotMatch(executavel, /SKIP_DOCKER_SHIM/u);
});

test('a imagem fixada por digest vive num lugar SO (o script), nao no job', () => {
  assert.match(script, /public\.ecr\.aws\/supabase\/postgres:[0-9.]+@sha256:[0-9a-f]{64}/u);
  // O job so EXTRAI a imagem do script; nao carrega um digest proprio (senao os dois divergem).
  assert.doesNotMatch(job, /[0-9a-f]{64}/u, 'nao duplique o digest da imagem no workflow');
  assert.match(job, /grep -m1 -oE[^\n]*scripts\/db-audit\/replay-local\.sh/u);
});

test('log e TSV publicados mesmo no vermelho, com retencao declarada', () => {
  assert.match(job, /uses:\s*actions\/upload-artifact@[0-9a-f]{40}/u);
  assert.match(job, /if:\s*always\(\) && steps\.mudou\.outputs\.mudou == 'true'/u);
  assert.match(job, /name:\s*replay-migrations\s*$/m);
  assert.match(job, /^\s+retention-days:\s*\d+\s*$/m);
  assert.match(job, /replay-erros\.tsv/u);
});

test('checkout sem credencial persistida', () => {
  assert.match(job, /persist-credentials:\s*false\s*$/m);
});

test('Actions fixadas por SHA e de repositorio autorizado (check-workflow-pins)', () => {
  const permitidos = loadAllowedOwnerRepos(new URL('../../', import.meta.url).pathname);
  assert.deepEqual(findMutableActionRefs(dbGuard), [], 'nenhuma Action pode usar tag/branch');
  assert.deepEqual(findUnauthorizedActionOwners(dbGuard, 'db-guard.yml', permitidos), [], 'Action fora da allowlist');
});
