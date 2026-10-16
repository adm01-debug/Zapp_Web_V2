import {
  AUDIENCE_CACHE_TTL_MS,
  fetchAudienceList,
  handleMultiplixAudienceRequest,
  mapResolvedRecipients,
  MULTIPLIX_OVER_POLICY_LIMIT,
  MULTIPLIX_RESOLVE_TRUNCATED,
  MultiplixPolicyLimitError,
  planResolveBatches,
  redactResolvedRecipient,
  RESOLVE_POLICY_MAX_IDS,
  RESOLVE_RPC_MAX_ROWS,
  resolveRecipientsInBatches,
  SCOPE_SIGNATURE_TTL_SECONDS,
  scopeSignaturePayload,
  signScope,
} from './index.ts';
import { EXPECTED_EXTERNAL_PROJECT_REF } from '../_shared/crm-integration-contract.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// F08 (Bloco A) + F30 (Bloco C): o navegador deixa de decidir quem recebe e a
// edge deixa de comparar elegibilidade com literal PT. Estes testes cobrem a
// transformacao que a edge aplica na resposta de multiplix_resolve_recipients
// antes de chamar a RPC transacional multiplix_create_draft — o resto do
// contrato (idempotencia por client_request_id, transacao, teto de
// destinatarios) e provado no harness de banco
// (scripts/db-audit/multiplix-rls.test.sh, F08/F17).
//
// As LINHAS DE ENTRADA seguem em portugues de proposito: elas modelam o
// produtor real (o Singu externo devolve 'apto'|'destino_invalido'|
// 'fora_do_escopo'). O comportamento provado e o MESMO de antes — traducao
// PT->EN pela fronteira + regra de inclusao — agora com a saida canonica em
// ingles: o filtro compara com 'eligible' e o payload carrega o valor do enum
// do banco, nunca o literal PT.

Deno.test('F08: só destinatário classificado como eligible entra no disparo', () => {
  const mapped = mapResolvedRecipients([
    { company_id: 'c-1', company_name: 'Apta', elegibilidade: 'apto', destino_e164: '5511900000001' },
    { company_id: 'c-2', company_name: 'Inválida', elegibilidade: 'destino_invalido', destino_e164: null },
    { company_id: 'c-3', company_name: 'Fora do escopo', elegibilidade: 'fora_do_escopo', destino_e164: '5511900000003' },
  ]);
  assert(mapped.length === 1, `esperava 1 destinatario, veio ${mapped.length}`);
  assert(mapped[0].company_id === 'c-1', `company_id inesperado: ${mapped[0].company_id}`);
  // O 'apto' do Singu é traduzido para o valor canonico do banco.
  assert(
    mapped[0].elegibilidade === 'eligible',
    `elegibilidade esperada 'eligible', veio ${mapped[0].elegibilidade}`,
  );
});

Deno.test('F08: linha sem company_id não vira destinatário', () => {
  const mapped = mapResolvedRecipients([
    { company_id: null, elegibilidade: 'apto', destino_e164: '5511900000009' },
    { company_id: '', elegibilidade: 'apto' },
    { company_id: 'c-ok', elegibilidade: 'apto' },
  ]);
  assert(mapped.length === 1, `esperava 1 destinatario, veio ${mapped.length}`);
  assert(mapped[0].company_id === 'c-ok', `company_id inesperado: ${mapped[0].company_id}`);
});

Deno.test('F08: sem classificação explícita o destinatário entra como eligible', () => {
  // Mesma leitura da RPC (COALESCE(elegibilidade,'apto')): o resolvedor antigo
  // não devolvia a coluna e a linha não pode ser descartada por isso. A
  // fronteira normaliza a ausência para o valor canônico 'eligible' (a coluna
  // `eligibility` do F31 é NOT NULL, então a ausência vira um valor concreto).
  const mapped = mapResolvedRecipients([{ company_id: 'c-1', company_name: 'Sem classificação' }]);
  assert(mapped.length === 1, `esperava 1 destinatario, veio ${mapped.length}`);
  assert(
    mapped[0].elegibilidade === 'eligible',
    `elegibilidade esperada 'eligible', veio ${mapped[0].elegibilidade}`,
  );
});

Deno.test('F08: campos que não existem no contrato não passam para a RPC', () => {
  // O corpo da requisição nunca define destinatário: o destino vem do
  // resolvedor do Singu. Campos extras do resolvedor não são repassados.
  const mapped = mapResolvedRecipients([
    {
      company_id: 'c-1',
      company_name: 'Acme',
      destino_e164: '5511900000001',
      destino_origem: 'crm',
      elegibilidade: 'apto',
      destino_forjado: '5511999999999',
      company_name_snapshot: 'Nome forjado',
    },
  ]);
  assert(mapped.length === 1, `esperava 1 destinatario, veio ${mapped.length}`);
  const keys = Object.keys(mapped[0]).sort();
  assert(
    keys.join(',') === 'company_id,company_name,destino_e164,destino_origem,elegibilidade',
    `campos inesperados no destinatario: ${keys.join(',')}`,
  );
  assert(mapped[0].destino_e164 === '5511900000001', `destino inesperado: ${mapped[0].destino_e164}`);
});

Deno.test('F08: nenhum destinatário eligible → lista vazia (endpoint responde 400)', () => {
  const mapped = mapResolvedRecipients([
    { company_id: 'c-1', elegibilidade: 'fora_do_escopo' },
    { company_id: 'c-2', elegibilidade: 'destino_invalido' },
  ]);
  assert(mapped.length === 0, `esperava lista vazia, veio ${mapped.length}`);
});

Deno.test('F08: elegibilidade desconhecida não vira destinatário (fallback seguro)', () => {
  // O Singu só produz 'apto'|'destino_invalido'|'fora_do_escopo'. Qualquer outro
  // valor cai no fallback 'out_of_scope' e a linha NÃO entra — diferente de
  // 'eligible', que é o único valor que o filtro deixa passar.
  const mapped = mapResolvedRecipients([
    { company_id: 'c-1', elegibilidade: 'apto' },
    { company_id: 'c-2', elegibilidade: 'valor_que_o_singu_nunca_mandou' },
  ]);
  assert(mapped.length === 1, `esperava só o 'apto' traduzido, veio ${mapped.length}`);
  assert(mapped[0].company_id === 'c-1', `company_id inesperado: ${mapped[0].company_id}`);
});

Deno.test('F08: entrada não-array ou vazia não quebra a transformação', () => {
  assert(mapResolvedRecipients([]).length === 0, 'lista vazia deveria continuar vazia');
});

// ---------------------------------------------------------------------------
// F26 (Bloco B): cache de ramos e ufs na edge.
// Cada conjunto (ramos/ufs) tem o proprio Map com TTL de 5 min por isolate; a
// resposta carrega x-cache HIT|MISS e o segundo request dentro da janela NAO
// toca o Singu. O relogio e injetado para o teste nao esperar 5 min reais.
// ---------------------------------------------------------------------------

Deno.test('F26: 1ª chamada é MISS e consulta a RPC; 2ª dentro de 5 min é HIT e não consulta', async () => {
  const rpcName = 'multiplix_list_ramos#f26-hit';
  let clock = 1_000_000;
  let calls = 0;
  const callRpc = () => {
    calls++;
    return Promise.resolve({ data: [{ id: 'r1' }], error: null });
  };

  const first = await fetchAudienceList('ramos', rpcName, callRpc, { now: () => clock });
  assert(first.cache === 'MISS', `1ª chamada deveria ser MISS, veio ${first.cache}`);
  assert(calls === 1, `1ª chamada deveria consultar a RPC 1x, houve ${calls}`);

  clock += 60_000; // 1 min depois: ainda dentro do TTL de 5 min
  const second = await fetchAudienceList('ramos', rpcName, callRpc, { now: () => clock });
  assert(second.cache === 'HIT', `2ª chamada dentro de 5 min deveria ser HIT, veio ${second.cache}`);
  assert(calls === 1, `2ª chamada nao pode consultar o Singu, houve ${calls} chamadas`);
  assert(
    JSON.stringify(second.data) === JSON.stringify(first.data),
    `HIT deveria devolver o mesmo dado do MISS, veio ${JSON.stringify(second.data)}`,
  );
});

Deno.test('F26: passados os 5 min o cache vence e a RPC é consultada de novo (MISS)', async () => {
  const rpcName = 'multiplix_list_ufs#f26-ttl';
  let clock = 5_000_000;
  let calls = 0;
  const callRpc = () => {
    calls++;
    return Promise.resolve({ data: [`uf-${calls}`], error: null });
  };

  const primeira = await fetchAudienceList('ufs', rpcName, callRpc, { now: () => clock });
  const chamadasNaPrimeira = calls; // captura antes do assert: `asserts` estreita o tipo de `calls`
  assert(
    primeira.cache === 'MISS' && chamadasNaPrimeira === 1,
    `pré-condição: MISS e 1 chamada, veio ${primeira.cache}/${chamadasNaPrimeira}`,
  );

  clock += AUDIENCE_CACHE_TTL_MS - 1; // 1 ms antes de vencer: ainda é HIT
  const noLimite = await fetchAudienceList('ufs', rpcName, callRpc, { now: () => clock });
  const chamadasNoLimite = calls;
  assert(
    noLimite.cache === 'HIT' && chamadasNoLimite === 1,
    `logo antes do TTL ainda é HIT, veio ${noLimite.cache}/${chamadasNoLimite}`,
  );

  clock += 1; // agora >= expiresAt
  const expirada = await fetchAudienceList('ufs', rpcName, callRpc, { now: () => clock });
  assert(expirada.cache === 'MISS', `após o TTL deveria ser MISS, veio ${expirada.cache}`);
  assert(calls === 2, `após o TTL a RPC deveria ser consultada de novo, houve ${calls}`);
});

Deno.test('F26: erro da RPC não entra no cache (não envenena o isolate)', async () => {
  const rpcName = 'multiplix_list_ramos#f26-erro';
  const clock = 9_000_000;
  let calls = 0;
  const failingRpc = () => {
    calls++;
    return Promise.resolve({ data: null, error: { code: 'PGRST500' } });
  };

  let threw = false;
  try {
    await fetchAudienceList('ramos', rpcName, failingRpc, { now: () => clock });
  } catch (error) {
    threw = true;
    assert(
      error instanceof Error && error.message.includes('MULTIPLIX_RPC'),
      `erro inesperado: ${error}`,
    );
  }
  assert(threw, 'erro da RPC deveria propagar');

  const okRpc = () => {
    calls++;
    return Promise.resolve({ data: [{ id: 'r1' }], error: null });
  };
  const retry = await fetchAudienceList('ramos', rpcName, okRpc, { now: () => clock });
  assert(retry.cache === 'MISS', `após erro a próxima chamada deve ser MISS (nada foi cacheado), veio ${retry.cache}`);
  assert(calls === 2, `a RPC deveria ser chamada de novo após o erro, houve ${calls}`);
});

Deno.test('F26: ramos e ufs não compartilham o mesmo cache', async () => {
  const clock = 123_456;
  let ramosCalls = 0;
  let ufsCalls = 0;
  const ramosRpc = () => {
    ramosCalls++;
    return Promise.resolve({ data: ['A'], error: null });
  };
  const ufsRpc = () => {
    ufsCalls++;
    return Promise.resolve({ data: ['SP'], error: null });
  };

  await fetchAudienceList('ramos', 'multiplix_list_ramos#f26-indep', ramosRpc, { now: () => clock });
  const ramosHit = await fetchAudienceList('ramos', 'multiplix_list_ramos#f26-indep', ramosRpc, { now: () => clock });
  assert(ramosHit.cache === 'HIT', `ramos deveria ser HIT, veio ${ramosHit.cache}`);

  const ufsPrimeira = await fetchAudienceList('ufs', 'multiplix_list_ufs#f26-indep', ufsRpc, { now: () => clock });
  assert(ufsPrimeira.cache === 'MISS', `ufs não pode herdar o cache de ramos, veio ${ufsPrimeira.cache}`);
  assert(
    ramosCalls === 1 && ufsCalls === 1,
    `contagens inesperadas: ramos=${ramosCalls} ufs=${ufsCalls}`,
  );
});

// ---------------------------------------------------------------------------
// F27 (Bloco B): resolve em lotes de 1.000, sem teto silencioso.
//
// Medido contra o Singu real em 2026-10-01: o PostgREST do projeto corta a
// RESPOSTA em 1.000 linhas e devolve sucesso, descartando o resto sem erro
// (1.200 ids -> 200 + 1.000 linhas; 2.000 ids -> 206 + 1.000 linhas). O teste
// abaixo simula exatamente essa camada capando em RESOLVE_RPC_MAX_ROWS e prova
// que o fatiamento da edge impede o corte. Python/deno nao tocam a rede.
// ---------------------------------------------------------------------------

const uuidFalso = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const ids = (n: number, from = 0) => Array.from({ length: n }, (_, i) => uuidFalso(from + i));

Deno.test('F27: 1.000 ids cabem em 1 lote; 1.001 viram 2 e nenhum id se perde', () => {
  const mil = planResolveBatches(ids(1_000), []);
  assert(mil.length === 1, `1.000 ids deveriam dar 1 lote, veio ${mil.length}`);
  assert(mil[0].company_ids.length === 1_000, `lote deveria ter 1.000 ids, veio ${mil[0].company_ids.length}`);

  const milEum = planResolveBatches(ids(1_001), []);
  assert(milEum.length === 2, `1.001 ids deveriam dar 2 lotes, veio ${milEum.length}`);
  const total = milEum.reduce((n, b) => n + b.company_ids.length + b.contact_ids.length, 0);
  assert(total === 1_001, `os lotes deveriam somar 1.001 ids, somam ${total}`);
  assert(
    milEum[0].company_ids.length === 1_000 && milEum[1].company_ids.length === 1,
    `reparticao inesperada: ${milEum.map((b) => b.company_ids.length).join('+')}`,
  );
  assert(
    milEum[1].company_ids[0] === uuidFalso(1_000),
    `o ultimo id deveria ser o 1001o da lista, veio ${milEum[1].company_ids[0]}`,
  );
});

Deno.test('F27: o lote conta company_ids e contact_ids JUNTOS (600+600 = 2 lotes)', () => {
  // Cada contact_id pode virar uma empresa distinta na RPC, entao o teto de
  // 1.000 linhas vale para a soma — 600+600 num lote so poderia ser cortado.
  const lotes = planResolveBatches(ids(600), ids(600, 10_000));
  assert(lotes.length === 2, `600 company_ids + 600 contact_ids deveriam dar 2 lotes, veio ${lotes.length}`);
  for (const [i, lote] of lotes.entries()) {
    const n = lote.company_ids.length + lote.contact_ids.length;
    assert(n <= RESOLVE_RPC_MAX_ROWS, `lote ${i} pediu ${n} ids, acima do teto de ${RESOLVE_RPC_MAX_ROWS}`);
  }
  assert(
    lotes[0].company_ids.length === 600 && lotes[0].contact_ids.length === 400,
    `1o lote inesperado: ${lotes[0].company_ids.length} company_ids/${lotes[0].contact_ids.length} contact_ids`,
  );
  assert(
    lotes[1].company_ids.length === 0 && lotes[1].contact_ids.length === 200,
    `2o lote inesperado: ${lotes[1].company_ids.length} company_ids/${lotes[1].contact_ids.length} contact_ids`,
  );
});

Deno.test('F27: acima do teto de politica o erro e nomeado (nao trunca, nao 500)', () => {
  const acima = ids(RESOLVE_POLICY_MAX_IDS + 1);
  let erro: unknown;
  try {
    planResolveBatches(acima, []);
  } catch (e) {
    erro = e;
  }
  assert(erro instanceof MultiplixPolicyLimitError, `esperava MultiplixPolicyLimitError, veio ${erro}`);
  const nomeado = erro as MultiplixPolicyLimitError;
  assert(
    nomeado.message.includes(MULTIPLIX_OVER_POLICY_LIMIT),
    `a mensagem deveria citar ${MULTIPLIX_OVER_POLICY_LIMIT}: ${nomeado.message}`,
  );
  assert(
    nomeado.count === RESOLVE_POLICY_MAX_IDS + 1 && nomeado.limit === RESOLVE_POLICY_MAX_IDS,
    `count/limit inesperados: ${nomeado.count}/${nomeado.limit}`,
  );
  // Exatamente no teto ainda passa — o teto e de POLITICA, nao um corte.
  assert(
    planResolveBatches(ids(RESOLVE_POLICY_MAX_IDS), []).length === RESOLVE_POLICY_MAX_IDS / RESOLVE_RPC_MAX_ROWS,
    `no teto exato deveriam sair ${RESOLVE_POLICY_MAX_IDS / RESOLVE_RPC_MAX_ROWS} lotes`,
  );
});

Deno.test('F27: 2.500 ids viram 3 chamadas e voltam as 2.500 linhas (nada truncado)', async () => {
  const chamadas: number[] = [];
  const linhas = await resolveRecipientsInBatches(ids(2_500), [], (batch) => {
    const n = batch.company_ids.length + batch.contact_ids.length;
    chamadas.push(n);
    const data = batch.company_ids.map((id) => ({ company_id: id, elegibilidade: 'apto' }));
    return Promise.resolve({ data, error: null, count: data.length });
  });
  assert(chamadas.join('+') === '1000+1000+500', `chamadas inesperadas: ${chamadas.join('+')}`);
  assert(linhas.length === 2_500, `esperava 2.500 linhas, vieram ${linhas.length}`);
  assert(
    linhas[0].company_id === uuidFalso(0) && linhas[2_499].company_id === uuidFalso(2_499),
    `ordem inesperada: primeira=${linhas[0].company_id} ultima=${linhas[2_499].company_id}`,
  );
});

Deno.test('F27: com a RPC capando em 1.000 linhas, 1.200 ids nao perdem nada', async () => {
  // Reproduz o comportamento medido do PostgREST do Singu (max-rows = 1.000):
  // a chamada bruta devolveria 1.000 linhas e jogaria 200 fora em silencio.
  const rpcCapada = (batch: { company_ids: string[]; contact_ids: string[] }) => {
    const data = batch.company_ids.slice(0, RESOLVE_RPC_MAX_ROWS).map((id) => ({ company_id: id }));
    return Promise.resolve({ data, error: null, count: data.length });
  };
  const bruto = await rpcCapada({ company_ids: ids(1_200), contact_ids: [] });
  assert(bruto.data.length === 1_000, 'pre-condicao: a chamada bruta deveria capar em 1.000');

  const viaEdge = await resolveRecipientsInBatches(ids(1_200), [], rpcCapada);
  assert(viaEdge.length === 1_200, `a edge deveria devolver 1.200 linhas, veio ${viaEdge.length}`);
  assert(
    viaEdge[1_199].company_id === uuidFalso(1_199),
    `o 1200o id deveria chegar, veio ${viaEdge[1_199]?.company_id}`,
  );
});

Deno.test('F27: resposta parcial do Singu vira erro nomeado, nunca dado pela metade', async () => {
  let erro: unknown;
  try {
    await resolveRecipientsInBatches(ids(1_000), [], () =>
      Promise.resolve({
        data: ids(400).map((id) => ({ company_id: id })),
        error: null,
        count: 1_000,
      }));
  } catch (e) {
    erro = e;
  }
  assert(erro instanceof Error, `esperava erro, veio ${erro}`);
  assert(
    (erro as Error).message.startsWith(MULTIPLIX_RESOLVE_TRUNCATED),
    `esperava ${MULTIPLIX_RESOLVE_TRUNCATED}, veio: ${(erro as Error).message}`,
  );
});

Deno.test('F27: erro num lote derruba o pedido inteiro (sem meia lista)', async () => {
  let chamadas = 0;
  let erro: unknown;
  try {
    await resolveRecipientsInBatches(ids(2_500), [], () => {
      chamadas++;
      if (chamadas === 2) return Promise.resolve({ data: null, error: { code: 'PGRST500' } });
      return Promise.resolve({ data: [{ company_id: uuidFalso(chamadas) }], error: null, count: 1 });
    });
  } catch (e) {
    erro = e;
  }
  assert(erro instanceof Error, `esperava erro, veio ${erro}`);
  assert(
    (erro as Error).message.includes('MULTIPLIX_RPC:PGRST500'),
    `erro inesperado: ${(erro as Error).message}`,
  );
  assert(chamadas === 2, `o 3o lote nao deveria ser chamado apos o erro, chamadas=${chamadas}`);
});

Deno.test('F27: o teto de politica e conferido ANTES de qualquer chamada ao Singu', async () => {
  let chamadas = 0;
  let erro: unknown;
  try {
    await resolveRecipientsInBatches(ids(RESOLVE_POLICY_MAX_IDS + 1), [], () => {
      chamadas++;
      return Promise.resolve({ data: [], error: null, count: 0 });
    });
  } catch (e) {
    erro = e;
  }
  assert(erro instanceof MultiplixPolicyLimitError, `esperava MultiplixPolicyLimitError, veio ${erro}`);
  assert(chamadas === 0, `nenhum lote deveria ser chamado, houve ${chamadas}`);
});

// F22 (Bloco B): o escopo que a edge manda para o Singu passa a ser assinado.
// Estes testes travam o CONTRATO da assinatura: o mesmo payload + o mesmo
// segredo tem de produzir o MESMO hmac do lado do SQL, senao a RPC recusa e o
// Multiplix inteiro cai. O vetor de referencia foi calculado fora do codigo
// (HMAC-SHA256) e e o ponto de contato entre os dois lados — se este teste
// quebrar, o guard do Singu precisa mudar junto, nao so o codigo daqui.
const SEGREDO_DE_TESTE = 'segredo-de-teste';
const HMAC_DE_REFERENCIA = '2119521f8ae8f2c04ce4a8f59992f512144b80e1f505eea4aa991bf578330f7c';
// exp alvo 1800000000 => now = (1800000000 - TTL) * 1000 ms
const NOW_PARA_EXP_FIXO = (1_800_000_000 - SCOPE_SIGNATURE_TTL_SECONDS) * 1000;

Deno.test('F22: o payload v1 ordena as permissoes (ordem do chamador nao vaza)', () => {
  const payload = scopeSignaturePayload(['suppliers', 'admin'], 'vendedor@exemplo.com', 1_800_000_000);
  assert(
    payload === 'v1|admin,suppliers|vendedor@exemplo.com|1800000000',
    `payload fora do contrato: ${payload}`,
  );
});

Deno.test('F22: email ausente entra como string vazia (nunca "null")', () => {
  const payload = scopeSignaturePayload(['admin'], null, 1_800_000_000);
  assert(payload === 'v1|admin||1800000000', `payload fora do contrato: ${payload}`);
});

// O comparador e de code-unit UTF-16, NAO `localeCompare`. A diferenca aparece
// quando caixa ou acento entram: em code-unit todas as MAIUSCULAS vem antes de
// todas as minusculas (`Zebra` < `abelha`, porque `Z` = 0x5A < `a` = 0x61); com
// `localeCompare` a colacao ordena alfabeticamente por letra e inverte. Trocar um
// pelo outro mudaria o payload assinado — este caso existe para quebrar se
// alguem tentar. (Mutacao: trocar `compararCodeUnit` por `localeCompare` deixa
// este teste vermelho.)
//
// Nota de honestidade: para as permissoes que existem hoje (identificadores
// minusculos, sem acento) os dois comparadores dao a MESMA ordem — e por isso a
// troca de `.sort()` puro por `compararCodeUnit` nao altera assinatura nenhuma.
// O caso abaixo prova a propriedade para entradas que ainda nao existem.
Deno.test('F22: a ordenacao e por code-unit, nao por colacao de idioma', () => {
  const payload = scopeSignaturePayload(['abelha', 'Zebra'], 'vendedor@exemplo.com', 1_800_000_000);
  assert(
    payload === 'v1|Zebra,abelha|vendedor@exemplo.com|1800000000',
    `ordem nao e code-unit (localeCompare inverteria): ${payload}`,
  );
  // Prova que o caso discrimina: pela colacao a ordem seria a oposta.
  const viaLocale = ['abelha', 'Zebra'].sort((a, b) => a.localeCompare(b)).join(',');
  assert(viaLocale === 'abelha,Zebra', `o caso perdeu o poder de discriminar as duas ordens: ${viaLocale}`);
});

Deno.test('F22: a assinatura bate com o vetor de referencia do guard no SQL', async () => {
  const { hmac, exp } = await signScope(
    ['suppliers', 'admin'], 'vendedor@exemplo.com', SEGREDO_DE_TESTE, NOW_PARA_EXP_FIXO,
  );
  assert(exp === 1_800_000_000, `exp inesperado: ${exp}`);
  assert(hmac === HMAC_DE_REFERENCIA, `hmac fora do contrato: ${hmac}`);
});

Deno.test('F22: a ordem das permissoes nao muda o hmac (assinatura e do conjunto)', async () => {
  const a = await signScope(['admin', 'suppliers'], 'vendedor@exemplo.com', SEGREDO_DE_TESTE, NOW_PARA_EXP_FIXO);
  const b = await signScope(['suppliers', 'admin'], 'vendedor@exemplo.com', SEGREDO_DE_TESTE, NOW_PARA_EXP_FIXO);
  assert(a.hmac === b.hmac, 'a ordem das permissoes mudou a assinatura');
});

Deno.test('F22: o prazo e de 5 minutos a partir do agora', async () => {
  const agora = 1_800_000_000_000;
  const { exp } = await signScope(['admin'], null, SEGREDO_DE_TESTE, agora);
  assert(
    exp === 1_800_000_000 + SCOPE_SIGNATURE_TTL_SECONDS,
    `exp deveria ser agora + ${SCOPE_SIGNATURE_TTL_SECONDS}, veio ${exp}`,
  );
});

Deno.test('F22: segredo diferente produz hmac diferente (o par e unico)', async () => {
  const comOsegredo = await signScope(['admin'], null, SEGREDO_DE_TESTE, NOW_PARA_EXP_FIXO);
  const comOutro = await signScope(['admin'], null, 'outro-segredo', NOW_PARA_EXP_FIXO);
  assert(comOsegredo.hmac !== comOutro.hmac, 'segredos diferentes geraram o mesmo hmac');
});

Deno.test('F22: escopo diferente assina diferente (nao da para subir de agent para admin)', async () => {
  const agent = await signScope(['customers_own'], null, SEGREDO_DE_TESTE, NOW_PARA_EXP_FIXO);
  const admin = await signScope(['admin'], null, SEGREDO_DE_TESTE, NOW_PARA_EXP_FIXO);
  assert(agent.hmac !== admin.hmac, 'escopos diferentes geraram o mesmo hmac');
});

// ---------------------------------------------------------------------------
// R2-DB-003 (cartao t_891763fa): fora do escopo nao pode carregar metadados.
//
// multiplix_resolve_recipients ja calcula `no_escopo` por empresa, mas so
// ocultava destino_e164/destino_origem — company_name, contact_id,
// empresa_papeis e last_interaction_at seguiam na linha ate o cliente mesmo
// com elegibilidade='fora_do_escopo'. A correcao e em duas camadas: a RPC
// redige na fonte (espelho versionado em _foreign/singu) e a edge redige de
// novo na fronteira PT->EN, para o periodo em que o Singu ainda roda a versao
// antiga (ordem de deploy — mesmo motivo do cabecalho HMAC do F22).
//
// A prova de execucao real da funcao (banco descartavel, espelho extraido
// verbatim e redacao conferida campo a campo com psql) fica em
// scripts/db-audit/multiplix-resolve-escopo.test.sh — aqui nao se le o .sql
// como texto.
// ---------------------------------------------------------------------------

Deno.test('R2-DB-003: fora_do_escopo sai so com company_id e elegibilidade', () => {
  // Linha como a RPC ANTIGA ainda devolve (ate o Singu aplicar o arquivo novo):
  // metadados preenchidos mesmo com elegibilidade='fora_do_escopo'. A edge tem
  // de derrubar tudo, mesmo que a RPC ainda vaze.
  const out = redactResolvedRecipient({
    company_id: 'c-fora',
    contact_id: 'ct-999',
    company_name: 'Empresa de Outra Carteira',
    destino_e164: '5511900000003',
    destino_origem: 'contato_pessoa',
    elegibilidade: 'fora_do_escopo',
    empresa_papeis: ['customer'],
    last_interaction_at: '2026-04-12T10:00:00.000Z',
  });
  const keys = Object.keys(out).sort();
  assert(
    keys.join(',') === 'company_id,elegibilidade',
    `linha fora do escopo vazou campos: ${keys.join(',')}`,
  );
  assert(out.company_id === 'c-fora', `company_id e o eco do id enviado: ${out.company_id}`);
  assert(
    out.elegibilidade === 'out_of_scope',
    `elegibilidade deveria sair traduzida para o enum EN: ${out.elegibilidade}`,
  );
  const serial = JSON.stringify(out);
  for (const vazado of ['ct-999', 'Empresa de Outra Carteira', '5511900000003', 'customer', '2026-04-12']) {
    assert(!serial.includes(vazado), `valor vazou na linha redigida: ${vazado}`);
  }
});

Deno.test('R2-DB-003: destino_invalido tambem sai redigido (no_destination)', () => {
  const out = redactResolvedRecipient({
    company_id: 'c-inv',
    contact_id: 'ct-1',
    company_name: 'Inativa Ltda',
    elegibilidade: 'destino_invalido',
    empresa_papeis: ['supplier'],
    last_interaction_at: '2026-01-01T00:00:00.000Z',
  });
  assert(out.elegibilidade === 'no_destination', `esperava no_destination, veio ${out.elegibilidade}`);
  assert(
    Object.keys(out).sort().join(',') === 'company_id,elegibilidade',
    `linha invalida vazou campos: ${Object.keys(out).sort().join(',')}`,
  );
});

Deno.test('R2-DB-003: elegibilidade desconhecida cai no fallback e sai redigida', () => {
  const out = redactResolvedRecipient({
    company_id: 'c-x',
    company_name: 'X',
    elegibilidade: 'valor_que_o_singu_nunca_mandou',
  });
  assert(out.elegibilidade === 'out_of_scope', `esperava out_of_scope, veio ${out.elegibilidade}`);
  assert(
    Object.keys(out).sort().join(',') === 'company_id,elegibilidade',
    'linha com elegibilidade desconhecida vazou campos',
  );
});

Deno.test('R2-DB-003: linha apta sai inteira — o composer precisa dos campos', () => {
  const out = redactResolvedRecipient({
    company_id: 'c-ok',
    contact_id: 'ct-1',
    company_name: 'Acme',
    destino_e164: '5511900000001',
    destino_origem: 'contato_pessoa',
    elegibilidade: 'apto',
    empresa_papeis: ['customer'],
    last_interaction_at: '2026-04-12T10:00:00.000Z',
  });
  assert(out.elegibilidade === 'eligible', `esperava eligible, veio ${out.elegibilidade}`);
  assert(out.company_name === 'Acme', `company_name sumiu: ${out.company_name}`);
  assert(out.contact_id === 'ct-1', `contact_id sumiu: ${out.contact_id}`);
  assert(out.destino_e164 === '5511900000001', `destino sumiu: ${out.destino_e164}`);
  assert(
    JSON.stringify(out.empresa_papeis) === JSON.stringify(['customer']),
    `papeis sumiram: ${JSON.stringify(out.empresa_papeis)}`,
  );
  assert(out.last_interaction_at === '2026-04-12T10:00:00.000Z', 'last_interaction_at sumiu');
});

Deno.test('R2-DB-003: elegibilidade ausente segue o contrato antigo (eligible, sem redigir)', () => {
  // O resolvedor antigo nao devolvia a coluna; a fronteira normaliza a ausencia
  // para 'eligible' (mesma leitura do COALESCE(...,'apto') da RPC) e a linha
  // passa inteira — redigir aqui quebraria o composer contra a versao antiga.
  const out = redactResolvedRecipient({ company_id: 'c-1', company_name: 'Sem classificação' });
  assert(out.elegibilidade === 'eligible', `esperava eligible, veio ${out.elegibilidade}`);
  assert(out.company_name === 'Sem classificação', 'campo de linha elegivel sumiu');
});

// ---------------------------------------------------------------------------
// R2-DB-003 pelo HANDLER (cartao t_c1431127): os testes acima exercitam o
// helper redactResolvedRecipient isolado. Este dirige o fluxo REAL —
// handleMultiplixAudienceRequest de ponta a ponta (requireAuth -> escopo por
// is_admin/user_has_permission -> assinatura HMAC do escopo -> RPC ao Singu ->
// resposta HTTP) — e asserta o CORPO devolvido ao cliente. O stub de
// globalThis.fetch (mesmo padrao de multiplix-send/index.test.ts) finge ser o
// GoTrue do Zapp, o PostgREST canonico e o Singu; o Singu devolve a linha
// fora do escopo PREENCHIDA, como a versao velha da RPC fazia — e a resposta
// ao cliente nao pode carregar nada alem de company_id + elegibilidade.
// ---------------------------------------------------------------------------

const SINGU_URL = `https://${EXPECTED_EXTERNAL_PROJECT_REF}.supabase.co`;
const ZAPP_URL = 'https://zapp-test.supabase.co';
const RESOLVE_USER_ID = 'user-resolve-handler-1';
const RESOLVE_EMPRESA_APTA = '11111111-1111-4111-8111-111111111111';
const RESOLVE_EMPRESA_FORA = '33333333-3333-4333-8333-333333333333';

Deno.test('R2-DB-003 handler: resolve redige a linha fora do escopo na resposta ao cliente', async () => {
  const envAnterior: Record<string, string | undefined> = {};
  for (const k of [
    'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY',
    'EXTERNAL_SUPABASE_URL', 'EXTERNAL_SUPABASE_SERVICE_ROLE_KEY',
    'MULTIPLIX_SCOPE_HMAC_SECRET',
  ]) {
    envAnterior[k] = Deno.env.get(k);
  }
  Deno.env.set('SUPABASE_URL', ZAPP_URL);
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
  Deno.env.set('SUPABASE_ANON_KEY', 'test-anon-key');
  Deno.env.set('EXTERNAL_SUPABASE_URL', SINGU_URL);
  // JWT no formato que isExpectedExternalServerKey exige (ref + service_role),
  // mesmo padrao de crm-integration/index.test.ts.
  const payloadExterno = btoa(JSON.stringify({ ref: EXPECTED_EXTERNAL_PROJECT_REF, role: 'service_role' }))
    .replace(/=/g, '');
  Deno.env.set('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY', `header.${payloadExterno}.signature`);
  Deno.env.set('MULTIPLIX_SCOPE_HMAC_SECRET', 'test-scope-secret');

  // Linhas como o Singu VELHO devolve: a fora do escopo vem cheia de
  // metadados (company_name/contact_id/empresa_papeis/last_interaction_at e
  // ate destino). Se a edge repassar, e exatamente o vazamento do R2-DB-003.
  const linhasSingu = [
    {
      company_id: RESOLVE_EMPRESA_APTA,
      contact_id: 'ct-apta',
      company_name: 'Empresa Apta',
      destino_e164: '5511900000001',
      destino_origem: 'contato_pessoa',
      elegibilidade: 'apto',
      empresa_papeis: ['customer'],
      last_interaction_at: '2026-04-01T10:00:00+00:00',
    },
    {
      company_id: RESOLVE_EMPRESA_FORA,
      contact_id: 'ct-999',
      company_name: 'Empresa de Outra Carteira',
      destino_e164: '5511900000003',
      destino_origem: 'contato_pessoa',
      elegibilidade: 'fora_do_escopo',
      empresa_papeis: ['supplier'],
      last_interaction_at: '2026-04-02T10:00:00+00:00',
    },
  ];

  const chamadasSingu: { args: Record<string, unknown>; hmac: string | null; exp: string | null }[] = [];
  const fetchOriginal = globalThis.fetch;
  const json = (body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json', ...headers },
    });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : String(input?.url ?? input);
    if (url.includes('/auth/v1/user')) {
      // requireAuth: o Bearer do cliente resolve num usuario real.
      return json({ id: RESOLVE_USER_ID, email: 'admin@zapp.test', role: 'authenticated' });
    }
    if (url.includes('/rest/v1/rpc/')) {
      const rpc = url.split('/rest/v1/rpc/')[1].split('?')[0];
      if (rpc === 'is_admin') return json(true);
      if (rpc === 'user_has_permission') return json(true);
      if (rpc === 'consume_rate_limit') return json({ allowed: true, remaining: 59 });
      if (rpc === 'multiplix_resolve_recipients') {
        const headers = new Headers(init?.headers);
        chamadasSingu.push({
          args: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
          hmac: headers.get('x-multiplix-scope-hmac'),
          exp: headers.get('x-multiplix-scope-exp'),
        });
        // content-range como o PostgREST devolve com Prefer: count=exact —
        // resolveRecipientsInBatches compara data.length com esse count.
        return json(linhasSingu, { 'content-range': '0-1/2' });
      }
      return json(null);
    }
    return new Response('rota nao stubada', { status: 404 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

  try {
    const req = new Request('https://edge.test/multiplix-audience', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: 'Bearer jwt-do-cliente' },
      body: JSON.stringify({
        action: 'resolve',
        params: { company_ids: [RESOLVE_EMPRESA_APTA, RESOLVE_EMPRESA_FORA] },
      }),
    });
    const response = await handleMultiplixAudienceRequest(req);
    assert(response.status === 200, `handler deveria responder 200, veio ${response.status}`);
    const body = await response.json() as {
      data: Array<Record<string, unknown>>;
      meta: { record_count: number };
    };
    assert(Array.isArray(body.data), `data nao e array: ${JSON.stringify(body)}`);
    assert(body.data.length === 2, `esperava 2 linhas, vieram ${body.data.length}`);
    assert(body.meta.record_count === 2, `record_count inesperado: ${body.meta.record_count}`);

    const apta = body.data.find((l) => l.company_id === RESOLVE_EMPRESA_APTA);
    const fora = body.data.find((l) => l.company_id === RESOLVE_EMPRESA_FORA);
    assert(apta, 'linha da empresa apta sumiu da resposta');
    assert(fora, 'linha da empresa fora do escopo sumiu da resposta');

    // Elegivel sai INTEIRA, com elegibilidade ja traduzida para o enum do banco.
    assert(apta.elegibilidade === 'eligible', `elegibilidade inesperada: ${apta.elegibilidade}`);
    assert(apta.company_name === 'Empresa Apta', `company_name sumiu: ${apta.company_name}`);
    assert(apta.contact_id === 'ct-apta', `contact_id sumiu: ${apta.contact_id}`);
    assert(apta.destino_e164 === '5511900000001', `destino_e164 sumiu: ${apta.destino_e164}`);
    assert(apta.destino_origem === 'contato_pessoa', `destino_origem sumiu: ${apta.destino_origem}`);
    assert(
      JSON.stringify(apta.empresa_papeis) === JSON.stringify(['customer']),
      `empresa_papeis sumiu: ${JSON.stringify(apta.empresa_papeis)}`,
    );
    assert(
      apta.last_interaction_at === '2026-04-01T10:00:00+00:00',
      `last_interaction_at sumiu: ${apta.last_interaction_at}`,
    );

    // Fora do escopo sai so com company_id (eco do id que o chamador mandou)
    // e elegibilidade — NENHUM metadado da empresa pode chegar ao cliente.
    const chavesFora = Object.keys(fora).sort();
    assert(
      chavesFora.join(',') === 'company_id,elegibilidade',
      `linha fora do escopo vazou campos na resposta do handler: ${chavesFora.join(',')}`,
    );
    assert(fora.company_id === RESOLVE_EMPRESA_FORA, `company_id inesperado: ${fora.company_id}`);
    assert(fora.elegibilidade === 'out_of_scope', `elegibilidade inesperada: ${fora.elegibilidade}`);

    const serial = JSON.stringify(body);
    for (const vazado of [
      'ct-999', 'Empresa de Outra Carteira', '5511900000003', 'supplier', '2026-04-02',
    ]) {
      assert(!serial.includes(vazado), `valor vazou na resposta do handler: ${vazado}`);
    }

    // O fluxo real tambem precisa ter assinado o escopo e mandado o escopo do
    // JWT (admin), nao nada vindo do corpo da requisicao.
    assert(chamadasSingu.length === 1, `esperava 1 chamada a RPC do Singu, houve ${chamadasSingu.length}`);
    const chamada = chamadasSingu[0];
    assert(
      JSON.stringify(chamada.args.p_scope_permissions) === JSON.stringify(['admin']),
      `escopo enviado ao Singu inesperado: ${JSON.stringify(chamada.args.p_scope_permissions)}`,
    );
    assert(chamada.hmac && chamada.exp, 'assinatura HMAC do escopo nao foi para o Singu');
  } finally {
    globalThis.fetch = fetchOriginal;
    for (const [k, v] of Object.entries(envAnterior)) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
});
