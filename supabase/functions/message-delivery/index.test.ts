import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  deliverOutbound,
  handleMessageDeliveryRequest,
  providerPayload,
  dispatchProviderPost,
  markOutboundPostStarted,
  recordUnclaimedFailure,
  failClaim,
  PROVIDER_POST_TIMEOUT_MS,
  CLAIM_LEASE_SECONDS,
} from './index.ts';
import { resetInstanceTokenCache } from '../_shared/evolution-instance-token.ts';

function assertStatus(actual: number, expected: number) {
  if (actual !== expected) throw new Error(`expected HTTP ${expected}, got ${actual}`);
}

Deno.test('message delivery rejects methods other than POST before reading secrets', async () => {
  const response = await handleMessageDeliveryRequest(new Request('https://edge.invalid', { method: 'GET' }));
  assertStatus(response.status, 405);
});

Deno.test('message delivery rejects unauthenticated callers before reading the body', async () => {
  const response = await handleMessageDeliveryRequest(new Request('https://edge.invalid', {
    method: 'POST', body: 'not-json',
  }));
  assertStatus(response.status, 401);
});

Deno.test('message delivery builds an Evolution poll only from a valid persisted payload', () => {
  const result = providerPayload({
    message_id: 'm', contact_id: 'c', agent_id: 'a', content: '📊 *Enquete:* Preferência',
    message_type: 'poll', media_url: null, caption: null, media_filename: null, media_mimetype: null,
    reply_external_id: null, whatsapp_instance_name: 'main', contact_phone: '5511999999999', claim_token: 't',
  }, null, { name: 'Preferência', values: ['A', 'B'], selectableCount: 1 });
  if (result.path !== '/message/sendPoll/main') throw new Error('wrong poll route');
  if (result.body.number !== '5511999999999') throw new Error('wrong recipient');
});

Deno.test('message delivery rejects a malformed persisted contact payload', () => {
  let rejected = false;
  try {
    providerPayload({
      message_id: 'm', contact_id: 'c', agent_id: 'a', content: '📇 Cartão de contato',
      message_type: 'contact', media_url: null, caption: null, media_filename: null, media_mimetype: null,
      reply_external_id: null, whatsapp_instance_name: 'main', contact_phone: '5511999999999', claim_token: 't',
    }, null, { fullName: '', phoneNumber: 'not-a-phone' });
  } catch { rejected = true; }
  if (!rejected) throw new Error('malformed contact payload was accepted');
});

Deno.test('message delivery builds an Evolution buttons body only from a valid persisted payload', () => {
  const result = providerPayload({
    message_id: 'm', contact_id: 'c', agent_id: 'a', content: '🔘 *Botões:* Escolha',
    message_type: 'buttons', media_url: null, caption: null, media_filename: null, media_mimetype: null,
    reply_external_id: null, whatsapp_instance_name: 'main', contact_phone: '5511999999999', claim_token: 't',
  }, null, {
    title: 'Menu',
    body: 'Escolha uma opção',
    buttons: [
      { type: 'reply', displayText: 'Atendimento', id: 'btn_1' },
      { type: 'url', displayText: 'Ver oferta', url: 'https://loja.example/oferta' },
    ],
  });
  if (result.path !== '/message/sendButtons/main') throw new Error('wrong buttons route');
  if (result.body.number !== '5511999999999') throw new Error('wrong recipient');
  if (result.body.title !== 'Menu') throw new Error('title not forwarded');
  if (result.body.description !== 'Escolha uma opção') throw new Error('body must map to description');
  if (result.body.footer !== ' ') throw new Error('missing footer must become a single space (GO rejects empty)');
  const buttons = result.body.buttons as Record<string, unknown>[];
  if (buttons.length !== 2) throw new Error('buttons not forwarded');
  if (buttons[0].type !== 'reply' || buttons[0].displayText !== 'Atendimento' || buttons[0].id !== 'btn_1') {
    throw new Error('reply button fields not preserved');
  }
  if (buttons[1].type !== 'url' || buttons[1].url !== 'https://loja.example/oferta') {
    throw new Error('CTA URL button fields not preserved');
  }
});

Deno.test('message delivery builds an Evolution list body only from a valid persisted payload', () => {
  const result = providerPayload({
    message_id: 'm', contact_id: 'c', agent_id: 'a', content: '📋 *Lista:* Escolha',
    message_type: 'list', media_url: null, caption: null, media_filename: null, media_mimetype: null,
    reply_external_id: null, whatsapp_instance_name: 'main', contact_phone: '5511999999999', claim_token: 't',
  }, null, {
    body: 'Selecione uma categoria',
    footer: 'Promo Brindes',
    buttonText: 'Ver opções',
    sections: [
      { title: 'Produtos', rows: [{ id: 'row_1', title: 'Smartphones', description: 'Linha completa' }] },
    ],
  });
  if (result.path !== '/message/sendList/main') throw new Error('wrong list route');
  if (result.body.description !== 'Selecione uma categoria') throw new Error('body must map to description');
  if (result.body.footer !== 'Promo Brindes') throw new Error('footer not forwarded');
  if (result.body.buttonText !== 'Ver opções') throw new Error('buttonText not forwarded');
  const sections = result.body.sections as { rows: Record<string, unknown>[] }[];
  if (sections.length !== 1 || sections[0].rows.length !== 1) throw new Error('sections not forwarded');
  const row = sections[0].rows[0];
  if (row.title !== 'Smartphones' || row.description !== 'Linha completa' || row.rowId !== 'row_1') {
    throw new Error('list row must keep title/description and map id to rowId');
  }
});

Deno.test('message delivery rejects malformed persisted interactive payloads', () => {
  const claim = {
    message_id: 'm', contact_id: 'c', agent_id: 'a', content: 'x',
    media_url: null, caption: null, media_filename: null, media_mimetype: null,
    reply_external_id: null, whatsapp_instance_name: 'main', contact_phone: '5511999999999', claim_token: 't',
  };
  const cases: { type: 'buttons' | 'list'; payload: Record<string, unknown>; expected: string }[] = [
    { type: 'buttons', expected: 'invalid_buttons_payload', payload: { body: '', buttons: [{ type: 'reply', displayText: 'Ok' }] } },
    { type: 'buttons', expected: 'invalid_buttons_payload', payload: { body: 'b', buttons: [
      { type: 'reply', displayText: '1' }, { type: 'reply', displayText: '2' },
      { type: 'reply', displayText: '3' }, { type: 'reply', displayText: '4' },
    ] } },
    { type: 'buttons', expected: 'invalid_buttons_payload', payload: { body: 'b', buttons: [{ type: 'url', displayText: 'Abrir', url: 'javascript:alert(1)' }] } },
    { type: 'buttons', expected: 'invalid_buttons_payload', payload: { body: 'b', buttons: [{ type: 'reply' }] } },
    // Evolution só conhece reply/url/call: 'phone' não é tipo aceito.
    { type: 'buttons', expected: 'invalid_buttons_payload', payload: { body: 'b', buttons: [{ type: 'phone', displayText: 'Ligar', phoneNumber: '5511999990001' }] } },
    { type: 'buttons', expected: 'invalid_buttons_payload', payload: { body: 'b', buttons: [{ type: 'call', displayText: 'Ligar' }] } },
    { type: 'buttons', expected: 'invalid_buttons_payload', payload: { body: 'b', buttons: [{ type: 'call', displayText: 'Ligar', phoneNumber: '123' }] } },
    { type: 'buttons', expected: 'invalid_buttons_payload', payload: { body: 'b', buttons: [{ type: 'reply', displayText: 'Ok' }] } },
    { type: 'list', expected: 'invalid_list_payload', payload: { body: 'b', buttonText: 'Ver', sections: [] } },
    { type: 'list', expected: 'invalid_list_payload', payload: { body: 'b', buttonText: 'Ver', sections: [{ title: 'S', rows: [{ title: 'T' }] }] } },
  ];
  for (const { type, payload, expected } of cases) {
    let rejected = '';
    try {
      providerPayload({ ...claim, message_type: type }, null, payload);
    } catch (error) {
      rejected = error instanceof Error ? error.message : 'unknown';
    }
    if (rejected !== expected) {
      throw new Error(`payload ${JSON.stringify(payload)} should fail with ${expected}, got ${rejected || 'accepted'}`);
    }
  }
});

Deno.test('media delivery never turns timeline placeholders into captions and preserves quoted replies', () => {
  const result = providerPayload({
    message_id: 'm', contact_id: 'c', agent_id: 'a', content: '[Imagem]',
    message_type: 'image', media_url: 'https://storage.invalid/image', caption: null,
    media_filename: null, media_mimetype: null, reply_external_id: 'wa-message-id',
    whatsapp_instance_name: 'main', contact_phone: '5511999999999', claim_token: 't',
  }, 'https://signed.invalid/image');
  if ('caption' in result.body) throw new Error('internal media placeholder became a provider caption');
  const quoted = result.body.quoted as { key?: { id?: string } } | undefined;
  if (quoted?.key?.id !== 'wa-message-id') throw new Error('quoted reply metadata was not preserved');
});

// R2-SLA-001 — o SLA de 1ª resposta é gravado pelo trigger
// trg_messages_sla_first_response dentro de complete_outbound_message() quando a
// mensagem vira 'sent'. A RPC mark_first_response chamada daqui era redundante e
// falhava sempre com 42501 (exige auth.uid(); este caminho roda com service_role).
// Guarda de regressão: a chamada não pode voltar. O registro pelo trigger é
// provado em scripts/db-audit/sla-first-response-delivery-contract.test.mjs.
Deno.test('message delivery does not call the redundant mark_first_response RPC', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  if (/\.rpc\(\s*['"]mark_first_response['"]/.test(src)) {
    throw new Error('a RPC mark_first_response não pode ser chamada: o trigger já registra o SLA');
  }
});

// ---------------------------------------------------------------------------
// TRA-002 / E15 (item #18): o envio tem de sair pela credencial da PRÓPRIA
// conexão do claim. A Evolution GO escolhe a instância pelo apikey (o nome no
// path v2 é descartado na tradução), então entregar sem o token da conexão faz
// o envio de uma conexão sair pela instância global — ou falhar fechado.
// ---------------------------------------------------------------------------

function comEnv(vars: Record<string, string | undefined>, fn: () => void | Promise<void>) {
  const anteriores = new Map<string, string | undefined>();
  for (const [chave, valor] of Object.entries(vars)) {
    anteriores.set(chave, Deno.env.get(chave));
    if (valor === undefined) Deno.env.delete(chave); else Deno.env.set(chave, valor);
  }
  const restaurar = () => {
    for (const [chave, valor] of anteriores) {
      if (valor === undefined) Deno.env.delete(chave); else Deno.env.set(chave, valor);
    }
  };
  const resultado = fn();
  if (resultado instanceof Promise) return resultado.finally(restaurar);
  restaurar();
}

function servicoFalso(tokens: Record<string, string | null>) {
  const consultas: string[] = [];
  return {
    consultas,
    rpc: (fn: string, args?: Record<string, unknown>) => {
      if (fn !== 'get_instance_token') throw new Error(`RPC inesperada: ${fn}`);
      const nome = String(args?.p_instance_id ?? '');
      consultas.push(nome);
      return Promise.resolve({ data: tokens[nome] ?? null, error: null });
    },
  };
}

function fetcherEspiao() {
  const chamadas: { url: string; apikey: string }[] = [];
  const fetcher = (url: string, opcoes: RequestInit) => {
    chamadas.push({ url, apikey: (opcoes.headers as Record<string, string>).apikey });
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  };
  return { chamadas, fetcher };
}

Deno.test('TRA-002: message-delivery entrega com o token da PRÓPRIA conexão do claim (sem EVOLUTION_INSTANCE_TOKEN)', async () => {
  resetInstanceTokenCache();
  await comEnv({
    EVOLUTION_API_FLAVOR: 'go',
    EVOLUTION_INSTANCE_NAME: 'principal',
    // critério 2: o envio não pode depender do env — o token vem do Vault
    EVOLUTION_INSTANCE_TOKEN: undefined,
  }, async () => {
    const service = servicoFalso({ secundaria: 'token-da-secundaria' });
    const { chamadas, fetcher } = fetcherEspiao();
    const resposta = await deliverOutbound(
      service, 'https://go.example.com', 'admin-key-global',
      { path: '/message/sendText/secundaria', body: { number: '5511999998888', text: 'oi' } },
      'secundaria', fetcher,
    );
    assertEquals(service.consultas, ['secundaria'], 'o token tem de ser resolvido pelo nome da conexão do claim');
    assertEquals(chamadas.length, 1);
    assertEquals(chamadas[0].apikey, 'token-da-secundaria');
    assertEquals(chamadas[0].url, 'https://go.example.com/send/text');
    assertEquals(resposta.status, 200);
  });
});

Deno.test('TRA-002: conexão não-padrão sem token no Vault falha fechado (400, nenhuma rede)', async () => {
  resetInstanceTokenCache();
  await comEnv({
    EVOLUTION_API_FLAVOR: 'go',
    EVOLUTION_INSTANCE_NAME: 'principal',
    EVOLUTION_INSTANCE_TOKEN: 'token-da-global',
  }, async () => {
    const service = servicoFalso({ secundaria: null });
    const { chamadas, fetcher } = fetcherEspiao();
    const resposta = await deliverOutbound(
      service, 'https://go.example.com', 'admin-key-global',
      { path: '/message/sendText/secundaria', body: { number: '5511999998888', text: 'oi' } },
      'secundaria', fetcher,
    );
    assertEquals(chamadas.length, 0, 'sem credencial da conexão nenhum POST pode sair');
    assertEquals(resposta.status, 400);
    assertEquals((await resposta.json()).error, 'instance token ausente');
  });
});

Deno.test('TRA-002: o fallback do env vale só para a instância padrão — e o token do Vault vence', async () => {
  resetInstanceTokenCache();
  await comEnv({
    EVOLUTION_API_FLAVOR: 'go',
    EVOLUTION_INSTANCE_NAME: 'principal',
    EVOLUTION_INSTANCE_TOKEN: 'token-da-global',
  }, async () => {
    const comVault = servicoFalso({ principal: 'token-vault-principal' });
    const semVault = servicoFalso({ principal: null });
    const a = fetcherEspiao();
    const b = fetcherEspiao();
    await deliverOutbound(comVault, 'https://go.example.com', 'admin-key-global',
      { path: '/message/sendText/principal', body: { number: '5511999998888', text: 'oi' } }, 'principal', a.fetcher);
    // zera o cache (isolate quente) para provar o fallback quando o Vault não tem token
    resetInstanceTokenCache('principal');
    await deliverOutbound(semVault, 'https://go.example.com', 'admin-key-global',
      { path: '/message/sendText/principal', body: { number: '5511999998888', text: 'oi' } }, 'principal', b.fetcher);
    assertEquals(a.chamadas[0]?.apikey, 'token-vault-principal');
    assertEquals(b.chamadas[0]?.apikey, 'token-da-global');
  });
});

// ---------------------------------------------------------------------------
// PD-79 (t_ea8decbb): carimbo do POST iniciado + timeout MENOR que o lease.
//
// Antes: o POST ao provedor podia passar dos 90 s do claim. Como o lease vencia
// durante o POST, a linha voltava a ser reivindicável e o MESMO envio saía de novo
// (duplicado no WhatsApp). Também não havia timeout: uma conexão pendurada
// segurava o POST até o runtime matar a edge. Agora: (1) carimba o POST iniciado
// logo antes de disparar, com fencing (id, token); (2) dispara sob
// AbortSignal.timeout(45 s) < lease(90 s); (3) timeout/aborto é resultado AMBÍGUO
// -> linha terminal NÃO retentável + reconciliação somente-leitura (nunca reenvio).
// ---------------------------------------------------------------------------

function rpcEspiao(
  respostas: Record<string, { data?: unknown; error?: { code?: string } | null }> = {},
) {
  const chamadas: { fn: string; args?: Record<string, unknown> }[] = [];
  return {
    chamadas,
    rpc: (fn: string, args?: Record<string, unknown>) => {
      chamadas.push({ fn, args });
      const escolhida = respostas[fn] ?? { data: null, error: null };
      return Promise.resolve({ data: escolhida.data ?? null, error: escolhida.error ?? null });
    },
  };
}

// PD-79: o timeout do POST tem de ser MENOR que o lease, senão o POST pode passar
// do lease e a linha volta a ser reivindicável (reenvio duplicado). A invariante é
// checada dentro do teste que exercita o caminho real do AbortSignal.timeout.
Deno.test('PD-79: POST abortado por timeout é resultado AMBÍGUO e o timeout cabe no lease (nunca reenvio automático)', async () => {
  const leaseMs = CLAIM_LEASE_SECONDS * 1000;
  if (!(PROVIDER_POST_TIMEOUT_MS > 0 && PROVIDER_POST_TIMEOUT_MS < leaseMs)) {
    throw new Error(`timeout ${PROVIDER_POST_TIMEOUT_MS}ms não é menor que o lease ${leaseMs}ms`);
  }
  // deliver que só termina quando o sinal aborta: prova o caminho real do
  // AbortSignal.timeout — o abort chega como TimeoutError e é classificado.
  const resultado = await dispatchProviderPost(
    (signal) => new Promise<Response>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason));
    }),
    1,
  );
  assertEquals(resultado.ok, false);
  assertEquals(resultado.aborted, true);
  assertEquals(resultado.response, null);
});

Deno.test('PD-79: erro de rede no POST não é confundido com abort (os dois são ambíguos)', async () => {
  const resultado = await dispatchProviderPost(() => Promise.reject(new Error('connection reset')));
  assertEquals(resultado.ok, false);
  assertEquals(resultado.aborted, false);
});

Deno.test('PD-79: POST bem-sucedido devolve a resposta do provedor', async () => {
  const resultado = await dispatchProviderPost(
    () => Promise.resolve(new Response(JSON.stringify({ key: { id: 'x' } }), { status: 200 })),
  );
  assertEquals(resultado.ok, true);
  assertEquals(resultado.aborted, false);
  assertEquals(resultado.response?.status, 200);
});

Deno.test('PD-79: entrega ambígua grava transição NÃO retentável no banco', async () => {
  const service = rpcEspiao();
  await failClaim(service, { message_id: 'm', claim_token: 'tok' });
  const chamada = service.chamadas.find((c) => c.fn === 'fail_outbound_message');
  if (!chamada) throw new Error('fail_outbound_message não foi chamada');
  assertEquals(chamada.args?.p_retryable, false);
  assertEquals(chamada.args?.p_claim_token, 'tok');
});

Deno.test('PD-79: o carimbo do POST iniciado usa o token do claim e propaga a recusa da RPC', async () => {
  const service = rpcEspiao({ mark_outbound_post_started: { error: { code: 'P0002' } } });
  const mark = await markOutboundPostStarted(service, 'm', 'tok-do-claim');
  assertEquals(mark.marked, false);
  assertEquals(mark.code, 'P0002');
  assertEquals(service.chamadas[0]?.fn, 'mark_outbound_post_started');
  assertEquals(service.chamadas[0]?.args?.p_claim_token, 'tok-do-claim');
  assertEquals(service.chamadas[0]?.args?.p_message_id, 'm');
});

// ---------------------------------------------------------------------------
// PD-78: o claim vazio não pode ficar mudo. A RPC fail_outbound_unclaimed decide
// o motivo NO BANCO e marca a linha 'failed' (nunca reenvia). O ator é o profile
// que clicou; a RPC resolve o papel (dono ou admin/supervisor ativo). Com lease
// VIVO a RPC recusa (42501) e a linha não é tocada.
// ---------------------------------------------------------------------------

Deno.test('PD-78: claim vazio grava o motivo e devolve o status gravado pela RPC', async () => {
  const service = rpcEspiao({
    fail_outbound_unclaimed: { data: { delivery_failure_reason: 'sem_conexao_conectada' } },
  });
  const failure = await recordUnclaimedFailure(service, 'm1', 'agente-que-clicou');
  assertEquals(failure.recorded, true);
  assertEquals(failure.reason, 'sem_conexao_conectada');
  assertEquals(service.chamadas[0]?.fn, 'fail_outbound_unclaimed');
  assertEquals(service.chamadas[0]?.args?.p_message_id, 'm1');
  assertEquals(service.chamadas[0]?.args?.p_agent_id, 'agente-que-clicou');
});

Deno.test('PD-78: claim vazio com lease VIVO não pisa na linha (RPC recusa 42501)', async () => {
  const service = rpcEspiao({ fail_outbound_unclaimed: { error: { code: '42501' } } });
  const failure = await recordUnclaimedFailure(service, 'm1', 'outro-agente');
  assertEquals(failure.recorded, false);
  assertEquals(failure.code, '42501');
  assertEquals(failure.reason, null);
});
