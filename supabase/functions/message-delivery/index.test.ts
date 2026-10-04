import { handleMessageDeliveryRequest, providerPayload } from './index.ts';
import { createFakeEvolution } from '../_shared/__tests__/fake-evolution.ts';
import { resetInstanceTokenCache } from '../_shared/evolution-instance-token.ts';

/* eslint-disable @typescript-eslint/no-explicit-any -- mocks estruturais dos
   clients Supabase (SupabaseClient é genérico e não é importável no teste). */

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

// ---------------------------------------------------------------------------
// TRA-002 — claim cuja instância NÃO tem token no Vault.
//
// A mensagem sai pela conexão DO CLAIM; sem o token dela a entrega não pode
// usar a credencial da instância padrão (enviaria o corpo de A como se fosse
// B). O caminho correto é explícito: fail_outbound_message + HTTP 502 e ZERO
// POST ao provedor.
//
// `requireAuth` fica real: SUPABASE_URL aponta para um stub local que responde
// /auth/v1/user (e 404 para o resto — o rate limiter cai no contador local).
// Os clients service/caller vêm por `_injected` (MessageDeliveryDeps).
// ---------------------------------------------------------------------------

Deno.env.delete('EVOLUTION_INSTANCE_NAME');
Deno.env.delete('EVOLUTION_INSTANCE_TOKEN');
Deno.env.set('SUPABASE_ANON_KEY', 'eyJtest.anonkey.fixture');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'eyJtest.servicekey.fixture');
Deno.env.set('EVOLUTION_API_KEY', 'test-evolution-key');

/** Stub Supabase: só /auth/v1/user responde 200; o resto dá 404 (PostgREST/RPC). */
function createSupabaseStub() {
  const server = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, (req) => {
    if (new URL(req.url).pathname === '/auth/v1/user') {
      return new Response(
        JSON.stringify({ id: 'user-1', aud: 'authenticated', role: 'authenticated' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify({ message: 'stub' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  const addr = server.addr;
  if (addr.transport !== 'tcp') throw new Error('supabase stub: esperado listener TCP');
  return { url: `http://127.0.0.1:${addr.port}`, stop: () => server.shutdown() };
}

const CLAIM_SEM_TOKEN = {
  message_id: '11111111-2222-3333-4444-555555555555',
  contact_id: 'contact-1',
  agent_id: 'agent-1',
  content: 'oi',
  message_type: 'text',
  media_url: null,
  caption: null,
  media_filename: null,
  media_mimetype: null,
  reply_external_id: null,
  whatsapp_instance_name: 'loja_sem_token',
  contact_phone: '5511999999999',
  claim_token: 'claim-token-1',
};

function makeServiceClient(ctx: { rpcCalls: { name: string; args?: Record<string, unknown> }[] }): any {
  const profileQuery: any = {};
  profileQuery.select = () => profileQuery;
  profileQuery.eq = () => profileQuery;
  profileQuery.maybeSingle = () =>
    Promise.resolve({ data: { id: 'agent-1', is_active: true }, error: null });
  return {
    from: (table: string) => {
      if (table === 'profiles') return profileQuery;
      throw new Error(`tabela inesperada neste caminho: ${table}`);
    },
    rpc: (name: string, args?: Record<string, unknown>) => {
      ctx.rpcCalls.push({ name, args });
      if (name === 'claim_outbound_message') return Promise.resolve({ data: [CLAIM_SEM_TOKEN], error: null });
      // get_instance_token → null: instância do claim sem credencial no Vault.
      return Promise.resolve({ data: null, error: null });
    },
  };
}

Deno.test('TRA-002: claim sem token no Vault faz failClaim + 502 e NÃO posta no provedor', async () => {
  resetInstanceTokenCache();
  const authStub = createSupabaseStub();
  const fake = createFakeEvolution();
  Deno.env.set('SUPABASE_URL', authStub.url);
  Deno.env.set('EVOLUTION_API_URL', fake.url);
  try {
    const ctx = { rpcCalls: [] as { name: string; args?: Record<string, unknown> }[] };
    const res = await handleMessageDeliveryRequest(
      new Request('https://edge.test/message-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test.jwt.fixture' },
        body: JSON.stringify({ messageId: CLAIM_SEM_TOKEN.message_id }),
      }),
      { supabase: makeServiceClient(ctx), caller: {} as any },
    );

    assertStatus(res.status, 502);
    const fail = ctx.rpcCalls.find((c) => c.name === 'fail_outbound_message');
    if (!fail) throw new Error(`claim sem credencial deve virar fail_outbound_message: ${JSON.stringify(ctx.rpcCalls)}`);
    if (fail.args?.p_message_id !== CLAIM_SEM_TOKEN.message_id) {
      throw new Error(`fail_outbound_message com message_id errado: ${JSON.stringify(fail.args)}`);
    }
    if (!ctx.rpcCalls.some((c) => c.name === 'get_instance_token')) {
      throw new Error('a edge deve consultar o token da instância no Vault');
    }
    if (fake.posts.length !== 0) {
      throw new Error(`sem credencial nenhum POST pode ir ao provedor: ${JSON.stringify(fake.posts)}`);
    }
  } finally {
    await fake.stop();
    await authStub.stop();
  }
});
