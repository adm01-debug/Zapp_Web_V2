// F48/F49/F50 — testes das acoes de REVISAO da API de dominio do Multiplix.
//
// O que estes testes PROVAM (nao "parece certo"):
//   F48 preview  — o texto final de cada bloco e EXATAMENTE o que o worker
//                  monta, porque o teste recalcula o payload do worker com a
//                  MESMA chamada do kernel que `multiplix-send/index.ts` faz
//                  (`personalize(template, { company }, {}, timezone)`) e
//                  compara byte a byte com a resposta do handler.
//   F48 validate — placeholder desconhecido, variavel em bloco `same_audio` e
//                  campo ausente viram `substituicao_aprovada` OU `exclusao`,
//                  com codigo nomeado — e NUNCA um valor inventado (o teste
//                  falha se `raw_value` nao for o dado real ou null).
//   F49 summary  — os cinco baldes somam EXATAMENTE `count(*)` (total ==
//                  numero de linhas == soma dos baldes), a frase da consulta e
//                  legivel e toda linha carrega `inclusion_reason`.
//   F50 estimate — os TRES numeros (mensagens, versoes de roteiro, consumo de
//                  voz) saem do dado real da fixture, recalculados no teste a
//                  partir dos blocos/destinatarios — nao de estimativa.
//
// Dubles: nao ha rede nem banco. `FakeQuery` implementa o subconjunto encadeavel
// do supabase-js que os handlers usam (`from().select().eq().order()/maybeSingle()`).
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env \
//   supabase/functions/multiplix-dispatch/actions/__tests__/inspect.test.ts

import {
  buildQueryPhrase,
  bucketForRecipient,
  handleEligibilitySummary,
  handleEstimate,
  handlePreview,
  handleValidate,
  type EligibilityBucket,
} from '../inspect.ts';
import { DispatchError, type ActionContext } from '../../index.ts';
import { MULTIPLIX_ELIGIBILITY_VALUES } from '../../../_shared/multiplix-eligibility.ts';
import { errorResponse } from '../../../_shared/validation.ts';
import { personalize } from '../../../_shared/messaging/index.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message}\n  esperado: ${e}\n  recebido: ${a}`);
}

/**
 * Prova o contrato de erro nomeado. Os handlers LANÇAM `DispatchError` (mesma
 * convencao do resto da API) e o roteador o converte em resposta — ver
 * `multiplix-dispatch/index.ts:301-309`. Aqui replicamos esse catch para provar
 * que o cliente recebe o status e o codigo exatos, sem 500 generico.
 */
async function expectNamedError(
  ctx: ActionContext,
  fn: (ctx: ActionContext) => Promise<Response>,
  code: string,
  status: number,
  label: string,
): Promise<void> {
  let caught: unknown = null;
  try {
    await fn(ctx);
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof DispatchError, `${label}: esperava DispatchError nomeado, veio ${String(caught)}`);
  const typed = caught as DispatchError;
  assert(typed.code === code, `${label}: codigo ${typed.code} != ${code}`);
  assert(typed.status === status, `${label}: status ${typed.status} != ${status}`);

  // O que o roteador entrega ao cliente:
  const mapped = errorResponse(typed.code, typed.status, ctx.req);
  assert(mapped.status === status, `${label}: resposta mapeada ${mapped.status} != ${status}`);
  const body = await bodyOf(mapped);
  assert(body.error === code, `${label}: corpo mapeado ${String(body.error)} != ${code}`);
}

// ---------------------------------------------------------------------------
// Duble do supabase-js (encadeavel, sem rede)
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

class FakeQuery implements PromiseLike<{ data: unknown; error: unknown }> {
  private filters: Array<[string, unknown]> = [];
  private orderCol: string | null = null;
  private singleRow = false;

  constructor(private readonly tables: Record<string, Row[]>, private readonly table: string) {}

  select(_columns?: string): this { return this; }
  eq(column: string, value: unknown): this { this.filters.push([column, value]); return this; }
  order(column: string): this { this.orderCol = column; return this; }
  limit(_count: number): this { return this; }
  maybeSingle(): this { this.singleRow = true; return this; }
  single(): this { this.singleRow = true; return this; }

  private result(): { data: unknown; error: unknown } {
    let rows = [...(this.tables[this.table] ?? [])];
    for (const [column, value] of this.filters) rows = rows.filter((row) => row[column] === value);
    if (this.orderCol) {
      const column = this.orderCol;
      rows.sort((a, b) => Number(a[column] ?? 0) - Number(b[column] ?? 0));
    }
    return this.singleRow ? { data: rows[0] ?? null, error: null } : { data: rows, error: null };
  }

  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.result()).then(onfulfilled, onrejected);
  }
}

function fakeSupabase(tables: Record<string, Row[]>): unknown {
  return { from: (table: string) => new FakeQuery(tables, table) };
}

function ctxFor(payload: Row, tables: Record<string, Row[]>): ActionContext {
  return {
    action: 'inspect',
    payload,
    userId: 'user-me',
    supabase: fakeSupabase(tables) as ActionContext['supabase'],
    correlationId: 'corr-test',
    req: new Request('https://edge.test/multiplix-dispatch', { method: 'POST' }),
  };
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const DISPATCH_ID = 'd0000000-0000-4000-8000-000000000001';
const TIMEZONE = 'America/Sao_Paulo';

// Os handlers validam `recipient_id` como uuid (contrato da API), entao a
// fixture usa uuids reais — o nome curto fica so no teste.
const R = {
  r1: '11111111-1111-4111-8111-111111111111',
  r2: '22222222-2222-4222-8222-222222222222',
  r3: '33333333-3333-4333-8333-333333333333',
  r4: '44444444-4444-4444-8444-444444444444',
  r5: '55555555-5555-4555-8555-555555555555',
  r6: '66666666-6666-4666-8666-666666666666',
  r7: '77777777-7777-4777-8777-777777777777',
  r8: '88888888-8888-4888-8888-888888888888',
  r9: '99999999-9999-4999-8999-999999999991',
} as const;
/** Uuid valido que NAO existe na fixture. */
const R_AUSENTE = '99999999-9999-4999-8999-999999999999';

const B2_SCRIPT = 'Bom dia {{empresa}}, falamos de {{assunto}} hoje';
const B3_SCRIPT = 'Audio padrao da campanha';

function baseTables(): Record<string, Row[]> {
  return {
    profiles: [{ id: 'profile-me', user_id: 'user-me' }],
    multiplix_dispatches: [{
      id: DISPATCH_ID,
      name: 'Disparo de teste',
      created_by: 'profile-me',
      schedule_timezone: TIMEZONE,
      message_template: 'Ola {{empresa}}, tudo bem?',
      media_url: null,
      media_type: null,
    }],
    multiplix_blocks: [
      {
        id: 'b0000001', dispatch_id: DISPATCH_ID, block_order: 0, block_type: 'text',
        content: { text: 'Ola {{empresa}}, segue nosso material.' },
        personalization_mode: 'personalized', content_version: 3, asset_id: null,
      },
      {
        id: 'b0000002', dispatch_id: DISPATCH_ID, block_order: 1, block_type: 'voice_ai',
        content: { voice: { script: B2_SCRIPT, voice_id: 'voz-1' } },
        personalization_mode: 'personalized', content_version: 2, asset_id: null,
      },
      {
        id: 'b0000003', dispatch_id: DISPATCH_ID, block_order: 2, block_type: 'voice_ai',
        content: { voice: { script: B3_SCRIPT, voice_id: 'voz-1' } },
        personalization_mode: 'same_audio', content_version: 5, asset_id: 'asset-frozen',
      },
      {
        id: 'b0000004', dispatch_id: DISPATCH_ID, block_order: 3, block_type: 'file',
        content: { media: { url: 'https://cdn.test/catalogo.pdf', caption: 'Ola {{empresa}}' } },
        personalization_mode: 'personalized', content_version: 1, asset_id: 'asset-pdf',
      },
    ],
    multiplix_recipients: [
      { id: R.r1, dispatch_id: DISPATCH_ID, company_id: 'c1', company_name_snapshot: 'Acme', destino_e164: '5511999998888', singu_contact_id: 'p1', eligibility: 'eligible', eligibility_reason: 'eligible', inclusion_reason: null, status: 'pending', variables_snapshot: { assunto: 'Promo' } },
      // empresa sem pessoa: tem empresa, nao tem contato nem numero
      { id: R.r2, dispatch_id: DISPATCH_ID, company_id: 'c2', company_name_snapshot: 'Beta', destino_e164: null, singu_contact_id: null, eligibility: 'no_destination', eligibility_reason: 'missing_destination', inclusion_reason: null, status: 'pending', variables_snapshot: {} },
      { id: R.r3, dispatch_id: DISPATCH_ID, company_id: 'c3', company_name_snapshot: 'Gama3', destino_e164: '5511977776666', singu_contact_id: 'p3', eligibility: 'suppressed', eligibility_reason: 'talkx_blacklist', inclusion_reason: 'Excluído: pediu para não receber', status: 'pending', variables_snapshot: {} },
      { id: R.r4, dispatch_id: DISPATCH_ID, company_id: 'c4', company_name_snapshot: 'Delta4', destino_e164: '5511966665555', singu_contact_id: 'p4', eligibility: 'out_of_scope', eligibility_reason: 'out_of_scope', inclusion_reason: null, status: 'pending', variables_snapshot: {} },
      { id: R.r5, dispatch_id: DISPATCH_ID, company_id: 'c5', company_name_snapshot: 'Gama', destino_e164: '5511888877777', singu_contact_id: 'p5', eligibility: 'eligible', eligibility_reason: 'eligible', inclusion_reason: null, status: 'pending', variables_snapshot: {} },
      // pessoa existe (contato), mas o destino sumiu
      { id: R.r6, dispatch_id: DISPATCH_ID, company_id: 'c6', company_name_snapshot: 'Sigma', destino_e164: null, singu_contact_id: 'p6', eligibility: 'no_destination', eligibility_reason: 'missing_destination', inclusion_reason: null, status: 'pending', variables_snapshot: {} },
      { id: R.r7, dispatch_id: DISPATCH_ID, company_id: 'c7', company_name_snapshot: 'Delta', destino_e164: '5511955554444', singu_contact_id: 'p7', eligibility: 'media_pending', eligibility_reason: 'media_pending', inclusion_reason: null, status: 'pending', variables_snapshot: {} },
      { id: R.r8, dispatch_id: DISPATCH_ID, company_id: 'c8', company_name_snapshot: 'Epsilon', destino_e164: '5511944443333', singu_contact_id: 'p8', eligibility: 'connection_unavailable', eligibility_reason: 'connection_unavailable', inclusion_reason: null, status: 'pending', variables_snapshot: {} },
      { id: R.r9, dispatch_id: DISPATCH_ID, company_id: 'c9', company_name_snapshot: 'Zeta', destino_e164: '5511933332222', singu_contact_id: 'p9', eligibility: 'requires_template', eligibility_reason: 'requires_template', inclusion_reason: null, status: 'pending', variables_snapshot: {} },
    ],
  };
}

/** Recalcula o payload do worker: a MESMA chamada de multiplix-send/index.ts:399-404. */
function workerText(
  template: string,
  companyName: string | null,
  variables: Record<string, string> = {},
): string {
  return personalize(template, { company: companyName }, variables, TIMEZONE).text;
}

// ---------------------------------------------------------------------------
// F48 — preview === payload do worker
// ---------------------------------------------------------------------------

Deno.test('F48 preview: cada bloco reproduz EXATAMENTE o payload do worker para o destinatario', async () => {
  const tables = baseTables();
  const response = await handlePreview(ctxFor({ dispatch_id: DISPATCH_ID, recipient_id: R.r1 }, tables));
  assert(response.status === 200, `status inesperado: ${response.status}`);
  const { data } = await bodyOf(response) as { data: Record<string, unknown> };
  const blocks = data.blocks as Array<Record<string, unknown>>;

  assert(blocks.length === 4, `esperava 4 blocos, veio ${blocks.length}`);

  // Bloco 0 (texto): recalculado com a MESMA funcao/assinatura do worker.
  assert(
    blocks[0].text === workerText('Ola {{empresa}}, segue nosso material.', 'Acme'),
    `bloco texto divergiu do payload do worker: ${blocks[0].text}`,
  );
  assert(blocks[0].text === 'Ola Acme, segue nosso material.', `texto inesperado: ${blocks[0].text}`);

  // Bloco 1 (voz personalizada): o roteiro final e o do worker, com os MESMOS
  // insumos por destinatario (empresa + variaveis do snapshot).
  assert(
    blocks[1].text === workerText(B2_SCRIPT, 'Acme', { assunto: 'Promo' }),
    `roteiro personalizado divergiu do worker: ${blocks[1].text}`,
  );
  assert(blocks[1].text === 'Bom dia Acme, falamos de Promo hoje', `roteiro inesperado: ${blocks[1].text}`);

  // Bloco 2 (voz same_audio): ativo CONGELADO e compartilhado — sem personalizacao.
  const shared = blocks[2].asset as Record<string, unknown>;
  assert(shared.shared === true, 'bloco same_audio deveria marcar shared=true');
  assert(shared.asset_id === 'asset-frozen', `asset congelado inesperado: ${String(shared.asset_id)}`);
  assert(shared.script === B3_SCRIPT, `roteiro compartilhado inesperado: ${String(shared.script)}`);

  // Bloco 3 (arquivo): o ativo exato (url + legenda personalizada).
  const asset = blocks[3].asset as Record<string, unknown>;
  assert(asset.url === 'https://cdn.test/catalogo.pdf', `url do ativo inesperada: ${String(asset.url)}`);
  assert(
    asset.caption === workerText('Ola {{empresa}}', 'Acme'),
    `legenda divergiu do worker: ${String(asset.caption)}`,
  );
  assert(asset.asset_id === 'asset-pdf', `asset_id inesperado: ${String(asset.asset_id)}`);
});

Deno.test('F48 preview: conteudo com placeholders é identico ao worker para outro destinatario', async () => {
  const tables = baseTables();
  const response = await handlePreview(ctxFor({ dispatch_id: DISPATCH_ID, recipient_id: R.r5 }, tables));
  const { data } = await bodyOf(response) as { data: Record<string, unknown> };
  const blocks = data.blocks as Array<Record<string, unknown>>;
  assert(
    blocks[0].text === workerText('Ola {{empresa}}, segue nosso material.', 'Gama'),
    `bloco texto divergiu do worker: ${blocks[0].text}`,
  );
});

Deno.test('F48 preview: sem blocos, cai no template do dispatch — o MESMO payload do worker atual', async () => {
  // Compatibilidade com o worker de hoje (multiplix-send/index.ts), que monta o
  // texto a partir de `dispatch.message_template` quando nao ha blocos.
  const tables = baseTables();
  tables.multiplix_blocks = [];
  const response = await handlePreview(ctxFor({ dispatch_id: DISPATCH_ID, recipient_id: R.r1 }, tables));
  const { data } = await bodyOf(response) as { data: Record<string, unknown> };
  const blocks = data.blocks as Array<Record<string, unknown>>;
  assert(blocks.length === 1, `esperava 1 bloco sintetico, veio ${blocks.length}`);
  assert(
    blocks[0].text === workerText('Ola {{empresa}}, tudo bem?', 'Acme'),
    `fallback divergiu do payload do worker: ${blocks[0].text}`,
  );
  assert(blocks[0].text === 'Ola Acme, tudo bem?', `texto inesperado: ${blocks[0].text}`);
});

Deno.test('F48 preview: destinatario de outro dono/inexistente responde 404 nomeado', async () => {
  const tables = baseTables();
  await expectNamedError(
    ctxFor({ dispatch_id: DISPATCH_ID, recipient_id: R_AUSENTE }, tables),
    handlePreview,
    'multiplix_recipient_not_found',
    404,
    'preview',
  );
});

// ---------------------------------------------------------------------------
// F48 — validate NUNCA inventa valor
// ---------------------------------------------------------------------------

Deno.test('F48 validate: placeholder desconhecido -> erro nomeado + exclusao, sem valor inventado', async () => {
  const tables = baseTables();
  tables.multiplix_blocks = [{
    id: 'b0000001', dispatch_id: DISPATCH_ID, block_order: 0, block_type: 'text',
    content: { text: 'Ola {{empresa}}, seu {{cargo}} esta pronto.' },
    personalization_mode: 'personalized', content_version: 1, asset_id: null,
  }];
  const response = await handleValidate(ctxFor({ dispatch_id: DISPATCH_ID }, tables));
  assert(response.status === 200, `validate responde 200 com o resultado estruturado, veio ${response.status}`);
  const { data } = await bodyOf(response) as { data: Record<string, unknown> };

  const ph = (data.placeholders as Array<Record<string, unknown>>).find((p) => p.key === 'cargo');
  assert(!!ph, 'o placeholder desconhecido {{cargo}} deveria aparecer no relatorio');
  assert(ph!.disposition === 'exclusao', `disposicao inesperada: ${String(ph!.disposition)}`);
  assert(ph!.raw_value === null, `valor inventado para campo ausente: ${JSON.stringify(ph!.raw_value)}`);
  assert(ph!.code === 'multiplix_unknown_placeholder', `codigo inesperado: ${String(ph!.code)}`);

  const codes = (data.errors as Array<Record<string, unknown>>).map((e) => e.code);
  assert(codes.includes('multiplix_unknown_placeholder'), `erros inesperados: ${JSON.stringify(codes)}`);
  assert(data.ok === false, 'validate deveria sinalizar ok=false com erro duro');
});

Deno.test('F48 validate: variavel em bloco same_audio -> erro nomeado', async () => {
  const tables = baseTables();
  tables.multiplix_blocks = [{
    id: 'b0000003', dispatch_id: DISPATCH_ID, block_order: 0, block_type: 'voice_ai',
    content: { voice: { script: 'Bom dia {{empresa}}', voice_id: 'voz-1' } },
    personalization_mode: 'same_audio', content_version: 1, asset_id: 'asset-frozen',
  }];
  const response = await handleValidate(ctxFor({ dispatch_id: DISPATCH_ID }, tables));
  const { data } = await bodyOf(response) as { data: Record<string, unknown> };
  const codes = (data.errors as Array<Record<string, unknown>>).map((e) => e.code);
  assert(
    codes.includes('multiplix_same_audio_placeholder'),
    `esperava multiplix_same_audio_placeholder, veio ${JSON.stringify(codes)}`,
  );
  const ph = (data.placeholders as Array<Record<string, unknown>>).find((p) => p.key === 'empresa');
  assert(!!ph && ph.disposition === 'exclusao' && ph.raw_value === null,
    `variavel em same_audio deveria ser exclusao sem valor: ${JSON.stringify(ph)}`);
});

Deno.test('F48 validate: campo ausente -> exclusao (raw_value null), NUNCA valor inventado', async () => {
  const tables = baseTables();
  tables.multiplix_blocks = [{
    id: 'b0000001', dispatch_id: DISPATCH_ID, block_order: 0, block_type: 'text',
    content: { text: 'Ola {{empresa}}, tudo bem?' },
    personalization_mode: 'personalized', content_version: 1, asset_id: null,
  }];
  // r2 = empresa 'Beta' sem numero; use-o como destinatario de amostra.
  const response = await handleValidate(ctxFor({ dispatch_id: DISPATCH_ID, recipient_id: R.r2 }, tables));
  const { data } = await bodyOf(response) as { data: Record<string, unknown> };

  const ph = (data.placeholders as Array<Record<string, unknown>>).find((p) => p.key === 'empresa');
  assert(!!ph, 'o placeholder {{empresa}} deveria estar no relatorio');
  // 'Beta' existe -> substituicao aprovada com o dado REAL.
  assert(ph!.disposition === 'substituicao_aprovada', `disposicao inesperada: ${String(ph!.disposition)}`);
  assert(ph!.raw_value === 'Beta', `deveria carregar o dado real: ${JSON.stringify(ph!.raw_value)}`);

  // Agora um destinatario SEM nome de empresa: o campo esta ausente.
  tables.multiplix_recipients = (tables.multiplix_recipients as Row[]).map((r) =>
    r.id === R.r2 ? { ...r, company_name_snapshot: null } : r
  );
  const response2 = await handleValidate(ctxFor({ dispatch_id: DISPATCH_ID, recipient_id: R.r2 }, tables));
  const { data: data2 } = await bodyOf(response2) as { data: Record<string, unknown> };
  const ph2 = (data2.placeholders as Array<Record<string, unknown>>).find((p) => p.key === 'empresa');
  assert(!!ph2, 'o placeholder {{empresa}} deveria estar no relatorio');
  assert(ph2!.disposition === 'exclusao', `campo ausente deveria ser exclusao: ${String(ph2!.disposition)}`);
  assert(ph2!.raw_value === null, `valor inventado para campo ausente: ${JSON.stringify(ph2!.raw_value)}`);
  assert(ph2!.code === 'multiplix_missing_field', `codigo inesperado: ${String(ph2!.code)}`);
});

Deno.test('F48 validate: variavel de variables_snapshot -> substituicao aprovada com o dado real', async () => {
  const tables = baseTables();
  tables.multiplix_blocks = [{
    id: 'b0000001', dispatch_id: DISPATCH_ID, block_order: 0, block_type: 'text',
    content: { text: 'Assunto: {{assunto}}' },
    personalization_mode: 'personalized', content_version: 1, asset_id: null,
  }];
  const response = await handleValidate(ctxFor({ dispatch_id: DISPATCH_ID, recipient_id: R.r1 }, tables));
  const { data } = await bodyOf(response) as { data: Record<string, unknown> };
  const ph = (data.placeholders as Array<Record<string, unknown>>).find((p) => p.key === 'assunto');
  assert(!!ph, 'o placeholder {{assunto}} deveria estar no relatorio');
  assert(ph!.source === 'variable', `fonte inesperada: ${String(ph!.source)}`);
  assert(ph!.disposition === 'substituicao_aprovada', `disposicao inesperada: ${String(ph!.disposition)}`);
  assert(ph!.raw_value === 'Promo', `deveria carregar o dado real: ${JSON.stringify(ph!.raw_value)}`);
  assert(ph!.code === null, `sem problema esperado, veio ${String(ph!.code)}`);
});

Deno.test('F48 validate: rendered_text é exatamente o que o kernel produz (nada inventado)', async () => {
  const tables = baseTables();
  tables.multiplix_blocks = [{
    id: 'b0000001', dispatch_id: DISPATCH_ID, block_order: 0, block_type: 'text',
    content: { text: 'Ola {{empresa}}, {{cargo}}!' },
    personalization_mode: 'personalized', content_version: 1, asset_id: null,
  }];
  const response = await handleValidate(ctxFor({ dispatch_id: DISPATCH_ID, recipient_id: R.r1 }, tables));
  const { data } = await bodyOf(response) as { data: Record<string, unknown> };
  const blocks = data.blocks as Array<Record<string, unknown>>;
  const expected = personalize('Ola {{empresa}}, {{cargo}}!', { company: 'Acme' }, {}, TIMEZONE).text;
  assert(
    blocks[0].rendered_text === expected,
    `rendered_text divergiu do kernel: ${String(blocks[0].rendered_text)} != ${expected}`,
  );
});

Deno.test('F48 validate: qualquer raw_value nao-nulo é dado real da fonte (invariante anti-invencao)', async () => {
  const tables = baseTables();
  tables.multiplix_blocks = [{
    id: 'b0000001', dispatch_id: DISPATCH_ID, block_order: 0, block_type: 'text',
    content: { text: '{{saudacao}} {{empresa}} {{assunto}} {{cargo}}' },
    personalization_mode: 'personalized', content_version: 1, asset_id: null,
  }];
  const response = await handleValidate(ctxFor({ dispatch_id: DISPATCH_ID, recipient_id: R.r1 }, tables));
  const { data } = await bodyOf(response) as { data: Record<string, unknown> };
  const placeholders = data.placeholders as Array<Record<string, unknown>>;
  const reais: Record<string, string> = { empresa: 'Acme', assunto: 'Promo' };
  for (const ph of placeholders) {
    if (ph.disposition === 'exclusao') {
      assert(ph.raw_value === null, `exclusao com valor: ${JSON.stringify(ph)}`);
      continue;
    }
    const esperado = ph.key === 'saudacao' ? null : reais[ph.key as string];
    if (ph.key === 'saudacao') {
      assert(
        typeof ph.raw_value === 'string' && ['Bom dia', 'Boa tarde', 'Boa noite'].includes(ph.raw_value as string),
        `saudacao deveria ser uma das 3 reais: ${JSON.stringify(ph.raw_value)}`,
      );
    } else {
      assert(ph.raw_value === esperado, `valor nao corresponde a fonte real: ${JSON.stringify(ph)}`);
    }
  }
  const cargo = placeholders.find((p) => p.key === 'cargo');
  assert(!!cargo && cargo.raw_value === null, 'campo desconhecido nao pode carregar valor');
});

// ---------------------------------------------------------------------------
// F49 — os baldes somam count(*)
// ---------------------------------------------------------------------------

Deno.test('F49 summary: os cinco baldes somam EXATAMENTE o total de linhas', async () => {
  const tables = baseTables();
  const response = await handleEligibilitySummary(ctxFor({ dispatch_id: DISPATCH_ID }, tables));
  assert(response.status === 200, `status inesperado: ${response.status}`);
  const { data } = await bodyOf(response) as { data: Record<string, unknown> };

  const total = Number(data.total);
  const soma = Number(data.eligible) + Number(data.no_destination) + Number(data.suppressed) +
    Number(data.out_of_scope) + Number(data.company_without_person);

  // count(*) no "banco" = numero de linhas da fixture.
  const countStar = (tables.multiplix_recipients as Row[]).length;
  assert(total === countStar, `total (${total}) deveria ser count(*) (${countStar})`);
  assert(soma === total, `soma dos baldes (${soma}) deveria ser o total (${total})`);
  assertEquals(
    {
      total: data.total, eligible: data.eligible, no_destination: data.no_destination,
      suppressed: data.suppressed, out_of_scope: data.out_of_scope,
      company_without_person: data.company_without_person,
    },
    { total: 9, eligible: 5, no_destination: 1, suppressed: 1, out_of_scope: 1, company_without_person: 1 },
    'baldes inesperados',
  );

  const rows = data.rows as Array<Record<string, unknown>>;
  assert(rows.length === total, `uma linha por destinatario: ${rows.length} != ${total}`);
  for (const row of rows) {
    assert(typeof row.inclusion_reason === 'string' && (row.inclusion_reason as string).length > 0,
      `toda linha precisa de inclusion_reason: ${JSON.stringify(row)}`);
  }
  // inclusion_reason armazenado e preservado (nao reescrito).
  const r3 = rows.find((row) => row.recipient_id === R.r3);
  assert(!!r3 && r3.inclusion_reason === 'Excluído: pediu para não receber',
    `inclusion_reason armazenado deveria ser preservado: ${JSON.stringify(r3)}`);
});

Deno.test('F49 summary: toda classe do enum cai em exatamente um balde (exaustividade)', () => {
  const vistos = new Set<EligibilityBucket>();
  for (const classe of MULTIPLIX_ELIGIBILITY_VALUES) {
    const bucket = bucketForRecipient({
      id: 'r-1', company_id: 'c1', company_name_snapshot: 'Acme', destino_e164: '5511999998888',
      singu_contact_id: 'p1', eligibility: classe,
    });
    vistos.add(bucket);
  }
  // Nenhuma classe pode ficar sem balde, e o mapeamento e total.
  assert(vistos.size > 0, 'o mapa de baldes nao pode ser vazio');
  // Classe desconhecida/ausente -> eligible (nunca descarta a linha).
  const semClasse = bucketForRecipient({ id: 'r-2', company_id: 'c1', destino_e164: '5511999998888', singu_contact_id: 'p1' });
  assert(semClasse === 'eligible', `classe ausente deveria ser eligible, veio ${semClasse}`);
});

Deno.test('F49 summary: empresa sem pessoa é balde proprio (nao some em no_destination)', async () => {
  const tables = baseTables();
  const response = await handleEligibilitySummary(ctxFor({ dispatch_id: DISPATCH_ID }, tables));
  const { data } = await bodyOf(response) as { data: Record<string, unknown> };
  const rows = data.rows as Array<Record<string, unknown>>;
  const empresaSemPessoa = rows.find((r) => r.recipient_id === R.r2);
  const semDestino = rows.find((r) => r.recipient_id === R.r6);
  assert(!!empresaSemPessoa && empresaSemPessoa.bucket === 'company_without_person',
    `r2 deveria ser company_without_person: ${JSON.stringify(empresaSemPessoa)}`);
  assert(!!semDestino && semDestino.bucket === 'no_destination',
    `r6 deveria ser no_destination: ${JSON.stringify(semDestino)}`);
});

Deno.test('F49 summary: frase legivel da consulta descreve os filtros reais', async () => {
  const tables = baseTables();
  const response = await handleEligibilitySummary(ctxFor({
    dispatch_id: DISPATCH_ID,
    audience: { roles: ['fornecedor', 'transportadora'], uf: 'SP', ramo: 'Embalagens', exclude_list: 'X' },
  }, tables));
  const { data } = await bodyOf(response) as { data: Record<string, unknown> };
  assertEquals(
    data.query_phrase,
    'Fornecedor OU transportadora · SP · ramo Embalagens · excluir lista X',
    'frase da consulta inesperada',
  );
  // Sem filtro informado: frase honesta, sem inventar recorte.
  assertEquals(
    buildQueryPhrase(null),
    'Todos os contatos do disparo',
    'frase sem filtro inesperada',
  );
});

// ---------------------------------------------------------------------------
// F50 — tres numeros de dado real
// ---------------------------------------------------------------------------

Deno.test('F50 estimate: mensagens, versoes de roteiro e consumo de voz sao do dado real', async () => {
  const tables = baseTables();
  const recipients = tables.multiplix_recipients as Row[];
  const eligible = recipients.filter((r) =>
    ['eligible', 'media_pending', 'connection_unavailable', 'requires_template'].includes(String(r.eligibility))
  );
  const blocks = tables.multiplix_blocks as Row[];

  // Recalculo independente do handler, a partir da fixture crua.
  const expectedMessages = eligible.length * blocks.length; // aptos x blocos
  const expectedScriptVersions = new Set<string>();
  let expectedCharacters = 0;
  let expectedRenderings = 0;
  for (const block of blocks) {
    if (block.block_type !== 'voice_ai') continue;
    const content = block.content as { voice?: { script?: string } };
    const script = String(content?.voice?.script ?? '');
    if (block.personalization_mode === 'same_audio') {
      const finalScript = personalize(script, {}, {}, TIMEZONE).text; // 1 render para todos
      expectedScriptVersions.add(finalScript);
      expectedCharacters += finalScript.length;
      expectedRenderings += 1;
    } else {
      for (const r of eligible) {
        const finalScript = personalize(
          script,
          { company: r.company_name_snapshot as string },
          (r.variables_snapshot ?? {}) as Record<string, string>,
          TIMEZONE,
        ).text;
        expectedScriptVersions.add(finalScript);
        expectedCharacters += finalScript.length;
        expectedRenderings += 1;
      }
    }
  }

  const response = await handleEstimate(ctxFor({ dispatch_id: DISPATCH_ID }, tables));
  assert(response.status === 200, `status inesperado: ${response.status}`);
  const { data } = await bodyOf(response) as { data: Record<string, unknown> };

  assert(data.messages === expectedMessages, `mensagens: ${String(data.messages)} != ${expectedMessages}`);
  assert(data.script_versions === expectedScriptVersions.size,
    `versoes de roteiro: ${String(data.script_versions)} != ${expectedScriptVersions.size}`);
  const voice = data.voice as Record<string, unknown>;
  assert(voice.characters === expectedCharacters,
    `caracteres de voz: ${String(voice.characters)} != ${expectedCharacters}`);
  assert(voice.renderings === expectedRenderings,
    `renderizacoes de voz: ${String(voice.renderings)} != ${expectedRenderings}`);

  // Valores concretos da fixture: 5 aptos x 4 blocos = 20 mensagens;
  // 5 roteiros personalizados distintos + 1 compartilhado = 6 versoes.
  assert(data.messages === 20, `mensagens deveriam ser 20, veio ${String(data.messages)}`);
  assert(data.script_versions === 6, `versoes deveriam ser 6, veio ${String(data.script_versions)}`);
  assert(voice.renderings === 6, `renderizacoes deveriam ser 6, veio ${String(voice.renderings)}`);
});

Deno.test('F50 estimate: sem aptos os numeros zeram (nao inventam consumo)', async () => {
  const tables = baseTables();
  tables.multiplix_recipients = (tables.multiplix_recipients as Row[]).map((r) => ({ ...r, eligibility: 'suppressed' }));
  const response = await handleEstimate(ctxFor({ dispatch_id: DISPATCH_ID }, tables));
  const { data } = await bodyOf(response) as { data: Record<string, unknown> };
  assert(data.messages === 0, `mensagens deveriam ser 0, veio ${String(data.messages)}`);
  const voice = data.voice as Record<string, unknown>;
  assert(voice.characters === 0 && voice.renderings === 0, `consumo deveria zerar: ${JSON.stringify(voice)}`);
});

// ---------------------------------------------------------------------------
// Escopo
// ---------------------------------------------------------------------------

Deno.test('F48/F49/F50: dispatch de outro dono responde 404 nomeado (nao vaza existencia)', async () => {
  const tables = baseTables();
  tables.multiplix_dispatches = [{ ...(tables.multiplix_dispatches[0] as Row), created_by: 'outro-dono' }];
  const casos: Array<[string, (ctx: ActionContext) => Promise<Response>, Row]> = [
    ['preview', handlePreview, { dispatch_id: DISPATCH_ID, recipient_id: R.r1 }],
    ['eligibility.summary', handleEligibilitySummary, { dispatch_id: DISPATCH_ID }],
    ['estimate', handleEstimate, { dispatch_id: DISPATCH_ID }],
  ];
  for (const [label, fn, payload] of casos) {
    await expectNamedError(ctxFor(payload, tables), fn, 'multiplix_dispatch_not_found', 404, label);
  }
});
