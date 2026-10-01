import {
  AUDIENCE_CACHE_TTL_MS,
  fetchAudienceList,
  mapResolvedRecipients,
  MULTIPLIX_OVER_POLICY_LIMIT,
  MULTIPLIX_RESOLVE_TRUNCATED,
  MultiplixPolicyLimitError,
  planResolveBatches,
  RESOLVE_POLICY_MAX_IDS,
  RESOLVE_RPC_MAX_ROWS,
  resolveRecipientsInBatches,
  SCOPE_SIGNATURE_TTL_SECONDS,
  scopeSignaturePayload,
  signScope,
} from './index.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// F08 (Bloco A): o navegador deixa de decidir quem recebe. Estes testes cobrem
// a transformacao que a edge aplica na resposta de multiplix_resolve_recipients
// antes de chamar a RPC transacional multiplix_create_draft — o resto do
// contrato (idempotencia por client_request_id, transacao, teto de
// destinatarios) e provado no harness de banco
// (scripts/db-audit/multiplix-rls.test.sh, F08/F17).

Deno.test('F08: só destinatário classificado como apto entra no disparo', () => {
  const mapped = mapResolvedRecipients([
    { company_id: 'c-1', company_name: 'Apta', elegibilidade: 'apto', destino_e164: '5511900000001' },
    { company_id: 'c-2', company_name: 'Inválida', elegibilidade: 'destino_invalido', destino_e164: null },
    { company_id: 'c-3', company_name: 'Fora do escopo', elegibilidade: 'fora_do_escopo', destino_e164: '5511900000003' },
  ]);
  assert(mapped.length === 1, `esperava 1 destinatario, veio ${mapped.length}`);
  assert(mapped[0].company_id === 'c-1', `company_id inesperado: ${mapped[0].company_id}`);
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

Deno.test('F08: sem classificação explícita o destinatário entra como apto', () => {
  // Mesma leitura da RPC (COALESCE(elegibilidade,'apto')): o resolvedor antigo
  // não devolvia a coluna e a linha não pode ser descartada por isso.
  const mapped = mapResolvedRecipients([{ company_id: 'c-1', company_name: 'Sem classificação' }]);
  assert(mapped.length === 1, `esperava 1 destinatario, veio ${mapped.length}`);
  assert(mapped[0].elegibilidade === null, `elegibilidade esperada null, veio ${mapped[0].elegibilidade}`);
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

Deno.test('F08: nenhum destinatário apto → lista vazia (endpoint responde 400)', () => {
  const mapped = mapResolvedRecipients([
    { company_id: 'c-1', elegibilidade: 'fora_do_escopo' },
    { company_id: 'c-2', elegibilidade: 'destino_invalido' },
  ]);
  assert(mapped.length === 0, `esperava lista vazia, veio ${mapped.length}`);
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
