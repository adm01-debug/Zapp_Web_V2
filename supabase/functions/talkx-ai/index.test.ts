/**
 * X076 / TL-063 — provas da edge `talkx-ai` (infra de IA do Talk X).
 *
 * O `ai-proxy` é FALSO e injetado: nenhum teste aqui toca a rede, nenhum
 * provedor real é chamado e nenhuma chave é lida. O banco também é falso, mas
 * com ESTADO que evolui: a trilha que a própria função grava é o que a segunda
 * chamada encontra no cache — um stub que devolvesse sempre a mesma coisa não
 * provaria o cache (nem o teto do mês).
 *
 * Aceite do item (docs/talkx/v4/etapas/F06-...md, X076):
 *  1. flag desligada            → 403 `ai_disabled`
 *  2. teto do mês atingido      → 429 `budget_exceeded`
 *  3. variação que perde {{nome}} → 422
 *  4. mesma entrada duas vezes  → 1 chamada ao proxy
 *  5. o prompt capturado não contém os dígitos de telefone da fixture
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleTalkxAi, sanitizarPrompt, type RespostaDoProxy, type TalkxAiDeps } from "./index.ts";

type Linha = Record<string, unknown>;

/** Telefone e e-mail SINTÉTICOS da fixture (nenhum dado real). */
const TELEFONE_FIXTURE = "(11) 98765-4321";
const DIGITOS_FIXTURE = "98765";
const EMAIL_FIXTURE = "cliente@exemplo.test";

interface EstadoFake {
  settings?: Record<string, unknown>;
  trilha?: Linha[];
  precos?: Linha[];
  callerId?: string | null;
  staff?: boolean;
  erroAoGravar?: { message: string } | null;
  erroAoLerPrecos?: { message: string } | null;
}

/** Fake mínimo do SupabaseClient: filtros de verdade, estado que a função altera. */
function fakeSupabase(estado: EstadoFake) {
  const insercoes: Linha[] = [];
  const settings = estado.settings ?? {};
  const trilha = estado.trilha ?? [];
  const precos = estado.precos ?? [];

  const from = (tabela: string) => {
    const filtros: Array<{ op: "eq" | "in" | "gte"; col: string; val: unknown }> = [];
    let contagemExata = false;
    let ordem: { col: string; asc: boolean } | null = null;
    let teto: number | null = null;
    let intervalo: [number, number] | null = null;

    const resolver = async () => {
      let dados: Linha[];
      if (tabela === "talkx_settings") {
        dados = Object.entries(settings).map(([key, value]) => ({ key, value }));
      } else if (tabela === "talkx_ai_requests") {
        dados = trilha;
      } else if (tabela === "ai_model_prices") {
        if (estado.erroAoLerPrecos) {
          return { data: null, count: null, error: estado.erroAoLerPrecos };
        }
        dados = precos;
      } else {
        return { data: null, count: null, error: { message: `tabela inesperada: ${tabela}` } };
      }

      let linhas = dados.filter((linha) =>
        filtros.every((f) => {
          const v = linha[f.col];
          if (f.op === "eq") return v === f.val;
          if (f.op === "in") return (f.val as unknown[]).includes(v);
          return v !== null && v !== undefined && String(v) >= String(f.val);
        })
      );
      if (ordem) {
        const { col, asc } = ordem;
        linhas = [...linhas].sort((a, b) => (asc ? 1 : -1) * String(a[col]).localeCompare(String(b[col])));
      }
      if (teto !== null) linhas = linhas.slice(0, teto);
      if (intervalo !== null) linhas = linhas.slice(intervalo[0], intervalo[1] + 1);
      if (contagemExata) return { data: null, count: linhas.length, error: null };
      return { data: linhas, count: null, error: null };
    };

    const api = {
      select: (_cols?: string, opcoes?: { count?: string; head?: boolean }) => {
        if (opcoes?.count === "exact") contagemExata = true;
        return api;
      },
      eq: (col: string, val: unknown) => { filtros.push({ op: "eq", col, val }); return api; },
      in: (col: string, val: unknown[]) => { filtros.push({ op: "in", col, val }); return api; },
      gte: (col: string, val: unknown) => { filtros.push({ op: "gte", col, val }); return api; },
      order: (col: string, o?: { ascending?: boolean }) => {
        ordem = { col, asc: o?.ascending !== false };
        return api;
      },
      limit: (n: number) => { teto = n; return api; },
      range: (de: number, ate: number) => { intervalo = [de, ate]; return api; },
      maybeSingle: async () => {
        const r = await resolver();
        return { data: r.data?.[0] ?? null, error: r.error ?? null };
      },
      single: async () => {
        const r = await resolver();
        return { data: r.data?.[0] ?? null, error: r.error ?? null };
      },
      insert: (linha: Linha) => {
        insercoes.push(linha);
        if (!estado.erroAoGravar) trilha.push(linha);
        return {
          select: async () => ({
            data: estado.erroAoGravar ? null : [{ id: "linha-1" }],
            error: estado.erroAoGravar ?? null,
          }),
        };
      },
      then: (ok: (v: unknown) => unknown, err: (e: unknown) => unknown) => resolver().then(ok, err),
    };
    return api;
  };

  const rpc = async (nome: string, _args: Linha) =>
    nome === "is_admin_or_supervisor"
      ? { data: estado.staff ?? true, error: null }
      : { data: null, error: { message: `rpc inesperada: ${nome}` } };

  const auth = {
    getUser: async (_jwt: string) =>
      estado.callerId
        ? { data: { user: { id: estado.callerId } }, error: null }
        : { data: { user: null }, error: { message: "invalid jwt" } },
  };

  const client = { from, rpc, auth } as unknown as SupabaseClient;
  return { client, insercoes };
}

/** Proxy falso: respostas na ordem dada, guardando o payload capturado. */
function proxyFalso(respostas: RespostaDoProxy[]) {
  const chamadas: Array<Record<string, unknown>> = [];
  let i = 0;
  const chamarProxy = async (payload: Record<string, unknown>, _jwt: string) => {
    chamadas.push(payload);
    const resposta = respostas[Math.min(i, respostas.length - 1)];
    i += 1;
    return resposta;
  };
  return { chamarProxy, chamadas };
}

function respostaDoProvedor(conteudo: string, tokensDentro = 10, tokensFora = 20): RespostaDoProxy {
  return {
    status: 200,
    body: {
      model: "modelo-teste",
      choices: [{ message: { role: "assistant", content: conteudo } }],
      usage: { prompt_tokens: tokensDentro, completion_tokens: tokensFora },
    },
  };
}

function pedido(corpo: Linha, comJwt = true): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (comJwt) headers["Authorization"] = "Bearer jwt-teste";
  return new Request("https://exemplo.test/talkx-ai", {
    method: "POST",
    headers,
    body: JSON.stringify(corpo),
  });
}

const TARIFA = {
  model: "modelo-teste",
  unit: "token",
  currency: "USD",
  unit_price: 0.000001,
  valid_from: "2026-01-01T00:00:00.000Z",
  valid_to: null,
  source: "internal",
};

function deps(estado: EstadoFake, respostas: RespostaDoProxy[]) {
  const { client, insercoes } = fakeSupabase(estado);
  const { chamarProxy, chamadas } = proxyFalso(respostas);
  const deps: TalkxAiDeps = {
    supabase: client,
    env: { get: () => undefined },
    chamarProxy,
    agora: () => new Date("2026-10-08T19:00:00.000Z"),
  };
  return { deps, chamadas, insercoes };
}

const PEDIDO_VARIACAO = {
  kind: "message_variation",
  entity_type: "campaign",
  entity_id: "camp-1",
  input: { texto: `Fale com a gente: ${TELEFONE_FIXTURE} / ${EMAIL_FIXTURE}. Olá {{nome}}, tudo bem?` },
};

// ── 1. Flag desligada ────────────────────────────────────────────────────────
Deno.test("X076: flag ai_insights desligada recusa com 403 ai_disabled e não paga o proxy", async () => {
  const t = deps(
    { settings: { ai_insights: false, ai_monthly_budget_usd: 5 }, callerId: "u-1", trilha: [] },
    [respostaDoProvedor("olá")],
  );
  const resposta = await handleTalkxAi(pedido(PEDIDO_VARIACAO), t.deps);
  assertEquals(resposta.status, 403);
  assertEquals((await resposta.json()).reason, "ai_disabled");
  assertEquals(t.chamadas.length, 0, "proxy não pode ser chamado com a flag desligada");
  assertEquals(t.insercoes.length, 0, "recusa não grava trilha");
});

Deno.test("X076: orçamento mensal no padrão (0 = desligado) recusa com 403 ai_disabled", async () => {
  const t = deps(
    { settings: { ai_insights: true, ai_monthly_budget_usd: 0 }, callerId: "u-1", trilha: [] },
    [respostaDoProvedor("olá")],
  );
  const resposta = await handleTalkxAi(pedido(PEDIDO_VARIACAO), t.deps);
  assertEquals(resposta.status, 403);
  assertEquals((await resposta.json()).reason, "ai_disabled");
  assertEquals(t.chamadas.length, 0);
});

// ── 2. Teto do mês ───────────────────────────────────────────────────────────
Deno.test("X076: gasto do mês no teto recusa com 429 budget_exceeded e não paga o proxy", async () => {
  const t = deps(
    {
      settings: { ai_insights: true, ai_monthly_budget_usd: 5, ai_daily_requests_per_user: 20 },
      callerId: "u-1",
      trilha: [
        { input_hash: "a", status: "ok", cost_usd: 3, created_at: "2026-10-02T10:00:00.000Z" },
        { input_hash: "b", status: "ok", cost_usd: 2, created_at: "2026-10-07T10:00:00.000Z" },
      ],
    },
    [respostaDoProvedor("olá")],
  );
  const resposta = await handleTalkxAi(pedido(PEDIDO_VARIACAO), t.deps);
  assertEquals(resposta.status, 429);
  assertEquals((await resposta.json()).reason, "budget_exceeded");
  assertEquals(t.chamadas.length, 0);
});

Deno.test("X076: gasto abaixo do teto passa (o teto não é desligamento geral)", async () => {
  const t = deps(
    {
      settings: { ai_insights: true, ai_monthly_budget_usd: 5, ai_daily_requests_per_user: 20 },
      callerId: "u-1",
      precos: [TARIFA],
      trilha: [{ input_hash: "a", status: "ok", cost_usd: 1, created_at: "2026-10-07T10:00:00.000Z" }],
    },
    [respostaDoProvedor("Olá {{nome}}, tudo bem?")],
  );
  const resposta = await handleTalkxAi(pedido(PEDIDO_VARIACAO), t.deps);
  assertEquals(resposta.status, 200);
  assertEquals(t.chamadas.length, 1);
});

// ── 3. Limite diário por usuário ─────────────────────────────────────────────
Deno.test("X076: limite diário por usuário recusa com 429 user_daily_limit_exceeded", async () => {
  const t = deps(
    {
      settings: { ai_insights: true, ai_monthly_budget_usd: 5, ai_daily_requests_per_user: 2 },
      callerId: "u-1",
      trilha: [
        { input_hash: "a", status: "ok", cost_usd: 0.1, created_by: "u-1", created_at: "2026-10-08T08:00:00.000Z" },
        { input_hash: "b", status: "ok", cost_usd: 0.1, created_by: "u-1", created_at: "2026-10-08T09:00:00.000Z" },
        { input_hash: "c", status: "ok", cost_usd: 0.1, created_by: "u-2", created_at: "2026-10-08T09:30:00.000Z" },
      ],
    },
    [respostaDoProvedor("olá")],
  );
  const resposta = await handleTalkxAi(pedido(PEDIDO_VARIACAO), t.deps);
  assertEquals(resposta.status, 429);
  assertEquals((await resposta.json()).reason, "user_daily_limit_exceeded");
  assertEquals(t.chamadas.length, 0);
});

// ── 4. Saída validada (a chamada paga SEMPRE fica na trilha) ─────────────────
Deno.test("X076: variação que perde {{nome}} volta 422 e a tentativa paga fica na trilha", async () => {
  const t = deps(
    {
      settings: { ai_insights: true, ai_monthly_budget_usd: 5, ai_daily_requests_per_user: 20 },
      callerId: "u-1",
      precos: [TARIFA],
      trilha: [],
    },
    [respostaDoProvedor("Olá, tudo bem?")],
  );
  const resposta = await handleTalkxAi(pedido(PEDIDO_VARIACAO), t.deps);
  assertEquals(resposta.status, 422);
  const corpo = await resposta.json();
  assertEquals(corpo.ok, false);
  assertEquals(corpo.reason, "missing_variable");
  assertEquals(corpo.variaveis, ["{{nome}}"]);
  // A chamada ao proxy JÁ foi paga: a trilha registra o gasto como erro, com
  // output nulo, modelo, tokens e o custo pela tarifa vigente — senão o gasto
  // sairia do teto do mês e do limite diário.
  assertEquals(t.insercoes.length, 1, "saída inválida paga TEM de gravar trilha");
  const linha = t.insercoes[0];
  assertEquals(linha.status, "error");
  assertEquals(linha.output, null);
  assertEquals(linha.model, "modelo-teste");
  assertEquals(linha.tokens_in, 10);
  assertEquals(linha.tokens_out, 20);
  assertEquals(linha.cost_usd, 0.00003);
  assertEquals(linha.created_by, "u-1");
});

Deno.test("X076: saídas inválidas repetidas somam no gasto do mês até o 429 budget_exceeded", async () => {
  const t = deps(
    {
      // Cada tentativa inválida custa 0.00003 (30 tokens × tarifa): a 3ª já
      // nasce com o mês estourado e é recusada ANTES de pagar o proxy.
      settings: { ai_insights: true, ai_monthly_budget_usd: 0.00005, ai_daily_requests_per_user: 20 },
      callerId: "u-1",
      precos: [TARIFA],
      trilha: [],
    },
    [respostaDoProvedor("Olá, tudo bem?")],
  );

  assertEquals((await handleTalkxAi(pedido(PEDIDO_VARIACAO), t.deps)).status, 422);
  assertEquals((await handleTalkxAi(pedido(PEDIDO_VARIACAO), t.deps)).status, 422);
  assertEquals(t.insercoes.length, 2, "cada tentativa paga soma uma linha de erro na trilha");

  const terceira = await handleTalkxAi(pedido(PEDIDO_VARIACAO), t.deps);
  assertEquals(terceira.status, 429);
  assertEquals((await terceira.json()).reason, "budget_exceeded");
  assertEquals(t.chamadas.length, 2, "a terceira recusa acontece ANTES do proxy");
});

// ── 5. Cache por input_hash ──────────────────────────────────────────────────
Deno.test("X076: a mesma entrada duas vezes chama o proxy uma única vez (cache de 24 h)", async () => {
  const t = deps(
    {
      settings: { ai_insights: true, ai_monthly_budget_usd: 5, ai_daily_requests_per_user: 20 },
      callerId: "u-1",
      precos: [TARIFA],
      trilha: [],
    },
    [respostaDoProvedor("Olá {{nome}}, tudo bem por aqui?")],
  );

  const primeira = await handleTalkxAi(pedido(PEDIDO_VARIACAO), t.deps);
  assertEquals(primeira.status, 200);
  const corpo1 = await primeira.json();
  assertEquals(corpo1.cached, false);
  assertEquals(t.chamadas.length, 1);

  const segunda = await handleTalkxAi(pedido(PEDIDO_VARIACAO), t.deps);
  assertEquals(segunda.status, 200);
  const corpo2 = await segunda.json();
  assertEquals(corpo2.cached, true);
  assertEquals(corpo2.output, corpo1.output);
  assertEquals(t.chamadas.length, 1, "a segunda entrada NÃO pode pagar de novo");
  assertEquals(t.insercoes.length, 1, "cache não duplica a trilha");
});

// ── 6. Nenhum dado pessoal no prompt ─────────────────────────────────────────
Deno.test("X076: o prompt capturado não contém telefone nem e-mail da fixture", async () => {
  const t = deps(
    {
      settings: { ai_insights: true, ai_monthly_budget_usd: 5, ai_daily_requests_per_user: 20 },
      callerId: "u-1",
      precos: [TARIFA],
      trilha: [],
    },
    [respostaDoProvedor("Olá {{nome}}, tudo bem?")],
  );
  const resposta = await handleTalkxAi(pedido(PEDIDO_VARIACAO), t.deps);
  assertEquals(resposta.status, 200);

  const prompt = JSON.stringify(t.chamadas[0]);
  assert(!prompt.includes(DIGITOS_FIXTURE), `prompt vazou o telefone da fixture: ${prompt}`);
  assert(!prompt.includes(EMAIL_FIXTURE), `prompt vazou o e-mail da fixture: ${prompt}`);
  assert(prompt.includes("{{nome}}"), "a variável {{nome}} precisa sobreviver à limpeza");
});

Deno.test("X076: sanitizarPrompt troca telefone e e-mail por marcadores (e não mexe em datas)", () => {
  const limpo = sanitizarPrompt(
    `Chame ${TELEFONE_FIXTURE} ou +55 11 98765-4321; escreva para ${EMAIL_FIXTURE} em 2026-10-08.`,
  );
  assert(!limpo.includes(DIGITOS_FIXTURE), limpo);
  assert(!limpo.includes("@"), limpo);
  assert(limpo.includes("[telefone]"), limpo);
  assert(limpo.includes("[email]"), limpo);
  assert(limpo.includes("2026-10-08"), limpo);
});

// ── 7. Caminho feliz completo (trilha + custo) ───────────────────────────────
Deno.test("X076: insight_text feliz grava a trilha com tokens, modelo e custo da tarifa vigente", async () => {
  const t = deps(
    {
      settings: { ai_insights: true, ai_monthly_budget_usd: 5, ai_daily_requests_per_user: 20 },
      callerId: "u-1",
      precos: [TARIFA],
      trilha: [],
    },
    [respostaDoProvedor("As respostas caem às 9h; considere pré-preencher a janela.", 10, 20)],
  );

  const resposta = await handleTalkxAi(
    pedido({
      kind: "insight_text",
      entity_type: "insight",
      entity_id: "ins-1",
      input: { regra: { id: "melhor_faixa", envios: 240, lift_pct: 22 } },
    }),
    t.deps,
  );

  assertEquals(resposta.status, 200);
  const corpo = await resposta.json();
  assertEquals(corpo.ok, true);
  assertEquals(corpo.cached, false);
  assertEquals(corpo.model, "modelo-teste");
  assertEquals(corpo.tokens_in, 10);
  assertEquals(corpo.tokens_out, 20);
  assertEquals(corpo.cost_usd, 0.00003);

  assertEquals(t.insercoes.length, 1);
  const linha = t.insercoes[0];
  assertEquals(linha.kind, "insight_text");
  assertEquals(linha.status, "ok");
  assertEquals(linha.created_by, "u-1");
  assertEquals(linha.tokens_in, 10);
  assertEquals(linha.tokens_out, 20);
  assertEquals(typeof linha.input_hash, "string");
  assertEquals((linha.input_hash as string).length, 64);
});

// ── 8. Portas de entrada ─────────────────────────────────────────────────────
Deno.test("X076: sem JWT é 401 e sem admin/supervisor é 403 — o proxy não é chamado", async () => {
  const semJwt = deps(
    { settings: { ai_insights: true, ai_monthly_budget_usd: 5 }, callerId: "u-1" },
    [respostaDoProvedor("olá")],
  );
  assertEquals((await handleTalkxAi(pedido(PEDIDO_VARIACAO, false), semJwt.deps)).status, 401);
  assertEquals(semJwt.chamadas.length, 0);

  const agente = deps(
    {
      settings: { ai_insights: true, ai_monthly_budget_usd: 5, ai_daily_requests_per_user: 20 },
      callerId: "u-1",
      staff: false,
    },
    [respostaDoProvedor("olá")],
  );
  const resposta = await handleTalkxAi(pedido(PEDIDO_VARIACAO), agente.deps);
  assertEquals(resposta.status, 403);
  assertEquals((await resposta.json()).reason, "forbidden");
  assertEquals(agente.chamadas.length, 0);

  const semKind = deps(
    { settings: { ai_insights: true, ai_monthly_budget_usd: 5 }, callerId: "u-1" },
    [respostaDoProvedor("olá")],
  );
  const invalido = await handleTalkxAi(pedido({ kind: "exportar_tudo", input: {} }), semKind.deps);
  assertEquals(invalido.status, 400);
  assertEquals((await invalido.json()).reason, "invalid_kind");
});

// ── 9. Nada engolido ─────────────────────────────────────────────────────────
Deno.test("X076: trilha que não grava vira 500 — nunca sucesso sem trilha", async () => {
  const t = deps(
    {
      settings: { ai_insights: true, ai_monthly_budget_usd: 5, ai_daily_requests_per_user: 20 },
      callerId: "u-1",
      precos: [TARIFA],
      erroAoGravar: { message: "insert falhou" },
    },
    [respostaDoProvedor("Olá {{nome}}, tudo bem?")],
  );
  const resposta = await handleTalkxAi(pedido(PEDIDO_VARIACAO), t.deps);
  assertEquals(resposta.status, 500);
  assertEquals((await resposta.json()).error, "Internal server error");
});

Deno.test("X076: proxy indisponível vira 502 e a tentativa fica na trilha como erro", async () => {
  const t = deps(
    {
      settings: { ai_insights: true, ai_monthly_budget_usd: 5, ai_daily_requests_per_user: 20 },
      callerId: "u-1",
      precos: [TARIFA],
      trilha: [],
    },
    [{ status: 503, body: { error: "sem provedor" } }],
  );
  const resposta = await handleTalkxAi(pedido(PEDIDO_VARIACAO), t.deps);
  assertEquals(resposta.status, 502);
  assertEquals((await resposta.json()).reason, "proxy_error");
  assertEquals(t.insercoes.length, 1);
  assertEquals(t.insercoes[0].status, "error");
});

Deno.test("X076: corpo 2xx sem conteúdo vira 502 empty_output e a tentativa paga fica na trilha", async () => {
  const t = deps(
    {
      settings: { ai_insights: true, ai_monthly_budget_usd: 5, ai_daily_requests_per_user: 20 },
      callerId: "u-1",
      precos: [TARIFA],
      trilha: [],
    },
    // O provedor respondeu 200 mas sem nenhum conteúdo em choices: o uso pago
    // veio no corpo e TEM de entrar na trilha, senão some do gasto do mês.
    [{
      status: 200,
      body: {
        model: "modelo-teste",
        choices: [],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      },
    }],
  );
  const resposta = await handleTalkxAi(pedido(PEDIDO_VARIACAO), t.deps);
  assertEquals(resposta.status, 502);
  assertEquals((await resposta.json()).reason, "empty_output");
  assertEquals(t.insercoes.length, 1, "a tentativa paga TEM de gravar trilha");
  const linha = t.insercoes[0];
  assertEquals(linha.status, "error");
  assertEquals(linha.output, null);
  assertEquals(linha.model, "modelo-teste");
  assertEquals(linha.tokens_in, 10);
  assertEquals(linha.tokens_out, 20);
  assertEquals(linha.cost_usd, 0.00003);
});

Deno.test("X076: falha ao ler ai_model_prices depois da chamada paga vira custo nulo e grava a trilha", async () => {
  const t = deps(
    {
      settings: { ai_insights: true, ai_monthly_budget_usd: 5, ai_daily_requests_per_user: 20 },
      callerId: "u-1",
      erroAoLerPrecos: { message: "ai_model_prices indisponível" },
      trilha: [],
    },
    [respostaDoProvedor("Olá {{nome}}, tudo bem?")],
  );
  const resposta = await handleTalkxAi(pedido(PEDIDO_VARIACAO), t.deps);
  // Mesmo contrato de "sem tarifa ⇒ nulo": sem a leitura não dá para inventar
  // custo, mas a chamada paga NÃO pode virar 500 sem trilha.
  assertEquals(resposta.status, 200);
  const corpo = await resposta.json();
  assertEquals(corpo.cost_usd, null);
  assertEquals(t.insercoes.length, 1);
  assertEquals(t.insercoes[0].status, "ok");
  assertEquals(t.insercoes[0].cost_usd, null);
  assertEquals(t.insercoes[0].tokens_in, 10);
  assertEquals(t.insercoes[0].tokens_out, 20);
});

Deno.test("X076: trilha da tentativa que não grava vira 500 mesmo quando o proxy falhou", async () => {
  const t = deps(
    {
      settings: { ai_insights: true, ai_monthly_budget_usd: 5, ai_daily_requests_per_user: 20 },
      callerId: "u-1",
      erroAoGravar: { message: "insert falhou" },
      trilha: [],
    },
    [{ status: 503, body: { error: "sem provedor" } }],
  );
  const resposta = await handleTalkxAi(pedido(PEDIDO_VARIACAO), t.deps);
  // A gravação da trilha é conferida em TODO caminho: se falhou, é 500 — nunca
  // um 502 que devolve a falha do proxy escondendo gasto fora da trilha.
  assertEquals(resposta.status, 500);
  assertEquals((await resposta.json()).error, "Internal server error");
});
