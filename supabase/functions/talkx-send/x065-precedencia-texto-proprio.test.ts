/**
 * X065 — a precedencia X020 do texto proprio vale TAMBEM com variante ja
 * atribuida no snapshot.
 *
 * Defeito que estas provas fecham: `snapshot_talkx_campaign_audience` atribui
 * variante sempre que o A/B esta ligado e o template tem variantes
 * (20261118190000, `v_ab`) — sem comparar textos. Enquanto `variant_id` nao
 * chegava ao worker a regra X020 era respeitada por acidente: `existingVid` era
 * sempre nulo e so o ramo do sorteio checava a precedencia. Fazer a coluna
 * chegar (20261118210000 + o mapeamento em index.ts) abriria um caminho que
 * ignora a X020 e enviaria o texto da variante a quem editou a mensagem da
 * campanha.
 *
 * Alem do texto enviado, as provas fixam o `p_variant_id` persistido: creditar
 * a variante uma mensagem que ela nao enviou faria `talkx_campaign_variant_stats`
 * contar a resposta na variante errada — o mesmo defeito, do outro lado.
 *
 * Run with: deno test --config scripts/ci/deno.json --frozen --allow-env \
 *   --allow-read --allow-net=127.0.0.1 \
 *   supabase/functions/talkx-send/x065-precedencia-texto-proprio.test.ts
 */
import { handleTalkxSend } from "./index.ts";
import {
  CAMPAIGN_ID, makePost, TEST_CRON_SECRET, installFakeClock,
  makeCampaign, makeContinueRecipients, makeContinueDeps, mockProviderRecording,
} from "./_test-utils.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const TEXTO_DO_TEMPLATE = "Oferta de outubro";
const TEXTO_DA_VARIANTE = "Outubro com desconto";
const VARIANTE_ID = "variante-a";

function setEnv(): void {
  Deno.env.set("SUPABASE_URL", "https://supabase-test.example");
  Deno.env.set("EVOLUTION_API_URL", "https://evolution-test.example");
  Deno.env.set("EVOLUTION_API_KEY", "test-evolution-api-key");
  Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
  Deno.env.set("EVOLUTION_INSTANCE_TOKEN", "test-instance-token");
  Deno.env.set("EVOLUTION_INSTANCE_NAME", "PRINCIPAL");
}

/**
 * Stub da cadeia `.from().select().eq()` do supabase-js, nas tres formas que
 * este caminho usa: `.single()`, `.maybeSingle()` e o await direto (`then`).
 */
interface StubQueryBuilder {
  select: () => StubQueryBuilder;
  eq: () => StubQueryBuilder;
  single: () => Promise<{ data: unknown; error: null }>;
  maybeSingle: () => Promise<{ data: unknown; error: null }>;
  then?: (res: (v: unknown) => unknown) => Promise<unknown>;
}

/** Monta deps com template + variante reais e UM destinatario ja com variante. */
function cenario(
  textoDaCampanha: string,
): { deps: ReturnType<typeof makeContinueDeps>["deps"]; ctx: ReturnType<typeof makeContinueDeps>["ctx"]; restore: () => void } {
  const clock = installFakeClock(1_700_000_000_000);
  const recipients = makeContinueRecipients(1);
  recipients[0].variant_id = VARIANTE_ID;
  const campaign = makeCampaign({
    template_id: "tpl-1",
    message_template: textoDaCampanha,
    ab_enabled: true,
    send_interval_min: 0, send_interval_max: 0, typing_delay_min: 0, typing_delay_max: 0,
  });
  const { deps, ctx } = makeContinueDeps({ recipients, clock, campaign, cronSecret: TEST_CRON_SECRET });

  // O harness base nao conhece estas duas tabelas; aqui elas existem de verdade.
  const originalFrom = deps.supabase.from.bind(deps.supabase);
  deps.supabase.from = (table: string): unknown => {
    if (table === "talkx_templates") {
      const qb: StubQueryBuilder = {
        select: () => qb, eq: () => qb,
        maybeSingle: () => Promise.resolve({ data: { content: TEXTO_DO_TEMPLATE }, error: null }),
        single: () => Promise.resolve({ data: { content: TEXTO_DO_TEMPLATE }, error: null }),
      };
      return qb;
    }
    if (table === "talkx_template_variants") {
      const linha = {
        id: VARIANTE_ID, content: TEXTO_DA_VARIANTE,
        media_url: null, media_type: null, weight: 1,
      };
      const qb: StubQueryBuilder = {
        select: () => qb, eq: () => qb,
        single: () => Promise.resolve({ data: linha, error: null }),
        maybeSingle: () => Promise.resolve({ data: linha, error: null }),
        then: (res: (v: unknown) => unknown) => Promise.resolve({ data: [linha], error: null }).then(res),
      };
      return qb;
    }
    return originalFrom(table);
  };
  return { deps, ctx, restore: () => clock.restore() };
}

function snapshotArgs(ctx: ReturnType<typeof makeContinueDeps>["ctx"]): Record<string, unknown> {
  const chamada = ctx.rpcCalls.find((c) => c.name === "persist_talkx_recipient_message_snapshot");
  assert(chamada !== undefined, `snapshot da mensagem nao foi persistido: ${ctx.rpcCalls.map((c) => c.name).join(",")}`);
  return chamada!.args;
}

Deno.test("X065: texto proprio da campanha vence a variante ja atribuida (X020)", async () => {
  setEnv();
  const { deps, ctx, restore } = cenario("Oferta de novembro");
  const provider = mockProviderRecording();
  try {
    const res = await handleTalkxSend(
      makePost({ cronSecret: TEST_CRON_SECRET, body: { action: "continue", campaignId: CAMPAIGN_ID } }),
      deps,
    );
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  } finally {
    provider.restore();
    restore();
  }

  const args = snapshotArgs(ctx);
  const enviado = String(args.p_personalized_message ?? "");
  assert(
    enviado.includes("Oferta de novembro"),
    `deveria enviar o texto proprio da campanha, enviou: ${enviado}`,
  );
  assert(
    !enviado.includes(TEXTO_DA_VARIANTE),
    `o texto da variante NAO pode sobrepor o texto proprio: ${enviado}`,
  );
  // Nao creditar a variante uma mensagem que ela nao enviou.
  assert(
    args.p_variant_id === null,
    `p_variant_id deveria ir nulo quando o texto proprio vence, veio: ${JSON.stringify(args.p_variant_id)}`,
  );
});

Deno.test("X065: sem texto proprio divergente, a variante atribuida e honrada", async () => {
  setEnv();
  // Mesmo texto do template => nao ha sobreposicao: a variante decide.
  const { deps, ctx, restore } = cenario(TEXTO_DO_TEMPLATE);
  const provider = mockProviderRecording();
  try {
    const res = await handleTalkxSend(
      makePost({ cronSecret: TEST_CRON_SECRET, body: { action: "continue", campaignId: CAMPAIGN_ID } }),
      deps,
    );
    assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  } finally {
    provider.restore();
    restore();
  }

  const args = snapshotArgs(ctx);
  const enviado = String(args.p_personalized_message ?? "");
  assert(
    enviado.includes(TEXTO_DA_VARIANTE),
    `a variante atribuida deveria valer aqui, enviou: ${enviado}`,
  );
  assert(
    args.p_variant_id === VARIANTE_ID,
    `p_variant_id deveria ser a variante atribuida, veio: ${JSON.stringify(args.p_variant_id)}`,
  );
});
