/**
 * F54 (Bloco E) / TL-030 — CONTRATO INTEGRADO do caminho de despacho do Multiplix.
 *
 * O que este arquivo fecha (e por que ele é INTEGRADO, e não um regex sobre nomes):
 *
 *   A causa MX02 era a divergência entre os DOIS lados do mesmo item de fila —
 *   a PRÉVIA/revisão (`multiplix-dispatch/actions/inspect.ts`) e o MOTOR DE ENVIO
 *   (`multiplix-send/index.ts`) respondiam coisas diferentes para o mesmo
 *   bloco+destinatário: o operador revisava "BLOCO CORRETO {{empresa}}" e saía o
 *   template GLOBAL do disparo. A correção unificou a decisão em UM resolvedor
 *   compartilhado (`supabase/functions/_shared/multiplix-content.ts`), consumido
 *   pelos dois lados, e o veredito de quem recebe num mapa canônico único
 *   (`_shared/multiplix-eligibility.ts`, reexportado pelo front em
 *   `src/lib/multiplix-eligibility.ts`).
 *
 *   Este contrato prova essa integração por COMPORTAMENTO — o texto, a legenda, o
 *   nome do arquivo e o veredito do ativo que saem para o mesmo par
 *   bloco×destinatário, e o payload que o adaptador real coloca no POST — sem
 *   afirmar nada sobre o NOME de uma função/coluna no fonte.
 *
 *   Escopo (medido na ponta dia/2026-10-09): as causas MX01 e MX03 NÃO são
 *   alcançáveis por um contrato offline — a primeira vive no front (o composer
 *   cria e inicia sem chamar `confirm`, e quem materializa a fila por item é a RPC
 *   `multiplix_confirm_dispatch`) e a segunda no motor de envio (que conclui por
 *   `complete_multiplix_dispatch_if_drained`, o dreno de `multiplix_recipients`).
 *   As duas exigem as edges/UI do FLUXO novo (F51/F79 + TL-006) e estão registradas
 *   no relato do cartão; aqui fica o que o runner de contrato alcança e prova.
 *
 * Sem rede: os módulos são os REAIS (o `fetch` do adaptador é injetado e devolve
 * `Response` montada). Roda nos DOIS runners, sem rede:
 *   - `deno test --config scripts/ci/deno.json --frozen --allow-read tests/contracts/<este>`
 *   - `bun run test:contracts` (vitest, que varre tests/contracts/**\/*.test.ts)
 * Harness dual: `Deno.test` no Deno, `it()` no vitest; as asserções são únicas.
 */
import {
  blocksForReview,
  buildPreviewBlocks,
  resolveBlockContent,
  resolveBlockResolution,
  type ContentBlockRow,
  type ContentDispatchRow,
  type ContentRecipient,
} from '../../supabase/functions/_shared/multiplix-content.ts';
import { send } from '../../supabase/functions/_shared/messaging/evolution-go.ts';
import type { SendDeps, SendItem } from '../../supabase/functions/_shared/messaging/evolution-go.ts';
import { fromSinguEligibility } from '../../supabase/functions/_shared/multiplix-eligibility.ts';

const IS_DENO = typeof Deno !== 'undefined' && typeof (Deno as { test?: unknown }).test === 'function';

type CaseFn = () => void | Promise<void>;
let registrar: (name: string, fn: CaseFn) => void;
if (IS_DENO) {
  registrar = (name, fn) => { Deno.test(name, fn); };
} else {
  // Specifier não-literal: o Deno não resolve 'vitest' no `deno check`.
  const spec = 'vit' + 'est';
  const mod = (await import(spec)) as { it: (name: string, fn: CaseFn) => void };
  registrar = (name, fn) => { mod.it(name, fn); };
}

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`[contrato F54] ${msg}`);
}

const TZ = 'America/Sao_Paulo';

// ── insumos: o disparo GLOBAL (o que o MX02 mandava) e o BLOCO revisado ──────

/** O disparo carrega o template/mídia GLOBAIS — o que o worker usava por engano. */
const DISPATCH: ContentDispatchRow = {
  message_template: 'GLOBAL {{empresa}}',
  media_url: 'https://cdn.exemplo.com/global.png',
  media_type: 'image',
  schedule_timezone: TZ,
};

/** O bloco REVISADO pelo operador — a fila é destinatário × bloco. */
const BLOCO_TEXTO: ContentBlockRow = {
  id: 'blk-1',
  block_order: 1,
  block_type: 'text',
  content: { text: 'BLOCO CORRETO {{empresa}}' },
  personalization_mode: 'personalized',
  content_version: 3,
  asset_id: null,
};

/** Destinatário com o que o item congela: nome da empresa + variáveis do CRM. */
const RECIPIENT: ContentRecipient = {
  company_name_snapshot: 'Empresa1',
  variables_snapshot: { cargo: 'Diretor' },
};

// ── (1) a fronteira de QUEM RECEBE (o lado servidor do MX08) ─────────────────

registrar('(1) elegibilidade: o PT do Singu vira EN no Zapp e o desconhecido NUNCA vira apto', () => {
  // Só `eligible` passa no filtro da RPC de criação — é o valor que DISPARA.
  assert(fromSinguEligibility('apto') === 'eligible', "o literal 'apto' do Singu deve virar 'eligible'");
  assert(
    fromSinguEligibility('destino_invalido') === 'no_destination',
    "'destino_invalido' deve virar 'no_destination'",
  );
  assert(
    fromSinguEligibility('fora_do_escopo') === 'out_of_scope',
    "'fora_do_escopo' deve virar 'out_of_scope'",
  );
  // Ausente = resolvedor ANTIGO, que não devolvia a coluna: o contrato trata como apto.
  assert(
    fromSinguEligibility(null) === 'eligible' && fromSinguEligibility(undefined) === 'eligible',
    'elegibilidade ausente é o contrato antigo: deve virar eligible',
  );
  // Forma óbvia do MESMO literal (caixa/espaço) não muda o significado...
  assert(fromSinguEligibility('  APTO  ') === 'eligible', 'variação de caixa/espaço do mesmo literal vale');

  // ...mas QUALQUER valor desconhecido cai no fallback que NÃO dispara.
  const desconhecidos: unknown[] = [
    '', '   ', 'eligible', 'apto?', 'indefinido', 'novo_valor_do_singu',
    ['apto'], { token: 'apto' }, 7, true,
  ];
  for (const cru of desconhecidos) {
    const valor = fromSinguEligibility(cru);
    assert(
      valor === 'out_of_scope',
      `valor desconhecido (${JSON.stringify(cru)}) deve cair em out_of_scope, veio ${valor}`,
    );
    assert(valor !== 'eligible', 'valor desconhecido NUNCA pode ser promovido a eligible (dispararia para quem talvez não possa receber)');
  }
});

// ── (2) MX02: o texto que sai é o do BLOCO, nunca o template global ──────────

registrar('(2) MX02: o texto do item é o do BLOCO; o template global é só o caminho legado', () => {
  // Caminho LEGADO (sem bloco persistido): a revisão cai no template global. É
  // exatamente o texto que o worker mandava por engano.
  const legado = blocksForReview([], DISPATCH);
  assert(legado.length === 1, 'sem blocos, a revisão cai no template global do disparo');
  assert(
    legado[0].content.text === 'GLOBAL {{empresa}}',
    `o caminho legado carrega o GLOBAL, veio ${JSON.stringify(legado[0].content.text)}`,
  );

  // Caminho do ITEM: todo item da fila referencia um bloco, e o bloco vence.
  const doItem = resolveBlockContent(BLOCO_TEXTO, RECIPIENT, TZ);
  assert(doItem.text === 'BLOCO CORRETO Empresa1', `texto do item esperado 'BLOCO CORRETO Empresa1', veio '${doItem.text}'`);
  assert(
    doItem.text !== resolveBlockContent(legado[0], RECIPIENT, TZ).text,
    'o texto do item NÃO pode ser o do template global (era o defeito do MX02)',
  );

  // O `variables_snapshot` do item entra na personalização (não só a empresa).
  const blocoCustom: ContentBlockRow = {
    id: 'blk-2',
    block_order: 2,
    block_type: 'text',
    content: { text: 'Olá {{cargo}} da {{empresa}}' },
    personalization_mode: 'personalized',
    content_version: 1,
    asset_id: null,
  };
  assert(
    resolveBlockContent(blocoCustom, RECIPIENT, TZ).text === 'Olá Diretor da Empresa1',
    'o campo customizado congelado no item precisa entrar no texto',
  );
});

// ── (3) MX02: prévia == envio (a integração dos dois consumidores) ───────────

registrar('(3) MX02: a PRÉVIA e o ENVIO resolvem o MESMO item byte a byte', () => {
  const previa = buildPreviewBlocks([BLOCO_TEXTO], RECIPIENT, TZ);
  const envio = resolveBlockContent(BLOCO_TEXTO, RECIPIENT, TZ);
  assert(previa.length === 1, 'a prévia devolve um resolvido por bloco');
  assert(
    JSON.stringify(previa[0]) === JSON.stringify(envio),
    `prévia e envio divergiram:\n  prévia: ${JSON.stringify(previa[0])}\n  envio:  ${JSON.stringify(envio)}`,
  );

  // O mesmo vale para o relatório do kernel (missing/unknown): é ele que segura o
  // item com variável pendente (MX06) — a prévia valida com o MESMO relatório.
  const semEmpresa: ContentRecipient = { company_name_snapshot: null, variables_snapshot: {} };
  const pendente = resolveBlockResolution(BLOCO_TEXTO, semEmpresa, TZ);
  assert(
    pendente.block.text === 'BLOCO CORRETO ',
    `sem valor, o nome da empresa entra vazio (nada de valor inventado), veio '${pendente.block.text}'`,
  );
  assert(
    !pendente.block.text.includes('{{'),
    'nenhum placeholder pode sair cru para o cliente',
  );
  assert(
    pendente.missing.includes('empresa') && pendente.unknown.length === 0,
    `esperava 'empresa' em missing e unknown vazio, veio ${JSON.stringify(pendente)}`,
  );

  const typo: ContentBlockRow = { ...BLOCO_TEXTO, content: { text: 'Ola {{empressa}}' } };
  const comTypo = resolveBlockResolution(typo, RECIPIENT, TZ);
  assert(
    comTypo.unknown.join(',') === 'empressa' && comTypo.missing.length === 0,
    `placeholder fora do conjunto deve virar unknown (nunca sair cru), veio ${JSON.stringify(comTypo)}`,
  );
});

// ── (4) MX02: o documento sai com o nome do arquivo DO BLOCO ─────────────────

registrar('(4) MX02: o nome do arquivo do documento vem do bloco — nas DUAS grafias gravadas', () => {
  const url = 'https://cdn.exemplo.com/contrato.pdf';
  const base: ContentBlockRow = {
    id: 'blk-doc',
    block_order: 1,
    block_type: 'file',
    content: { media: { url, caption: 'Segue {{empresa}}' } },
    personalization_mode: 'personalized',
    content_version: 1,
    asset_id: null,
  };

  // `file_name` é a grafia que a prévia publica...
  const snake = resolveBlockContent(
    { ...base, content: { media: { url, file_name: 'contrato.pdf', caption: 'Segue {{empresa}}' } } },
    RECIPIENT,
    TZ,
  );
  // ...e `fileName` a grafia que o worker exigia: as duas têm de resolver igual.
  const camel = resolveBlockContent(
    { ...base, content: { media: { url, fileName: 'nota-fiscal.pdf', caption: 'Segue {{empresa}}' } } },
    RECIPIENT,
    TZ,
  );
  const semNome = resolveBlockContent(base, RECIPIENT, TZ);

  assert(snake.asset?.file_name === 'contrato.pdf', `file_name não chegou ao ativo, veio ${JSON.stringify(snake.asset?.file_name)}`);
  assert(camel.asset?.file_name === 'nota-fiscal.pdf', `fileName não chegou ao ativo, veio ${JSON.stringify(camel.asset?.file_name)}`);
  assert(semNome.asset?.file_name === null, 'sem nome no bloco o ativo não inventa um nome de arquivo');
  assert(snake.asset?.kind === 'document', `pdf deve sair como documento, veio ${snake.asset?.kind}`);
  assert(snake.asset?.url === url, 'a URL do ativo tem de ser a do bloco');
  assert(snake.asset?.caption === 'Segue Empresa1', `a legenda personaliza com o destinatário, veio '${snake.asset?.caption}'`);
});

// ── (5) MX02: `same_audio` não personaliza; `personalized` personaliza ───────

registrar('(5) MX02: same_audio renderiza UMA vez (indiferente ao destinatário); personalized varia', () => {
  const vozBase: ContentBlockRow = {
    id: 'blk-voz',
    block_order: 1,
    block_type: 'voice_ai',
    content: { voice: { script: 'Olá {{empresa}}', voice_id: 'voz-1' } },
    content_version: 1,
    asset_id: 'asset-1',
  };
  const compartilhado: ContentBlockRow = { ...vozBase, personalization_mode: 'same_audio' };
  const personalizado: ContentBlockRow = { ...vozBase, personalization_mode: 'personalized' };

  // same_audio: um áudio para o disparo inteiro — o veredito não depende do contato,
  // então NÃO consome o nome do destinatário (o placeholder fica literal e é
  // reportado em missing, em vez de sair o nome da empresa A para todo mundo).
  const a = resolveBlockResolution(compartilhado, { company_name_snapshot: 'Empresa A' }, TZ);
  const b = resolveBlockResolution(compartilhado, { company_name_snapshot: 'Empresa B' }, TZ);
  assert(a.block.asset?.shared === true, 'same_audio deve ser marcado como ativo compartilhado');
  assert(a.block.asset?.frozen === true, 'asset_id presente = ativo congelado (F45)');
  assert(
    JSON.stringify(a) === JSON.stringify(b),
    `same_audio não pode depender do destinatário:\n  A: ${JSON.stringify(a)}\n  B: ${JSON.stringify(b)}`,
  );
  assert(!a.block.text.includes('Empresa A'), 'same_audio não pode personalizar com o dado do destinatário');

  // personalized: cada destinatário tem o próprio roteiro resolvido.
  const pa = resolveBlockResolution(personalizado, { company_name_snapshot: 'Empresa A' }, TZ);
  const pb = resolveBlockResolution(personalizado, { company_name_snapshot: 'Empresa B' }, TZ);
  assert(pa.block.asset?.shared === false, 'personalized não é ativo compartilhado');
  assert(pa.block.text === 'Olá Empresa A', `roteiro personalizado esperado 'Olá Empresa A', veio '${pa.block.text}'`);
  assert(pb.block.text === 'Olá Empresa B', `roteiro personalizado esperado 'Olá Empresa B', veio '${pb.block.text}'`);
  assert(pa.block.text !== pb.block.text, 'personalized precisa variar por destinatário');
});

// ── (6) MX02/F69: o resolvedor não inventa ativo de voz ─────────────────────

registrar('(6) MX02/F69: bloco de voz sem ativo renderizado não vira URL inventada (item é segurado)', () => {
  const semAtivo: ContentBlockRow = {
    id: 'blk-voz-2',
    block_order: 1,
    block_type: 'voice_ai',
    content: { voice: { script: 'Olá!', voice_id: 'voz-1' } },
    personalization_mode: 'personalized',
    content_version: 1,
    asset_id: null,
  };

  const resolvido = resolveBlockContent(semAtivo, RECIPIENT, TZ);
  assert(resolvido.asset?.kind === 'voice', 'o ativo do bloco de voz tem de continuar sendo de voz');
  assert(resolvido.asset?.url === null, 'bloco de voz NÃO tem URL direta: nada de inventar um link para o POST');
  assert(resolvido.asset?.asset_id === null, 'sem asset_id não há ativo congelado');
  assert(
    resolvido.asset?.frozen === false,
    'é este veredito (`frozen`) que o motor de envio lê para SEGURAR/reagendar o item (F69) em vez de mandar texto solto',
  );
  // Voz por ativo do ITEM (personalizado) ou do BLOCO (same_audio) vira congelado.
  assert(
    resolveBlockContent({ ...semAtivo, asset_id: 'asset-9' }, RECIPIENT, TZ).asset?.frozen === true,
    'com ativo renderizado o bloco de voz fica congelado',
  );
});

// ── (7) integração final: o que chega ao provedor é o texto do BLOCO ─────────

type Fetcher = (url: string, options: RequestInit) => Promise<Response>;

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Fetcher gravador: nenhuma chamada real, tudo pelo fetcher injetado. */
function recordingFetcher(responses: Response[]): { calls: FetchCall[]; fetcher: Fetcher } {
  const calls: FetchCall[] = [];
  let i = 0;
  const fetcher: Fetcher = (url, options) => {
    calls.push({
      url,
      method: options.method ?? 'GET',
      body: typeof options.body === 'string' ? JSON.parse(options.body) : undefined,
    });
    const resp = responses[Math.min(i, responses.length - 1)] ?? jsonResponse(null, 500);
    i += 1;
    return Promise.resolve(resp);
  };
  return { calls, fetcher };
}

function depsFor(fetcher: Fetcher): SendDeps {
  return {
    fetch: fetcher,
    evolutionUrl: 'https://go.exemplo.com',
    evolutionKey: 'admin-key',
    instanceToken: 'token-instancia',
  };
}

registrar('(7) o payload que chega ao provedor carrega o texto do BLOCO (resolvedor → adaptador)', async () => {
  const textoDoBloco = resolveBlockContent(BLOCO_TEXTO, RECIPIENT, TZ).text;
  const { calls, fetcher } = recordingFetcher([jsonResponse({ data: { Info: { ID: 'GO-MSG-9' } } })]);

  const item: SendItem = { kind: 'text', to: '5511999999999', instanceId: 'inst-a', text: textoDoBloco };
  const result = await send(item, depsFor(fetcher));

  assert(result.ok === true, `esperava ok=true, veio ${result.ok} (${result.error})`);
  assert(result.goPath === '/send/text', `esperava a rota de texto, veio ${result.goPath}`);

  const envio = calls[calls.length - 1];
  const corpo = envio.body as { number?: string; text?: string };
  assert(corpo.number === '5511999999999', `destino esperado no payload, veio ${JSON.stringify(corpo.number)}`);
  assert(
    corpo.text === textoDoBloco,
    `o texto enviado tem de ser o do BLOCO byte a byte, veio '${corpo.text}'`,
  );
  assert(corpo.text === 'BLOCO CORRETO Empresa1', 'o texto do bloco é o que sai — nunca o template global do disparo');
  assert(
    calls.every((c) => c.url.startsWith('https://go.exemplo.com')),
    'todo I/O tem de ir ao endpoint injetado (sem rede real)',
  );
});
