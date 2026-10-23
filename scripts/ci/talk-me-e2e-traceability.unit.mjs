import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// TM-05 (#478): o fechamento de 2026-09-30 registrou cinco lacunas, entre elas a
// ausência de E2E dedicado do TALK ME. O relatório é evidência histórica e não é
// reescrito quando uma lacuna é coberta depois. Este guard preserva as afirmações
// daquele fechamento e, separadamente, exige a cobertura atual no navegador com
// fixture sintética e seed exclusivamente local.

const raiz = new URL('../../', import.meta.url);
const caminhoRelatorio = new URL(
  '../../docs/design/RELATORIO_EXECUCAO_TALK_ME_2026-09-30.md',
  import.meta.url,
);
const relatorio = readFileSync(caminhoRelatorio, 'utf8');
const caminhoSpecE2E = 'e2e/talk-me.spec.ts';
const caminhoSeedE2E = 'e2e/fixtures/seed-talk-me.sql';
const specE2E = readFileSync(new URL(caminhoSpecE2E, raiz), 'utf8');
const seedE2E = readFileSync(new URL(caminhoSeedE2E, raiz), 'utf8');

// Testes duráveis que sustentam o fluxo de fila/aceite do TALK ME.
const TESTES_DURAVEIS = [
  'src/features/talk-me/__tests__/TalkMeView.test.tsx',
  'src/features/talk-me/__tests__/useTalkMeQueue.test.tsx',
  'scripts/db-audit/talk-me-queue-contract.test.sh',
  'scripts/db-audit/talk-me-client-privileges.test.sh',
];

// Cenários exigidos pelo fechamento: navegação, paginação, aceite, autorização,
// concorrência e preservação do Inbox.
const CENARIOS = [
  'Seleção do atendimento mais antigo e dados reais do cartão',
  'Navegação por teclado move seleção e foco juntos',
  'Busca no servidor, não nos cartões já carregados',
  'Paginação avança além do último cartão carregado',
  'Fila vazia distinguida de falha de consulta',
  'Aceite abre a conversa só após a confirmação do servidor',
  'Seleção avança quando o contato atual sai da fila',
  'Aceite única: duplo clique e segundo agente não sobrescrevem',
  'Conflito do banco vira erro de domínio sem abrir conversa errada',
  'Fila de 500 itens sem duplicar identidades',
  'Reconciliação por realtime em até dois segundos',
  'Elegibilidade e escopo por fila (A1–A13, E1–E2)',
  'Aceite atômico, auditoria mínima e idempotência (B1–B5)',
  'Permissão revogada, flag desligada e perfil inativo (C1–C9)',
  'Concorrência real: um responsável e um evento (D2–D3)',
  'ACL das RPCs: anon sem EXECUTE, authenticated autorizado',
];

// Lacunas que o fechamento não pode ocultar com contagem global de testes.
const LACUNAS_HISTORICAS = [
  'Spec E2E dedicado do TALK ME no navegador',
  'Pacote durável antes/depois (screenshots de referência do TALK ME)',
  'Vídeo da navegação',
  'Storyboard visual',
  'Teste durável de preservação do Inbox durante o TALK ME',
];

/** Corpo da seção de rastreabilidade, do título até a próxima seção de nível 2. */
function secaoRastreabilidade(texto) {
  const m = /\n## Rastreabilidade E2E e artefatos visuais\s*\n([\s\S]*?)(?=\n## |$)/u.exec(texto);
  assert.ok(m, 'seção "Rastreabilidade E2E e artefatos visuais" ausente no relatório');
  return m[1];
}

/** Linhas de dados da tabela (ignora cabeçalho e separador). */
function linhasDaTabela(corpo) {
  return corpo
    .split('\n')
    .filter((linha) => linha.trim().startsWith('|'))
    .map((linha) => linha.trim().replace(/^\||\|$/gu, '').split('|').map((c) => c.trim()))
    .filter((celulas) => !/^-+$/u.test(celulas[0]) && celulas[0] !== 'Cenário');
}

test('relatório mapeia cenário, teste, SHA e artefato no fechamento', () => {
  const corpo = secaoRastreabilidade(relatorio);
  const cabecalho = corpo
    .split('\n')
    .find((linha) => linha.trim().startsWith('| Cenário'));
  assert.ok(cabecalho, 'tabela de rastreabilidade sem linha de cabeçalho');
  for (const coluna of ['Cenário', 'Teste durável', 'SHA', 'Artefato', 'Situação']) {
    assert.match(cabecalho, new RegExp(`\\|\\s*${coluna}\\s*\\|`), `coluna ${coluna} ausente`);
  }
});

test('todo cenário exigido tem linha própria no mapa', () => {
  const corpo = secaoRastreabilidade(relatorio);
  const rotulos = linhasDaTabela(corpo).map((celulas) => celulas[0]);
  for (const cenario of CENARIOS) {
    assert.ok(
      rotulos.includes(cenario),
      `cenário "${cenario}" sem linha no mapa de rastreabilidade`,
    );
  }
});

test('todo teste citado existe no disco e todo cenário mapeado tem SHA', () => {
  const corpo = secaoRastreabilidade(relatorio);
  const testeCobertos = new Set();
  for (const celulas of linhasDaTabela(corpo)) {
    const [, teste, sha] = celulas;
    const citado = TESTES_DURAVEIS.find((caminho) => teste.includes(caminho));
    if (!citado) continue;
    testeCobertos.add(citado);
    assert.match(
      sha,
      /\b[0-9a-f]{40}\b/u,
      `cenário "${celulas[0]}" sem SHA de 40 dígitos que cite o teste ${citado}`,
    );
  }
  for (const caminho of TESTES_DURAVEIS) {
    assert.ok(
      testeCobertos.has(caminho),
      `teste durável ${caminho} não aparece no mapa de rastreabilidade`,
    );
    assert.ok(
      existsSync(fileURLToPath(new URL(caminho, raiz))),
      `teste durável ${caminho} citado no mapa não existe no repositório`,
    );
  }
});

test('relatório histórico mantém explícitas as cinco lacunas medidas no fechamento', () => {
  const corpo = secaoRastreabilidade(relatorio);
  assert.equal(LACUNAS_HISTORICAS.length, 5, 'guard deve declarar exatamente cinco lacunas históricas');
  assert.match(corpo, /cinco lacunas/u, 'relatório não declara a contagem exata de cinco lacunas');
  // Nenhuma outra contagem pode aparecer: a recusa de #478 foi exatamente a
  // divergência entre um texto dizendo "oito" e cinco linhas no mapa.
  assert.doesNotMatch(
    corpo,
    /\b(duas|três|tres|quatro|seis|sete|oito|nove|dez)\s+lacunas\b/iu,
    'relatório declara contagem de lacunas diferente de cinco',
  );
  assert.match(corpo, /não é cobert[ao]/u, 'seção não declara que a contagem global não cobre a lacuna');
  for (const lacuna of LACUNAS_HISTORICAS) {
    assert.match(
      corpo,
      new RegExp(`\\|\\s*${lacuna.replace(/[()]/gu, '\\$&')}\\s*\\|`),
      `lacuna "${lacuna}" sem linha própria no mapa`,
    );
  }
  const linhas = linhasDaTabela(corpo);
  const dados = linhas.filter((celulas) => LACUNAS_HISTORICAS.some((lacuna) => celulas[0] === lacuna));
  for (const celulas of dados) {
    assert.match(celulas.join(' | '), /Ausente/u, `lacuna "${celulas[0]}" não está marcada como Ausente`);
  }
  // A contagem do mapa tem de bater com LACUNAS nos dois sentidos: nenhuma linha
  // "Ausente" a mais, nenhuma a menos. Sem isto, dizer "oito lacunas" no texto continuava passando com cinco linhas no mapa.
  const ausentes = linhas.filter((celulas) => /Ausente/u.test(celulas[4] ?? ''));
  assert.equal(
    ausentes.length,
    LACUNAS_HISTORICAS.length,
    `mapa tem ${ausentes.length} linhas "Ausente", LACUNAS_HISTORICAS tem ${LACUNAS_HISTORICAS.length}`,
  );
  for (const celulas of ausentes) {
    assert.ok(
      LACUNAS_HISTORICAS.includes(celulas[0]),
      `linha "Ausente" fora de LACUNAS_HISTORICAS: ${celulas[0]}`,
    );
  }
});

test('lacuna atual de E2E dedicado é coberta por spec e seed sintéticos rastreáveis', () => {
  for (const caminho of [caminhoSpecE2E, caminhoSeedE2E]) {
    assert.ok(
      existsSync(fileURLToPath(new URL(caminho, raiz))),
      `artefato atual do TALK ME ausente: ${caminho}`,
    );
  }

  const contratosDoSpec = [
    'talk-me-button-empty',
    "name: 'Departamento'",
    "Aguardando há 45 minutos",
    "name: 'Próximo atendimento'",
    "name: 'Atendimento anterior'",
    "name: 'Buscar na fila TALK ME'",
    "name: 'Aceitar e conversar'",
    "name: 'Tudo em dia'",
    'Fila temporariamente indisponível',
  ];
  for (const contrato of contratosDoSpec) {
    assert.ok(specE2E.includes(contrato), `spec TALK ME não rastreia o contrato: ${contrato}`);
  }

  assert.match(specE2E, /bloquearRedeReal/u, 'spec não bloqueia acesso ao host de produção');
  assert.match(specE2E, /CONTACT_FIXTURES[\s\S]*Ana Antiga Sintetica/u, 'spec não usa contatos sintéticos');
  assert.match(seedE2E, /NUNCA aplique em producao/u, 'seed não declara o limite de banco local');
  assert.match(seedE2E, /talk_me_local_seed/u, 'seed não exige marcador explícito de aplicação local');
  assert.match(seedE2E, /INSERT INTO public\.queue_members/u, 'seed não cria membro da fila');
  assert.match(seedE2E, /INSERT INTO public\.contacts/u, 'seed não cria os contatos da fila');
  assert.equal(
    (seedE2E.match(/'e2e10000-0000-4000-8000-00000000010[1-3]'/gu) ?? []).length,
    6,
    'cada um dos três contatos deve aparecer uma vez no upsert e uma vez nas mensagens',
  );
});

test('a rodada Playwright autenticada aparece como evidência distinta do fluxo de fila/aceite', () => {
  const corpo = secaoRastreabilidade(relatorio);
  assert.match(corpo, /Playwright autenticad[ao]/u, 'seção não cita a rodada Playwright autenticada');
  assert.match(
    corpo,
    /auth\.spec\.ts[^\n]*[0-9a-f]{40}/u,
    'seção não amarra a rodada de auth ao seu próprio SHA',
  );
  assert.match(corpo, /18\/18/u, 'seção não registra o resultado 18/18 da rodada de auth');
  assert.match(
    corpo,
    /não (cobre|substitui|é prova)[^\n]*(fila|aceite)/u,
    'seção não deixa claro que a rodada de auth não cobre fila/aceite',
  );
});
