// GA13–GA17 + gancho GA25 (plano 2026-10-15): pins estruturais do db-migrate.yml.
// Cada teste cita a verificacao do plano: se o YAML regredir, o teste quebra
// antes do apply.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const raiz = new URL('../../', import.meta.url);
const ler = (p) => readFileSync(new URL(p, raiz), 'utf8');
const workflow = ler('.github/workflows/db-migrate.yml');

const blocoJob = (nome, fim) => {
  const ini = workflow.indexOf(`\n  ${nome}:\n`);
  assert.ok(ini > 0, `job ${nome} existe`);
  const corte = fim ? workflow.indexOf(`\n  ${fim}:\n`, ini + 1) : workflow.length;
  return workflow.slice(ini, corte === -1 ? workflow.length : corte);
};

test('GA13: dois jobs; dry-run (preflight) sem Waiting, apply com environment', () => {
  // Verificacao do plano: dry-run conclui sem `Waiting`. O plano diz "sem
  // environment"; o meio compativel com a W63 e `banco-leitura`, que nao tem
  // revisor nem wait timer (github-settings-baseline.json) — logo nao ha
  // Waiting — e declara o escopo do secret em vez de ler do nivel repo.
  const pre = blocoJob('preflight', 'apply');
  assert.match(pre, /environment:\s*banco-leitura/, 'preflight le em banco-leitura (sem revisor/wait)');
  const apply = blocoJob('apply', null);
  assert.match(apply, /environment:\s*producao-ddl/, 'apply exige o environment producao-ddl');
  assert.match(apply, /if:\s*\$\{\{\s*inputs\.apply\s*==\s*true\s*\}\}/, 'apply so roda quando apply=true');
  const envs = [...workflow.matchAll(/^ {4}environment:(.*)$/gm)].map((m) => m[1].trim());
  assert.deepEqual(envs, ['banco-leitura', 'producao-ddl'],
    'preflight le em banco-leitura (sem revisor/wait); o unico Waiting possivel e o do apply');
});

test('GA14: lote de verdade, sem bundles fixos, TOCTOU fechada', () => {
  // Verificacao: lote com 2 migrations aplica sem editar o YAML; migration que
  // entrou depois do dry-run recusa.
  assert.match(workflow, /apply_all_missing:/, 'input apply_all_missing existe');
  assert.doesNotMatch(workflow, /ATOMIC_DELIVERY_BUNDLE/, 'bundles fixos removidos');
  assert.doesNotMatch(workflow, /TALKX_RECOVERY_BUNDLE/, 'bundles fixos removidos');
  assert.match(workflow, /--apply-all --esperados/, 'dry-run validado pelo modo lote (avaliarPlanoDoDryRunApplyAll)');
  assert.match(workflow, /provar-lote\.sh/, 'preflight e apply provam o lote pelo mesmo script (runtime + hash)');
  const provar = ler('scripts/db-audit/provar-lote.sh');
  assert.match(provar, /compose-confirm-hash\.mjs/, 'hash do lote (lista + arquivos + commit)');
  assert.match(provar, /assert-runtime-proof\.mjs/, 'assercao de runtime por versao');
  assert.match(workflow, /Fechar janela TOCTOU/, 'apply recomputa o conjunto antes do push');
  assert.match(workflow, /mudou desde o dry-run/, 'divergencia pos-dry-run recusa');
});

test('GA15: apply dispara types-sync e o guarda vivo ao final', () => {
  // Verificacao: apply -> PR de sync em < 10 min -> guarda vivo verde no dia.
  const apply = blocoJob('apply', null);
  assert.match(apply, /actions:\s*write/, 'so o apply tem actions:write (disparo de workflows)');
  assert.match(apply, /gh workflow run types-sync\.yml --ref main/, 'dispara o types-sync');
  assert.match(apply, /gh workflow run db-live-guard\.yml --ref main/, 'dispara o guarda vivo');
  const disp = apply.indexOf('Disparar types-sync e guarda vivo');
  const reg = apply.indexOf('gancho GA25');
  assert.ok(disp > reg, 'o disparo e o ultimo passo do apply (so com sucesso)');
  assert.match(apply, /if:\s*success\(\)/, 'disparo condicionado ao sucesso do apply');
});

test('GA16: YAML < 500 linhas; validacoes vivem em scripts, nao inline', () => {
  // Verificacao: wc -l; contratos historicos continuam rodando.
  const linhas = workflow.split('\n').length;
  assert.ok(linhas < 500, `db-migrate.yml tem ${linhas} linhas (meta < 500)`);
  assert.match(workflow, /provar-lote\.sh/, 'assercao de runtime extraida (via provar-lote.sh)');
  assert.match(workflow, /contracts\/post-apply\.sh/, 'contratos historicos via dispatcher');
  const validacoes = [...workflow.matchAll(/^      - name: (Validar .+)$/gm)].map((m) => m[1]);
  assert.deepEqual(
    validacoes,
    ['Validar registro no ledger', 'Validar contratos historicos pos-apply'],
    'so as validacoes genericas ficam no YAML; as historicas vivem no dispatcher',
  );
  assert.doesNotMatch(workflow, /targetOk/, 'nenhum ramo de versao inline');
  const post = ler('scripts/db-audit/contracts/post-apply.sh');
  const funcoes = [...post.matchAll(/^validar_[a-z_]+\(\) \{/gm)];
  assert.equal(funcoes.length, 16, `dispatcher tem as 16 validacoes (achei ${funcoes.length})`);
});

test('GA17: portao destrutivo com confirmacao e registro', () => {
  // Verificacao: fixture com DROP TABLE sem confirmacao recusa.
  assert.match(workflow, /confirm_destructive:/, 'input confirm_destructive existe');
  assert.match(workflow, /list-destructive\.mjs/, 'portao usa o sql-lexer via list-destructive.mjs');
  assert.match(workflow, /--confirmar/, 'o preflight exige a confirmacao antes do dry-run');
  const gate = ler('scripts/db-audit/list-destructive.mjs');
  assert.match(gate, /confirm_destructive com:/, 'sem confirmacao o apply recusa');
  assert.match(workflow, /Portao destrutivo/, 'decisao registrada no Job Summary');
});

test('GA25 (gancho): apply registra o Deployment para o detector', () => {
  // GA14 antes de GA25: o detector (outro agente) consome este registro.
  assert.match(workflow, /GA25-DEPLOYMENT-RECORD/, 'marcador legivel por maquina no summary');
  assert.match(workflow, /applied_versions/, 'outputs do job expoem as versions aplicadas');
});
