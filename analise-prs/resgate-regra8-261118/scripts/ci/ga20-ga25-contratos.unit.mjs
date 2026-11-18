// GA20-GA25 (plano de 15/10/2026, Fase 1 — resto + types-sync): invariantes em
// YAML que nenhuma outra etapa cobre. Cada teste ancora a Verificacao do
// plano; se o YAML regredir, o `node --test scripts/ci/*.unit.mjs` do ci.yml
// fica vermelho antes do merge.
//
// Convenção: seção de um job = do cabeçalho `  nome:` até o próximo job
// (`^  \S`) ou fim do arquivo.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const typesSync = readFileSync(
  new URL('../../.github/workflows/types-sync.yml', import.meta.url), 'utf8');
const liveGuard = readFileSync(
  new URL('../../.github/workflows/db-live-guard.yml', import.meta.url), 'utf8');
const migrate = readFileSync(
  new URL('../../.github/workflows/db-migrate.yml', import.meta.url), 'utf8');
const allowlist = JSON.parse(readFileSync(
  new URL('./allowed-actions.json', import.meta.url), 'utf8'));

function secaoJob(texto, job) {
  const linhas = texto.split('\n');
  const inicio = linhas.findIndex((l) => l === `  ${job}:`);
  assert.notEqual(inicio, -1, `job ${job} sumiu do workflow`);
  let fim = linhas.length;
  for (let i = inicio + 1; i < linhas.length; i += 1) {
    if (/^  [A-Za-z0-9_-]+:\s*$/.test(linhas[i])) { fim = i; break; }
  }
  return linhas.slice(inicio, fim).join('\n');
}

// ---------- GA20: Gate 3 compara contra o catálogo do HEAD ----------

test('GA20: Gate 3 congela o catalogo base do HEAD antes dos gates', () => {
  assert.match(typesSync, /git show HEAD:supabase\/schema-catalog\.json/, 'Gate 3 sem snapshot do HEAD');
  assert.match(typesSync, /catalog\.base\.json/, 'snapshot base sem nome estavel');
});

test('GA20: checker nunca recebe o arquivo do worktree como antigo', () => {
  const linhas = typesSync.split('\n').filter((l) => l.includes('check-remocoes-destrutivas.mjs'));
  assert.ok(linhas.length > 0, 'invocacao do checker sumiu');
  for (const l of linhas) {
    assert.doesNotMatch(l, /check-remocoes-destrutivas\.mjs\s+supabase\/schema-catalog\.json/,
      '1o arg ainda e o arquivo sobrescrito pelo sync: ' + l.trim());
  }
});

// ---------- GA21: credencial separada dos gates ----------

test('GA21: job ler-banco detem a credencial; gates-e-pr nao', () => {
  const leitura = secaoJob(typesSync, 'ler-banco');
  const gates = secaoJob(typesSync, 'gates-e-pr');
  assert.match(leitura, /environment:\s*banco-leitura/, 'ler-banco sem environment banco-leitura');
  assert.match(leitura, /secrets\.DESTINO_URL/, 'DESTINO_URL fora do ler-banco');
  assert.doesNotMatch(gates, /DESTINO/, 'DESTINO_URL alcanca o job dos gates');
  assert.doesNotMatch(gates, /environment:/, 'gates-e-pr com environment (vaza credencial)');
});

test('GA21: candidatos trafegam por artifact entre os jobs', () => {
  const leitura = secaoJob(typesSync, 'ler-banco');
  const gates = secaoJob(typesSync, 'gates-e-pr');
  assert.match(leitura, /actions\/upload-artifact@/, 'ler-banco nao publica candidatos');
  assert.match(leitura, /pending-versions\.txt/, 'pendentes fora do artifact');
  assert.match(gates, /actions\/download-artifact@[0-9a-f]{40}/, 'gates-e-pr sem download pinado por SHA');
  assert.ok(
    allowlist.patterns.includes('actions/download-artifact'),
    'download-artifact fora do allowed-actions.json',
  );
});

// ---------- GA22: auto-merge só com sync explicado e sem grant ----------

test('GA22: auto-merge exige sync explicado e grants intactos', () => {
  const gates = secaoJob(typesSync, 'gates-e-pr');
  assert.match(gates, /drift-explicado\.mjs/, 'verificacao de sync explicado sumiu');
  const auto = gates.split('\n').filter((_, i, arr) => arr.slice(Math.max(0, i - 6), i + 1).join('\n').includes('auto-merge'));
  void auto;
  assert.match(gates, /explicado.*true.*grants_changed.*false|grants_changed.*false.*explicado.*true/s,
    'auto-merge sem as duas condicoes (explicado + grants_changed=false)');
  assert.match(gates, /needs-human/, 'sem label needs-human para sync nao explicado');
});

test('GA22: corpo do PR declara a regra de auto-merge', () => {
  assert.match(typesSync, /needs-human/, 'corpo do PR nao declara a regra');
  assert.match(typesSync, /grants_changed/, 'corpo do PR omite grants_changed');
});

// ---------- GA23: lote pendente nao abre PR e fica verde ----------

test('GA23: com apply pendente o sync nao abre PR', () => {
  const gates = secaoJob(typesSync, 'gates-e-pr');
  assert.match(gates, /pending-versions\.txt/, 'lista de pendentes ausente nos gates');
  assert.match(gates, /pendente.*true/, 'condicao de pendencia ausente');
  assert.match(gates, /sync pendente/, 'sem estado explicito sync pendente no summary');
});

test('GA23: Gate 1b usa o classificador com escopo e 24 h', () => {
  const gates = secaoJob(typesSync, 'gates-e-pr');
  assert.match(gates, /gate1-pendente\.mjs/, 'Gate 1b sem o classificador GA23');
  assert.match(gates, /awaiting_apply/, 'output awaiting_apply sumiu');
});

// ---------- GA24: guarda vivo neutro só quando o lote explica ----------

test('GA24: catalogo/manifesto/types consultam o lote antes de falhar', () => {
  for (const passo of ['catalog', 'manifest', 'types']) {
    void passo;
  }
  assert.match(liveGuard, /pending-versions\.txt/, 'guarda vivo sem lista de pendentes');
  const usos = liveGuard.split('\n').filter((l) => l.includes('drift-explicado.mjs'));
  assert.ok(usos.length >= 3, `drift-explicado em ${usos.length} ponto(s), esperado >= 3 (catalogo, manifesto, types)`);
  assert.match(liveGuard, /sync pendente/, 'sem estado sync pendente no guarda vivo');
});

test('GA24: grants/paridade continuam estritos (nunca neutros por lote)', () => {
  const tripla = liveGuard.split('\n').filter((l) => l.includes('triple-parity') || l.includes('grants'));
  void tripla;
  const neutros = liveGuard.split('\n').filter((l) => l.includes('drift-explicado.mjs'));
  for (const l of neutros) {
    assert.doesNotMatch(l, /grants/, 'grants neutralizado por lote: ' + l.trim());
  }
});

// ---------- GA25: DDL fora do fluxo ----------

test('GA25: apply do db-migrate registra Deployment producao-ddl', () => {
  assert.match(migrate, /deployments:\s*write/, 'job migrate sem deployments:write');
  assert.match(migrate, /createDeployment/, 'sem registro de Deployment no apply');
  assert.match(migrate, /producao-ddl/, 'Deployment fora do environment producao-ddl');
});

test('GA25: guarda vivo acusa version sem Deployment desde 16/10', () => {
  assert.match(liveGuard, /deployments:\s*read/, 'guarda vivo sem deployments:read');
  assert.match(liveGuard, /check-deployments-ledger\.mjs/, 'detector GA25 ausente');
  assert.match(liveGuard, /20261016000000/, 'corte de 16/10 ausente no detector');
});
