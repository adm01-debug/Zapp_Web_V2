#!/usr/bin/env node
// Guarda de honestidade da documentação do Talk X contra o código e as migrations do dia.
//
// A auditoria de 2026-09-29 (§6) mediu 40+ afirmações falsas em
// README/CHANGELOG/PARIDADE/ARQUITETURA/OPERACAO. O README foi reescrito e a ARQUITETURA e a
// PARIDADE ganharam banner de correções pendentes (a reescrita completa é a X197), mas a
// OPERACAO e o CHANGELOG seguiam afirmando o que o código contraria:
//   - OPERACAO §4 dizia que o `talkx-scheduler` "controla o ciclo de vida" das campanhas
//     (ele só inicia as agendadas vencidas e retoma as pausadas elegíveis) e que o
//     `talkx-link` é "Webhook" (é um GET que grava o clique e redireciona 302 + um POST que
//     registra a conversão autenticada por HMAC-SHA256);
//   - OPERACAO §6.1 declarava "4 testes" no `e2e/talkx.spec.ts` (a contagem é lida do próprio
//     spec a cada rodada, nunca fixada aqui) e §6.2 dizia que o
//     comando roda "os 3 specs do chromium-e2e-core (conversation, messaging e talkx)" — o
//     projeto casa 2 (conversation e messaging); o talkx roda nos projetos próprios
//     `chromium-talkx` / `firefox-talkx` / `webkit-talkx`;
//   - OPERACAO:4 dizia "fases F0–F1 concluídas" e o histórico §9 marcava a F1 como concluída,
//     mas a auditoria mediu as duas primeiras fases parciais (E04/E08/E09/E10 e E11–E20 em 🟡);
//   - o cabeçalho da OPERACAO declarava `talkx-v1.0.0` / 2026-09-27 com o próprio §9
//     registrando a `talkx-v1.1.0` de 2026-10-03;
//   - o CHANGELOG citava a migration `20260916220000_talkx_e93_settings.sql`, que não existe
//     (a real é `20260916230000_talkx_e93_settings.sql`).
//
// Estes testes travam o texto corrigido E as âncoras que o comprovam (código das edge
// functions, `e2e/talkx.spec.ts`, `playwright.config.ts` e `supabase/migrations/`): documento
// que volte a afirmar o que o código não faz fica vermelho.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ler = (rel) => fs.readFileSync(path.join(raiz, rel), 'utf8');

const OPERACAO = 'docs/talkx/OPERACAO.md';
const CHANGELOG = 'docs/talkx/CHANGELOG_TALKX.md';
const SPEC_TALKX = 'e2e/talkx.spec.ts';
const operacao = ler(OPERACAO);
const changelog = ler(CHANGELOG);

test('OPERACAO não diz que o talkx-scheduler controla o ciclo de vida das campanhas', () => {
  assert.doesNotMatch(operacao, /controla o ciclo de vida/iu, `${OPERACAO} volta a atribuir o ciclo de vida da campanha ao scheduler`);
  assert.match(operacao, /`talkx-scheduler`[^\n]*inicia[^\n]*retoma/iu, `${OPERACAO} não descreve o scheduler pelo que ele faz (inicia agendadas / retoma pausadas)`);

  // Âncora: a edge só busca campanhas `scheduled` vencidas e `paused` com timestamp.
  const scheduler = ler('supabase/functions/talkx-scheduler/index.ts');
  assert.match(scheduler, /\.eq\("status", "scheduled"\)/u, 'âncora mudou: o scheduler não busca mais campanhas agendadas');
  assert.match(scheduler, /\.eq\("status", "paused"\)/u, 'âncora mudou: o scheduler não busca mais campanhas pausadas');
});

test('OPERACAO descreve o talkx-link como GET (302) + POST (conversão), não como webhook', () => {
  assert.doesNotMatch(operacao, /talkx-link[^\n]*\|\s*Webhook/iu, `${OPERACAO} volta a classificar o talkx-link como Webhook`);
  assert.match(operacao, /`talkx-link`\s*\|\s*GET[^\n]*POST\s*\(convers/iu, `${OPERACAO} não descreve o talkx-link pelo par GET redirect + POST conversão`);
  assert.match(operacao, /redireciona \(302\)/u, `${OPERACAO} não registra que o GET do talkx-link redireciona com 302`);
  assert.match(operacao, /convers[ãa]o[^\n]*HMAC-SHA256/iu, `${OPERACAO} não registra que a conversão do talkx-link é autenticada por HMAC-SHA256`);

  // Âncora: o contrato está no docstring da própria edge.
  const link = ler('supabase/functions/talkx-link/index.ts');
  assert.match(
    link,
    /GET\s+\/talkx-link\?s=<slug>&r=<recipient_id>\s+→ registra clique, adiciona UTM e redireciona \(302\)/u,
    'âncora mudou: o talkx-link não é mais o GET que redireciona (302)',
  );
  assert.match(
    link,
    /POST \/talkx-link\s+→ registra conversão autenticada por HMAC-SHA256/u,
    'âncora mudou: o talkx-link não é mais o POST de conversão por HMAC',
  );
});

test('OPERACAO declara a cobertura real do e2e/talkx.spec.ts', () => {
  const spec = ler(SPEC_TALKX);
  const titulos = [...spec.matchAll(/^\s*test\('([^']+)'/gmu)].map((m) => m[1]);
  assert.ok(titulos.length > 0, `nenhum test() encontrado em ${SPEC_TALKX} — o alvo do teste mudou`);

  assert.match(
    operacao,
    new RegExp(`Cobertura atual \\(${titulos.length} testes\\)`),
    `${OPERACAO} não declara os ${titulos.length} testes reais de ${SPEC_TALKX}`,
  );
  for (const titulo of titulos) {
    assert.ok(
      operacao.includes(titulo),
      `${OPERACAO} não lista o teste "${titulo}" de ${SPEC_TALKX} — a lista de cobertura ficou para trás`,
    );
  }
});

test('OPERACAO não diz que o projeto chromium-e2e-core roda o talkx.spec.ts', () => {
  assert.doesNotMatch(operacao, /3 specs do `?chromium-e2e-core/u, `${OPERACAO} volta a somar o talkx.spec.ts à cobertura do chromium-e2e-core`);

  const config = ler('playwright.config.ts');
  const bloco = config.match(/name: 'chromium-e2e-core',\s*\n\s*testMatch: \[([^\]]*)\]/u);
  assert.ok(bloco, 'âncora mudou: projeto chromium-e2e-core não encontrado em playwright.config.ts');
  assert.doesNotMatch(bloco[1], /talkx/u, 'chromium-e2e-core passou a casar talkx.spec.ts — atualize a §6.2 da OPERACAO');
  const specs = [...bloco[1].matchAll(/([\w-]+)\\?\.spec\\?\.ts/gu)].map((m) => m[1]);
  assert.ok(specs.length > 0, 'testMatch do chromium-e2e-core ficou vazio');

  assert.match(
    operacao,
    new RegExp(`${specs.length} specs do \`?chromium-e2e-core`),
    `${OPERACAO} não declara os ${specs.length} specs reais do chromium-e2e-core (${specs.join(', ')})`,
  );
});

test('OPERACAO não afirma que as fases F0–F1 estão concluídas', () => {
  assert.doesNotMatch(operacao, /fases F0[–-]F1/iu, `${OPERACAO} volta a afirmar "fases F0–F1 concluídas"`);
  assert.doesNotMatch(
    operacao,
    /F1 \(design system E11[–-]E20\) concluíd/u,
    `${OPERACAO} volta a marcar a F1 como concluída no histórico de versões`,
  );
  assert.match(operacao, /AUDITORIA_PLANO_TALKX_2026-09-29\.md/u, `${OPERACAO} não aponta para a auditoria que mede o estado real das fases`);
});

test('cabeçalho da OPERACAO acompanha a última versão do histórico (§9)', () => {
  const cabecalho = operacao.match(/\*\*Atualizado:\*\*\s*(\d{4}-\d{2}-\d{2})\s*·\s*\*\*Versão:\*\*\s*`([^`]+)`/u);
  assert.ok(cabecalho, `${OPERACAO} sem cabeçalho "Atualizado · Versão" no formato esperado`);
  const [, dataCabecalho, versaoCabecalho] = cabecalho;

  const secao9 = operacao.match(/## 9\.[^\n]*\n([\s\S]*?)(?=\n## 10\.)/u);
  assert.ok(secao9, `${OPERACAO} não tem o §9 (histórico de versões) antes do §10`);
  const linhas = [...secao9[1].matchAll(/^\|\s*`([\w.-]+)`\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|/gmu)];
  assert.ok(linhas.length > 0, '§9 da OPERACAO sem linhas de versão');

  const [ultimaVersao, ultimaData] = linhas[linhas.length - 1].slice(1);
  assert.equal(
    versaoCabecalho,
    ultimaVersao,
    `cabeçalho declara \`${versaoCabecalho}\` e o §9 termina em \`${ultimaVersao}\``,
  );
  const dataMaisNova = linhas.map((l) => l[2]).sort().at(-1);
  assert.ok(
    dataCabecalho >= dataMaisNova,
    `cabeçalho diz "Atualizado ${dataCabecalho}", anterior à versão mais nova do §9 (${dataMaisNova})`,
  );
});

test('CHANGELOG cita a migration talkx_e93_settings pela versão que existe em supabase/migrations', () => {
  const citada = changelog.match(/`(20260916\d{6}_talkx_e93_settings\.sql)`/u);
  assert.ok(citada, `${CHANGELOG} não cita mais a migration talkx_e93_settings`);
  assert.ok(
    fs.existsSync(path.join(raiz, 'supabase', 'migrations', citada[1])),
    `${CHANGELOG} cita \`${citada[1]}\`, que não existe em supabase/migrations`,
  );
});

test('ARQUITETURA e PARIDADE mantêm o aviso de que são parciais (reescrita completa = X197)', () => {
  const arquitetura = ler('docs/talkx/ARQUITETURA.md');
  const paridade = ler('docs/talkx/PARIDADE.md');

  assert.match(arquitetura, /Correções pendentes/iu, 'ARQUITETURA.md perdeu o banner de correções pendentes');
  assert.match(paridade, /DESATUALIZADO/iu, 'PARIDADE.md perdeu o aviso de desatualizado');

  // Âncora: cada componente citado pelo banner precisa existir (ou não) exatamente como o
  // banner afirma — `TalkXCampaignPaused.tsx` (TL-075) já existe E está ligado em
  // `TalkXView.tsx` (X156/T13: rota `?screen=paused`, `openPaused`); os outros dois continuam
  // sem existir.
  for (const componente of ['TalkXSegmentBuilder.tsx', 'TalkXCampaignPaused.tsx', 'TalkXCampaignReport.tsx']) {
    assert.match(arquitetura, new RegExp(componente.replace(/\./gu, '\\.')), `ARQUITETURA.md não cita mais ${componente}`);
  }
  for (const componente of ['TalkXSegmentBuilder.tsx', 'TalkXCampaignReport.tsx']) {
    assert.ok(
      !fs.existsSync(path.join(raiz, 'src', 'components', 'talkx', componente)),
      `${componente} passou a existir — o banner da ARQUITETURA.md está desatualizado`,
    );
  }
  assert.ok(
    fs.existsSync(path.join(raiz, 'src', 'components', 'talkx', 'TalkXCampaignPaused.tsx')),
    'TalkXCampaignPaused.tsx deixou de existir — o banner da ARQUITETURA.md está desatualizado',
  );
  assert.match(
    arquitetura,
    /TalkXCampaignPaused\.tsx[^.]*passou a existir/u,
    'ARQUITETURA.md não registra que TalkXCampaignPaused.tsx já existe e está ligado (X156/T13)',
  );
  const talkXView = ler('src/components/talkx/TalkXView.tsx');
  assert.match(
    talkXView,
    /<TalkXCampaignPaused\b/u,
    'TalkXCampaignPaused.tsx deixou de ser usado em TalkXView.tsx — o banner da ARQUITETURA.md está desatualizado',
  );
});
