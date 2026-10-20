#!/usr/bin/env node
// Guarda de drift do mapa do Dashboard (docs/dashboard/README.md).
//
// O README do Dashboard nasceu como mapa "de onde cada número vem" e historicamente
// ficou para trás do código: apontava para um plano de 50 etapas que nunca existiu no
// repositório e reabria correções já concluídas (ranking por período, relatórios
// agendados owner-only, leitura de audit_logs). Isso induz a próxima sessão a refazer
// trabalho pronto ou a confundir linhagens de plano.
//
// Estes testes travam duas pontas ao mesmo tempo: (a) o texto do README e (b) as
// âncoras no código/migrations que o README afirma. Mudou o código? O teste vermelho
// obriga a atualizar o README na mesma PR.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const README_DASHBOARD = 'docs/dashboard/README.md';
const readme = fs.readFileSync(path.join(raiz, README_DASHBOARD), 'utf8');
const ler = (rel) => fs.readFileSync(path.join(raiz, rel), 'utf8');

// Índice de nomes de arquivo do repositório: o README cita vários arquivos só pelo
// basename (`useLeaderboard.ts`), sem caminho.
function indexarBasenames() {
  const nomes = new Set();
  const raizes = ['src', 'supabase', 'scripts', 'docs', 'e2e', 'tests', 'qa', '.github'];
  const pilha = raizes.map((r) => path.join(raiz, r)).filter((p) => fs.existsSync(p));
  while (pilha.length > 0) {
    const atual = pilha.pop();
    for (const entrada of fs.readdirSync(atual, { withFileTypes: true })) {
      if (entrada.isDirectory()) {
        if (!['node_modules', '.git', 'dist'].includes(entrada.name)) pilha.push(path.join(atual, entrada.name));
      } else {
        nomes.add(entrada.name);
      }
    }
  }
  return nomes;
}

const basenames = indexarBasenames();

test('README do dashboard não aponta para arquivo de código/doc que não existe', () => {
  const tokens = [...readme.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const referenciasDeArquivo = tokens.filter((t) => /^[\w./-]+\.(md|ts|tsx|sql|json)$/.test(t));
  assert.ok(referenciasDeArquivo.length > 0, 'nenhuma referência de arquivo encontrada no README — o teste perdeu o alvo');

  for (const token of referenciasDeArquivo) {
    if (token.includes('/')) {
      assert.ok(fs.existsSync(path.join(raiz, token)), `${README_DASHBOARD} cita \`${token}\`, que não existe`);
    } else {
      assert.ok(basenames.has(token), `${README_DASHBOARD} cita \`${token}\`, que não existe em nenhum diretório do repo`);
    }
  }
});

test('README do dashboard não reabre o plano de 50 etapas que nunca existiu', () => {
  // DASH-DOC-DRIFT-001: `claude/PLANO_DASHBOARD_50_ETAPAS.md` não está no HEAD nem no
  // histórico completo. A linhagem vigente do Dashboard é o documento externo de 100 etapas.
  assert.doesNotMatch(readme, /PLANO_DASHBOARD_50_ETAPAS/);
});

test('ranking do README acompanha a RPC por período (#809)', () => {
  assert.match(readme, /dashboard_leaderboard/);
  assert.doesNotMatch(readme, /sempre all-time/, 'README volta a descrever o ranking como all-time');
  const hook = ler('src/hooks/gamification/useLeaderboard.ts');
  assert.match(hook, /dashboard_leaderboard/, 'âncora no código mudou: useLeaderboard não usa mais a RPC');
  assert.match(hook, /p_period/);
});

test('relatórios agendados: README e migration dizem owner-only (E40)', () => {
  assert.doesNotMatch(readme, /não owner-only/i, 'README volta a descrever scheduled_report_configs como não owner-only');
  assert.match(readme, /owner-only/);
  const migration = 'supabase/migrations/20260926113806_scheduled_report_configs_owner_only.sql';
  assert.ok(fs.existsSync(path.join(raiz, migration)), `migration ${migration} não existe`);
  assert.match(ler(migration), /created_by/, 'migration owner-only perdeu o vínculo por created_by');
});

test('audit_logs: README não afirma que o dashboard parou de lê-lo direto', () => {
  // A RPC dashboard_sentiment_alerts é SECURITY DEFINER, mas useAIStats.ts continua
  // lendo audit_logs direto do client (action='sentiment_alert').
  assert.doesNotMatch(readme, /não mais\s+lido direto pelo dashboard/, 'README volta a negar a leitura direta de audit_logs');
  assert.match(readme, /useAIStats/);
  assert.match(ler('src/hooks/analytics/useAIStats.ts'), /\.from\('audit_logs'\)/, 'âncora no código mudou: useAIStats não lê mais audit_logs');
});

test('DemandPrediction: README não cita o rótulo removido "Previsão IA"', () => {
  assert.doesNotMatch(readme, /Previsão IA/);
  assert.doesNotMatch(ler('src/components/dashboard/DemandPrediction.tsx'), /Previsão IA/);
});
