// V02 (PLANO_TALKX_V3_100_ETAPAS_2026-09-29) — integração SEM MOCK contra um
// PostgREST de verdade.
//
// Motivo de existir: os 29 testes Deno do talkx-send mockam a chamada da RPC,
// então nunca poderiam pegar o defeito real — dois overloads de
// public.transition_talkx_campaign ao vivo fazem o PostgREST responder
// HTTP 300 PGRST203 ("Could not choose the best candidate function") para a
// chamada de 2 argumentos que a edge usa em 5 pontos. Este arquivo é rodado
// duas vezes pelo harness bash: com TALKX_EXPECT_AMBIGUOUS=1 (antes da
// migration — tem de ver o PGRST203) e com 0 (depois — tem de ver 200 e o
// ciclo draft -> sending -> paused -> sending -> cancelled).
//
// Sem importar std: o harness roda offline, sem cache de módulo.

const baseUrl = Deno.env.get('TALKX_POSTGREST_URL');
const jwt = Deno.env.get('TALKX_POSTGREST_JWT');
const campaignId = Deno.env.get('TALKX_CAMPAIGN_ID');
const expectAmbiguous = Deno.env.get('TALKX_EXPECT_AMBIGUOUS') === '1';

if (!baseUrl || !jwt || !campaignId) {
  throw new Error(
    'TALKX_POSTGREST_URL, TALKX_POSTGREST_JWT e TALKX_CAMPAIGN_ID são obrigatórios — rode via scripts/db-audit/talkx-transition-overload-postgrest.test.sh',
  );
}

type RpcResult = { status: number; body: unknown };

const headers = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };

async function rpc(body: Record<string, unknown>): Promise<RpcResult> {
  const response = await fetch(`${baseUrl}/rpc/transition_talkx_campaign`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text.length ? JSON.parse(text) : null };
}

async function campaign(): Promise<Record<string, unknown>> {
  const response = await fetch(
    `${baseUrl}/talkx_campaigns?id=eq.${campaignId}&select=status,pause_reason`,
    { headers },
  );
  const rows: unknown = await response.json();
  assert(response.ok, `GET talkx_campaigns respondeu ${response.status}`);
  assert(Array.isArray(rows) && rows.length === 1, `campanha de teste não encontrada`);
  return (rows as Array<Record<string, unknown>>)[0];
}

function field(body: unknown, key: string): unknown {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined;
  return (body as Record<string, unknown>)[key];
}

// A RPC devolve uma linha (SETOF) — o PostgREST serializa como array.
function currentStatus(body: unknown): unknown {
  const row = Array.isArray(body) ? (body as Array<Record<string, unknown>>)[0] : undefined;
  return row?.['current_status'];
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message} — esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(actual)}`);
  }
}

if (expectAmbiguous) {
  // Fase 1: estado de produção ANTES da migration (os dois overloads vivos).
  Deno.test('2 argumentos com dois overloads vivos = PGRST203 (start/pause/cancel quebrados)', async () => {
    const result = await rpc({ p_campaign_id: campaignId, p_action: 'start' });
    assertEqual(result.status, 300, 'o PostgREST deveria recusar por ambiguidade');
    assertEqual(field(result.body, 'code'), 'PGRST203', 'o código deveria ser PGRST203');
    assert(
      String(field(result.body, 'message') ?? '').includes('Could not choose the best candidate function'),
      `mensagem inesperada: ${JSON.stringify(result.body)}`,
    );
  });

  Deno.test('3 argumentos explícitos continuam resolvendo mesmo com os dois overloads', async () => {
    // Ação inválida de propósito: prova que a chamada CHEGOU na função (400 de
    // regra de negócio) sem mudar o estado da campanha, que a fase 2 exige 'draft'.
    const result = await rpc({ p_campaign_id: campaignId, p_action: 'nope', p_pause_reason: null });
    assertEqual(result.status, 400, 'a chamada de 3 argumentos deveria chegar na função');
    assert(
      JSON.stringify(result.body).includes('invalid_talkx_campaign_transition'),
      `esperava a exceção de ação inválida, veio ${JSON.stringify(result.body)}`,
    );
    const current = await campaign();
    assertEqual(current.status, 'draft', 'a campanha não deveria ter mudado de status');
  });
} else {
  // Fase 2: depois da migration — um único overload, o ciclo de vida completo.
  Deno.test('start com 2 argumentos responde 200 e leva draft -> sending', async () => {
    const result = await rpc({ p_campaign_id: campaignId, p_action: 'start' });
    assertEqual(result.status, 200, `start falhou: ${JSON.stringify(result.body)}`);
    assertEqual(currentStatus(result.body), 'sending', 'status após start');
    assertEqual((await campaign()).status, 'sending', 'status no banco após start');
  });

  Deno.test('pause com motivo responde 200, grava pause_reason e leva sending -> paused', async () => {
    const result = await rpc({
      p_campaign_id: campaignId,
      p_action: 'pause',
      p_pause_reason: 'manual',
    });
    assertEqual(result.status, 200, `pause falhou: ${JSON.stringify(result.body)}`);
    assertEqual(currentStatus(result.body), 'paused', 'status após pause');
    const current = await campaign();
    assertEqual(current.status, 'paused', 'status no banco após pause');
    assertEqual(current.pause_reason, 'manual', 'pause_reason não foi gravado');
  });

  Deno.test('retomada com 2 argumentos leva paused -> sending', async () => {
    const result = await rpc({ p_campaign_id: campaignId, p_action: 'start' });
    assertEqual(result.status, 200, `retomada falhou: ${JSON.stringify(result.body)}`);
    assertEqual((await campaign()).status, 'sending', 'status no banco após retomada');
  });

  Deno.test('cancel com 2 argumentos leva sending -> cancelled', async () => {
    const result = await rpc({ p_campaign_id: campaignId, p_action: 'cancel' });
    assertEqual(result.status, 200, `cancel falhou: ${JSON.stringify(result.body)}`);
    assertEqual(currentStatus(result.body), 'cancelled', 'status após cancel');
    assertEqual((await campaign()).status, 'cancelled', 'status no banco após cancel');
  });
}
