import { AUDIENCE_CACHE_TTL_MS, fetchAudienceList, mapResolvedRecipients } from './index.ts';

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
