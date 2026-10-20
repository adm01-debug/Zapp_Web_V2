#!/usr/bin/env node
// Guarda de drift dos docs de design citados no cartão SL-180 (§8d da
// `docs/audits/AUDITORIA_ENTREGAS_HERMES_2026-09-30.md`, seção "Achados fora do escopo").
//
// Dois defeitos de documentação, os dois cobrados na auditoria de 30/09:
//   1. `docs/design/PLANO_INBOX_360_CONVERSA.md` (23, 39, 139) e
//      `docs/design/PLANO_INBOX_FIDELIDADE_CARVAO.md` (75) citavam a ORDEM ANTIGA da barra
//      de abas do centro (a de 08/09: sem SalesView/Journey e com Arquivos por último). A
//      ordem contratada hoje é pinada pelo teste do próprio componente
//      (`src/components/inbox/chat/__tests__/ConversationTabs.test.tsx`); o doc citando a
//      ordem velha manda a próxima sessão desfazer a barra.
//   2. `docs/design/TAREFAS_QUADRO_STATUS.md` citava `text-[12px]` como a classe do
//      subcabeçalho de "Próximas" — o código usa `text-xs` (o guard-rail de tipografia
//      reprova arbitrário com equivalente exato). Quem "cumprisse a doc" reprovava no CI.
//
// Os dois invariantes são ancorados no CÓDIGO — a lista `TABS` de `ConversationTabs.tsx` e a
// classe real do subcabeçalho em `TasksListMode.tsx` —, e não no texto de hoje: renomear,
// reordenar ou retipografar o código deixa estes testes vermelhos até o doc acompanhar.
// Fixtures em string provam os dois lados de cada regra (ordem antiga sem marca de superação
// falha; ordem contratada passa).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ler = (rel) => fs.readFileSync(path.join(raiz, rel), 'utf8');

const COMPONENTE_ABAS = 'src/components/inbox/chat/ConversationTabs.tsx';
const TESTE_DO_COMPONENTE = 'src/components/inbox/chat/__tests__/ConversationTabs.test.tsx';
const DOCS_DE_ABAS = [
  'docs/design/PLANO_INBOX_360_CONVERSA.md',
  'docs/design/PLANO_INBOX_FIDELIDADE_CARVAO.md',
];
const LISTA_DE_TAREFAS = 'src/components/tasks/list/TasksListMode.tsx';
const DOC_DE_TIPOGRAFIA = 'docs/design/TAREFAS_QUADRO_STATUS.md';

// ===========================================================================
// 1) Ordem das abas do centro
// ===========================================================================

/** Ordem contratada, lida do componente (fonte da verdade única). */
function abasDoComponente(tsx) {
  const bloco = tsx.match(/const TABS: TabDef\[\]\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(bloco, `${COMPONENTE_ABAS}: não achei a lista TABS — o teste perdeu o alvo`);
  const abas = [...bloco[1].matchAll(/\{\s*id:\s*'([^']+)',\s*label:\s*'([^']+)'/g)].map((m) => ({
    id: m[1],
    rotulo: m[2],
  }));
  assert.ok(abas.length >= 4, `${COMPONENTE_ABAS}: TABS com apenas ${abas.length} abas legíveis`);
  return abas;
}

/** Frase canônica da barra, como o teste do componente a escreve. */
function fraseDaOrdem(abas) {
  return abas.map((a) => a.rotulo).join(' → ');
}

/**
 * Ids que o PRÓPRIO teste do componente pina (`ORDEM_CONTRATADA`). É esse contrato — e não
 * a leitura que esta guarda faz do TSX — que vale para o doc: se o componente e o seu teste
 * divergirem, o doc estaria preso a uma ordem que a suíte recusa.
 */
function ordemPinadaPeloTeste(tsxTeste) {
  const bloco = tsxTeste.match(/const ORDEM_CONTRATADA = \[([\s\S]*?)\];/);
  assert.ok(bloco, `${TESTE_DO_COMPONENTE}: não achei ORDEM_CONTRATADA — o teste do componente mudou de forma`);
  const ids = [...bloco[1].matchAll(/'conversation-tab-([^']+)'/g)].map((m) => m[1]);
  assert.ok(ids.length >= 4, `${TESTE_DO_COMPONENTE}: ORDEM_CONTRATADA com apenas ${ids.length} abas legíveis`);
  return ids;
}

// Rótulos antigos que os planos davam às MESMAS abas (SalesView nasceu de "Pedidos",
// Journey de "Histórico"; "Lembretes" foi fundida em Tarefas).
const APELIDOS = new Map([
  ['chat', 'chat'],
  ['arquivos', 'files'],
  ['files', 'files'],
  ['ia', 'ia'],
  ['crm', 'crm'],
  ['crm 360°', 'crm'],
  ['crm 360', 'crm'],
  ['salesview', 'orders'],
  ['pedidos', 'orders'],
  ['orders', 'orders'],
  ['journey', 'history'],
  ['histórico', 'history'],
  ['historico', 'history'],
  ['history', 'history'],
  ['tarefas', 'tasks'],
  ['tasks', 'tasks'],
  ['notas', 'notes'],
  ['notes', 'notes'],
  ['lembretes', 'reminders'],
  ['reminders', 'reminders'],
]);

// Ordem contratada e vocabulário, lidos do componente: fonte da verdade única. Os tokens
// saem daqui para que a enumeração não seja truncada quando uma aba nasce ou é renomeada
// (foi assim que `orders` escapou da primeira versão desta guarda).
const ABAS = abasDoComponente(ler(COMPONENTE_ABAS));
const FRASE = fraseDaOrdem(ABAS);

// Os rótulos do componente também valem como token: um rótulo de várias palavras ("IA
// renomeada") não pode partir a enumeração em dois pedaços e virar falso positivo — caso
// que a mutação de renomear a aba expôs nesta guarda.
for (const aba of ABAS) APELIDOS.set(aba.rotulo.toLowerCase(), aba.id);

const TOKEN_ABA =
  '(?:' +
  [...new Set([...ABAS.map((a) => a.id), ...APELIDOS.keys()])]
    .sort((a, b) => b.length - a.length) // 'crm 360°' antes de 'crm'
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*'))
    .join('|') +
  ')';
const SEPARADOR = '(?:\\s*(?:·|→|\\||,|;|>|\\se\\s)\\s*)';
const ENUMERACAO = new RegExp('`?' + TOKEN_ABA + '`?(?:' + SEPARADOR + '`?' + TOKEN_ABA + '`?)+', 'gi');
const MINIMO_DE_ABAS = 4;

// Só a barra do CENTRO é contratada aqui: o painel direito ("Contato · Histórico ·
// Tarefas · Notas · Arquivos") e os nomes de arquivo de screenshot têm ordem própria e
// não podem ser cobrados por esta regra.
const BARRA_DO_CENTRO = /ConversationTabs|conversation-tab|abas do centro|se[çc][õo]es da conversa|barra de abas/i;
// Uma citação da ordem velha é legítima quando está declarada como superada/histórica.
// (Nada de `/históric/` aqui: "Histórico" é o nome de uma das abas e isentaria a própria
// citação que a regra existe para pegar.)
const MARCA_DE_SUPERACAO = /superad|na [ée]poca|de ent[ãa]o|implementad[ao] em \d{2}\/\d{2}\/\d{4}/i;

const idDoToken = (token) => APELIDOS.get(token.trim().toLowerCase().replace(/\s+/g, ' ')) ?? token.trim();

/** Enumerações de abas de um markdown, com o título da seção como contexto. */
function enumeracoesDeAbas(texto) {
  const linhas = texto.split('\n');
  const achadas = [];
  let titulo = '';
  linhas.forEach((linha, i) => {
    if (/^#{1,6}\s/.test(linha)) titulo = linha;
    for (const m of linha.matchAll(ENUMERACAO)) {
      const ids = (m[0].match(new RegExp(TOKEN_ABA, 'gi')) ?? []).map(idDoToken);
      if (ids.length < MINIMO_DE_ABAS) continue;
      achadas.push({ numero: i + 1, linha, contexto: `${titulo}\n${linha}`, ids });
    }
  });
  return achadas;
}

/**
 * Violações de ordem num doc: (a) o doc tem de citar a ordem contratada; (b) nenhuma
 * enumeração da barra do centro pode seguir a ordem antiga sem estar marcada como superada.
 */
function violacoesDeOrdem(texto, abas) {
  const violacoes = [];
  if (!texto.includes(fraseDaOrdem(abas))) {
    violacoes.push(`não cita a ordem contratada ("${fraseDaOrdem(abas)}")`);
  }
  const contratados = abas.map((a) => a.id).join('>');
  for (const e of enumeracoesDeAbas(texto)) {
    if (!BARRA_DO_CENTRO.test(e.contexto)) continue;
    if (e.ids.join('>') === contratados) continue;
    if (MARCA_DE_SUPERACAO.test(e.linha)) continue;
    violacoes.push(`linha ${e.numero} cita a ordem antiga (${e.ids.join(' → ')}) sem marcar como superada`);
  }
  return violacoes;
}

// ===========================================================================
// 2) Tipografia do subcabeçalho de "Próximas"
// ===========================================================================

// `(?![\w-])` e não `\b`: `text-[12px]` termina em `]` (não-palavra) e um `\b` ali nunca
// fecha — o arbitrário justamente o que a regra existe para pegar escaparia.
const TAMANHO = /(?<![\w-])text-(?:\[[^\]]+\]|xs|sm|base|lg|xl|2xl|3xl)(?![\w-])/g;
// Um valor arbitrário (`text-[12px]`) nunca pode ser citado como se fosse o vigente: o doc
// precisa dizer junto que o guard-rail reprovou e qual é o token equivalente.
const REGISTRA_O_VETO = /text-xs|reprov|pro[íi]be|n[ãa]o usa|vigente|trocad|substitu|equivalente|guard-rail/i;

/** Classe de tamanho do subcabeçalho dos grupos de "Próximas", lida do código real. */
function tipografiaDoSubcabecalho(tsx) {
  // Duas linhas do JSX citam `{g.label}` com `className`; só a que RENDERIZA o rótulo
  // (`<div className="px-1 text-xs …">{g.label}</div>`) carrega o token de tipografia.
  const candidatas = tsx.split('\n').filter((l) => l.includes('className') && l.includes('{g.label}'));
  assert.ok(candidatas.length > 0, `${LISTA_DE_TAREFAS}: não achei o subcabeçalho dos grupos (linha com {g.label})`);
  for (const linha of candidatas) {
    const tokens = linha.match(TAMANHO) ?? [];
    if (tokens.length > 0) return tokens;
  }
  assert.fail(`${LISTA_DE_TAREFAS}: o subcabeçalho dos grupos perdeu o token de tipografia`);
}

function violacoesDeTipografia(doc, tokensDoCodigo) {
  const violacoes = [];
  const linhas = doc.split('\n');
  linhas.forEach((linha, i) => {
    if (!/text-\[/.test(linha)) return;
    if (REGISTRA_O_VETO.test(linha)) return;
    violacoes.push(`linha ${i + 1} cita tamanho arbitrário sem registrar o veto do guard-rail: ${linha.trim().slice(0, 90)}`);
  });
  const indice = linhas.findIndex((l) => l.trim().startsWith('|') && l.includes('TasksListMode.tsx') && /subcabe/i.test(l));
  if (indice < 0) {
    violacoes.push('a tabela de Mudanças perdeu a linha do subcabeçalho de TasksListMode.tsx');
  } else {
    for (const token of linhas[indice].match(TAMANHO) ?? []) {
      if (!tokensDoCodigo.includes(token)) {
        violacoes.push(`linha ${indice + 1} cita ${token} como a classe do subcabeçalho e o código usa ${tokensDoCodigo.join(' / ')}`);
      }
    }
  }
  return violacoes;
}

// ===========================================================================
// Fixtures em string: provam os dois lados sem depender do estado dos docs.
// ===========================================================================

const FIX_ORDEM_ANTIGA = [
  '### 2.4 Abas do centro (`ConversationTabs` — já existe; ajustar)',
  'Ordem e rótulos: **Chat · IA · CRM 360° · Tarefas · Notas · Arquivos · Histórico**.',
].join('\n');

const FIX_ORDEM_SUPERADA = [
  '### 2.4 Abas do centro (`ConversationTabs` — já existe; ajustar)',
  'Ordem e rótulos: **Chat · IA · CRM 360° · Tarefas · Notas · Arquivos · Histórico** — implementada em 08/09 e superada.',
  `Ordem contratada hoje: **${FRASE}**.`,
].join('\n');

const FIX_ORDEM_DO_PAINEL_DIREITO = [
  '### 5.2 Painel direito',
  '- Abas (h-44, underline): **Contato · Histórico · Tarefas · Notas · Arquivos**.',
].join('\n');

const LINHA_FALSA = '| `src/components/tasks/list/TasksListMode.tsx` | "Próximas" recebe `groups`; subcabeçalho `text-[12px]`; tooltip no cabeçalho |';
const FIX_TIPOGRAFIA_FALSA = ['| arquivo | o que muda |', '|---|---|', LINHA_FALSA].join('\n');
const FIX_TIPOGRAFIA_OK = [
  '**Regra do plano:** subcabeçalho `text-[12px]` (reprovado pelo guard-rail: o token equivalente é `text-xs`).',
  '| arquivo | o que muda |',
  '|---|---|',
  LINHA_FALSA.replace('`text-[12px]`', '`text-xs` (12px)'),
].join('\n');

// ===========================================================================
// Asserções sobre os docs e o código reais.
// ===========================================================================

test('ordem das abas (fixture): citação da ordem antiga sem marca de superação é violação', () => {
  const violacoes = violacoesDeOrdem(FIX_ORDEM_ANTIGA, ABAS);
  assert.ok(
    violacoes.some((v) => /ordem antiga/.test(v)),
    `a ordem antiga tinha de ser acusada: ${violacoes.join('; ')}`,
  );
});

test('ordem das abas (fixture): ordem antiga declarada como superada, com a contratada junto, passa', () => {
  assert.deepEqual(violacoesDeOrdem(FIX_ORDEM_SUPERADA, ABAS), []);
});

test('ordem das abas (fixture): o painel direito tem ordem própria e não é cobrado', () => {
  // Sem a frase contratada a fixture ainda acusa a falta dela — o que não pode aparecer é
  // acusação de "ordem antiga": aquelas abas são de outra barra.
  const violacoes = violacoesDeOrdem(FIX_ORDEM_DO_PAINEL_DIREITO, ABAS);
  assert.ok(
    !violacoes.some((v) => /ordem antiga/.test(v)),
    `a barra do painel direito não é a do centro: ${violacoes.join('; ')}`,
  );
});

test('ordem das abas (fixture): código com outra ordem muda a exigência do doc', () => {
  const trocadas = ABAS.map((a, i) => (i === 0 ? { ...a, rotulo: `${a.rotulo} renomeada` } : a));
  const violacoes = violacoesDeOrdem(FIX_ORDEM_SUPERADA, trocadas);
  assert.ok(
    violacoes.some((v) => /ordem contratada/.test(v)),
    'a frase contratada tem de vir do código, não do doc',
  );
});

test('ordem das abas (fixture): o doc vazio falha fechado', () => {
  assert.ok(
    violacoesDeOrdem('', ABAS).some((v) => /não cita a ordem contratada/.test(v)),
    'doc sem nenhuma citação da barra tinha de ser acusado (falha fechada)',
  );
});

test('ordem das abas (fixture): menção curta (menos de 4 abas) não vira citação de ordem', () => {
  const curta = [
    '### 2.4 Abas do centro (`ConversationTabs` — já existe; ajustar)',
    'Chat, IA e CRM são as três primeiras abas; a barra completa é:',
    `**${FRASE}**.`,
  ].join('\n');
  assert.deepEqual(violacoesDeOrdem(curta, ABAS), []);
});

test('a ordem do componente é a mesma que o teste dele pina (âncora do doc)', () => {
  assert.deepEqual(
    ABAS.map((a) => a.id),
    ordemPinadaPeloTeste(ler(TESTE_DO_COMPONENTE)),
    'o doc estaria preso a uma ordem que a suíte do componente recusa',
  );
});

test('docs de abas do SL-180 não citam a ordem antiga da barra do centro', () => {
  const ofensores = DOCS_DE_ABAS.flatMap((doc) =>
    violacoesDeOrdem(ler(doc), ABAS).map((v) => `${doc}: ${v}`),
  );
  assert.deepEqual(ofensores, [], `docs com ordem antiga: ${ofensores.join(' | ')}`);
});

test('subcabeçalho de "Próximas" (fixture): arbitrário sem o veto registrado e token divergente são violações', () => {
  const violacoes = violacoesDeTipografia(FIX_TIPOGRAFIA_FALSA, ['text-xs']);
  assert.ok(
    violacoes.some((v) => /veto do guard-rail/.test(v)),
    `o arbitrário sem veto tinha de ser acusado: ${violacoes.join('; ')}`,
  );
  assert.ok(
    violacoes.some((v) => /código usa text-xs/.test(v)),
    `o token divergente do código tinha de ser acusado: ${violacoes.join('; ')}`,
  );
});

test('subcabeçalho de "Próximas" (fixture): arbitrário com o veto registrado e token do código passa', () => {
  assert.deepEqual(violacoesDeTipografia(FIX_TIPOGRAFIA_OK, ['text-xs']), []);
});

test('doc de Tarefas/Quadro cita a classe do subcabeçalho que o código usa', () => {
  const tokens = tipografiaDoSubcabecalho(ler(LISTA_DE_TAREFAS));
  const violacoes = violacoesDeTipografia(ler(DOC_DE_TIPOGRAFIA), tokens);
  assert.deepEqual(violacoes, [], `${DOC_DE_TIPOGRAFIA}: ${violacoes.join('; ')}`);
});
