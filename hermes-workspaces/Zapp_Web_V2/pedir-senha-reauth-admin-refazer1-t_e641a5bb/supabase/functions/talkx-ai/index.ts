/**
 * talkx-ai — X076 (TL-063): infraestrutura de IA do Talk X.
 *
 * Esta edge é deliberadamente MAGRA: ela não fala com provedor nenhum. Monta o
 * pedido, aplica o teto de custo e grava a trilha, e delega a chamada paga à
 * edge `ai-proxy` (rota, circuito, chave e medição de consumo ficam num só
 * lugar). O `ai-proxy` é injetado em `deps.chamarProxy`, então o teste roda com
 * um proxy FALSO e nenhum teste toca a rede.
 *
 * Regras que valem aqui:
 *  1. RECUSA ANTES DA REDE: flag desligada, teto do mês atingido ou limite
 *     diário do usuário recusam sem chamar o proxy — nada pago, nada gravado.
 *  2. NENHUM DADO PESSOAL NO PROMPT: telefone e e-mail saem da entrada antes de
 *     ela virar prompt (X076: "remove telefone e e-mail do prompt"). A limpeza
 *     só roda na entrada permitida, nunca no texto que volta.
 *  3. CACHE DE 24 h por `input_hash`: a mesma entrada não paga duas vezes.
 *  4. A SAÍDA É VALIDADA antes de voltar: variação que perde uma variável
 *     (`{{nome}}`) não é entregue — mas a chamada paga já aconteceu, então a
 *     tentativa fica na trilha com `status='error'` e o custo conta no teto.
 *  5. TODA GRAVAÇÃO É CONFERIDA: se a trilha (`talkx_ai_requests`) não gravar, a
 *     resposta é erro — sucesso sem trilha é sucesso perdido (é o caminho que
 *     estourou o teto sem ninguém ver).
 *
 * Dependência da trilha de BANCO (fora desta leva — "sem DDL/migration" do
 * plano da 3ª leva): a tabela `talkx_ai_requests` e as chaves
 * `ai_monthly_budget_usd` / `ai_daily_requests_per_user` de `talkx_settings`
 * são criadas lá. Enquanto as chaves não existirem, o padrão do item vale:
 * orçamento 0 = desligado, logo a função recusa com `ai_disabled`.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, internalErrorResponse, jsonResponse, Logger } from "../_shared/validation.ts";
import { calcularCusto, type TarifaDeModelo, type UnidadeCobravel } from "../_shared/ai-usage.ts";

export const KINDS = ["insight_text", "message_variation", "segment_suggestion"] as const;
export type TalkxAiKind = (typeof KINDS)[number];

/** Finalidade declarada ao `ai-proxy` por tipo de pedido (enum do proxy). */
const USE_FOR: Record<TalkxAiKind, "copilot" | "analysis" | "summary"> = {
  insight_text: "summary",
  message_variation: "copilot",
  segment_suggestion: "analysis",
};

const TABELA_TRILHA = "talkx_ai_requests";
const TABELA_AJUSTES = "talkx_settings";
const TABELA_TARIFAS = "ai_model_prices";

const CHAVE_FLAG = "ai_insights";
const CHAVE_ORCAMENTO = "ai_monthly_budget_usd";
const CHAVE_LIMITE_DIARIO = "ai_daily_requests_per_user";

/** Default do item: orçamento 0 = desligado (a IA só liga com teto escolhido). */
const ORCAMENTO_PADRAO_USD = 0;
/** Default do item: 20 pedidos por usuário por dia. */
const LIMITE_DIARIO_PADRAO = 20;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_TEXTO_ENTRADA = 8_000;
/** Página da soma do mês (o PostgREST devolve no máximo 1.000 linhas por resposta). */
const PAGINA_SOMA = 1_000;
/** Teto de páginas da soma do mês: estourar é erro, nunca soma parcial silenciosa. */
const MAX_PAGINAS_SOMA = 20;

export interface RespostaDoProxy {
  status: number;
  body: unknown;
}

export interface TalkxAiDeps {
  supabase: SupabaseClient;
  env: { get: (name: string) => string | undefined };
  /** Chamada à edge `ai-proxy`. Injetada: o teste usa um proxy falso, sem rede. */
  chamarProxy: (payload: Record<string, unknown>, jwt: string) => Promise<RespostaDoProxy>;
  agora?: () => Date;
}

interface Ajustes {
  iaLigada: boolean;
  orcamentoUsd: number;
  limiteDiario: number;
}

// ─── Limpeza de dado pessoal ────────────────────────────────────────────────

/**
 * Remove telefone e e-mail da entrada antes de ela virar prompt.
 *
 * A troca é por MARCADOR, não por remoção: o modelo continua entendendo o
 * formato da mensagem ("fale com a gente no [telefone]") sem receber o número.
 * Datas e variáveis (`{{nome}}`) sobrevivem — só sequências de 8 a 13 dígitos
 * (com ou sem máscara) e endereços de e-mail casam aqui.
 */
export function sanitizarPrompt(texto: string): string {
  return texto
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/(?:\+?55[\s.-]?)?(?:\(?\d{2}\)?[\s.-]?)?\d{4,5}[\s.-]?\d{4}/g, "[telefone]");
}

// ─── Entrada ────────────────────────────────────────────────────────────────

type EntradaValida =
  | { ok: true; kind: "insight_text"; regra: unknown }
  | { ok: true; kind: "message_variation"; texto: string }
  | { ok: true; kind: "segment_suggestion"; pedido: string }
  | { ok: false; reason: string };

/** Só os campos do tipo entram no prompt: o resto do corpo do pedido é ignorado. */
function validarEntrada(kind: TalkxAiKind, input: unknown): EntradaValida {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, reason: "invalid_input" };
  }
  const entrada = input as Record<string, unknown>;

  if (kind === "insight_text") {
    const regra = entrada.regra;
    if (!regra || typeof regra !== "object" || Array.isArray(regra)) {
      return { ok: false, reason: "invalid_input" };
    }
    return { ok: true, kind, regra };
  }

  const campo = kind === "message_variation" ? entrada.texto : entrada.pedido;
  if (typeof campo !== "string" || campo.trim() === "" || campo.length > MAX_TEXTO_ENTRADA) {
    return { ok: false, reason: "invalid_input" };
  }
  return kind === "message_variation"
    ? { ok: true, kind, texto: campo }
    : { ok: true, kind, pedido: campo };
}

function montarPrompt(entrada: EntradaValida & { ok: true }): string {
  const papel =
    "Você apoia um painel interno de campanhas de WhatsApp em português do Brasil. " +
    "Nunca invente número, nome, telefone ou e-mail: use somente o que está na entrada.";

  if (entrada.kind === "insight_text") {
    return `${papel}\n\nA entrada é o JSON de uma regra de análise já calculada no servidor ` +
      `(sem dado pessoal). Escreva uma frase de até 240 caracteres explicando o que a regra ` +
      `mostra e qual ação ela sugere.\n\nRegra:\n${sanitizarPrompt(canonico(entrada.regra))}`;
  }

  if (entrada.kind === "message_variation") {
    return `${papel}\n\nReescreva a mensagem de campanha sem mudar o sentido. Preserve TODAS as ` +
      `variáveis entre chaves duplas (por exemplo {{nome}}) exatamente como estão: não remova, ` +
      `não traduza e não invente variável nova. Devolva apenas o texto reescrito.\n\n` +
      `Mensagem:\n${sanitizarPrompt(entrada.texto)}`;
  }

  return `${papel}\n\nTraduza o pedido em linguagem natural para regras de segmentação ` +
    `permitidas pelo produto (segmento por resposta, por entrega, por período de campanha). ` +
    `Devolva somente JSON, sem comentário e sem texto fora do JSON.\n\nPedido:\n` +
    `${sanitizarPrompt(entrada.pedido)}`;
}

/** JSON canônico (chaves ordenadas) — mesma entrada, mesmo `input_hash`. */
function canonico(valor: unknown): string {
  if (valor === null || typeof valor !== "object") return JSON.stringify(valor) ?? "null";
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(",")}]`;
  const objeto = valor as Record<string, unknown>;
  return `{${Object.keys(objeto).sort().map((chave) => `${JSON.stringify(chave)}:${canonico(objeto[chave])}`).join(",")}}`;
}

async function hashDeEntrada(kind: TalkxAiKind, entrada: EntradaValida & { ok: true }): Promise<string> {
  const bytes = new TextEncoder().encode(`${kind}\n${canonico(entrada)}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Saída ──────────────────────────────────────────────────────────────────

function extrairTexto(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const escolhas = (body as { choices?: unknown }).choices;
  if (!Array.isArray(escolhas) || escolhas.length === 0) return null;
  const mensagem = (escolhas[0] as { message?: { content?: unknown } } | undefined)?.message;
  const conteudo = mensagem?.content;
  return typeof conteudo === "string" && conteudo.trim() !== "" ? conteudo.trim() : null;
}

function extrairUso(body: unknown): { tokensIn: number; tokensOut: number } {
  const uso = (body && typeof body === "object" ? (body as { usage?: unknown }).usage : null) ?? {};
  const dentro = Number((uso as { prompt_tokens?: unknown }).prompt_tokens);
  const fora = Number((uso as { completion_tokens?: unknown }).completion_tokens);
  return {
    tokensIn: Number.isFinite(dentro) && dentro >= 0 ? dentro : 0,
    tokensOut: Number.isFinite(fora) && fora >= 0 ? fora : 0,
  };
}

function extrairModelo(body: unknown): string | null {
  const modelo = body && typeof body === "object" ? (body as { model?: unknown }).model : null;
  return typeof modelo === "string" && modelo !== "" ? modelo : null;
}

type Validacao = { ok: true; output: unknown } | { ok: false; reason: string; variaveis?: string[] };

/** Valida a saída antes de devolver — saída inválida não vira resposta nem trilha. */
function validarSaida(kind: TalkxAiKind, entrada: EntradaValida & { ok: true }, saida: string): Validacao {
  if (kind === "message_variation" && entrada.kind === "message_variation") {
    const esperadas = [...new Set([...entrada.texto.matchAll(/\{\{[^{}]+\}\}/g)].map((m) => m[0]))];
    const faltando = esperadas.filter((variavel) => !saida.includes(variavel));
    if (faltando.length > 0) return { ok: false, reason: "missing_variable", variaveis: faltando };
    return { ok: true, output: saida };
  }

  if (kind === "segment_suggestion") {
    try {
      const objeto: unknown = JSON.parse(saida);
      if (!objeto || typeof objeto !== "object") return { ok: false, reason: "invalid_output" };
      return { ok: true, output: objeto };
    } catch {
      return { ok: false, reason: "invalid_output" };
    }
  }

  return { ok: true, output: saida };
}

// ─── Ajustes, teto e trilha ─────────────────────────────────────────────────

function comoBooleano(valor: unknown, padrao: boolean): boolean {
  if (typeof valor === "boolean") return valor;
  if (typeof valor === "number") return valor !== 0;
  if (typeof valor === "string") return ["true", "1", "sim", "on"].includes(valor.trim().toLowerCase());
  return padrao;
}

function comoNumero(valor: unknown, padrao: number): number {
  const numero = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(numero) ? numero : padrao;
}

async function lerAjustes(supabase: SupabaseClient): Promise<Ajustes> {
  const { data, error } = await supabase
    .from(TABELA_AJUSTES)
    .select("key, value")
    .in("key", [CHAVE_FLAG, CHAVE_ORCAMENTO, CHAVE_LIMITE_DIARIO]);
  if (error) throw new Error(`settings_read_failed: ${error.message}`);

  const mapa = new Map<string, unknown>();
  for (const linha of (data ?? []) as Array<{ key: string; value: unknown }>) {
    mapa.set(linha.key, linha.value);
  }

  return {
    iaLigada: comoBooleano(mapa.get(CHAVE_FLAG), false),
    orcamentoUsd: comoNumero(mapa.get(CHAVE_ORCAMENTO), ORCAMENTO_PADRAO_USD),
    limiteDiario: comoNumero(mapa.get(CHAVE_LIMITE_DIARIO), LIMITE_DIARIO_PADRAO),
  };
}

/**
 * Soma do custo gravado no mês corrente (UTC).
 *
 * Pagina de propósito: o PostgREST devolve no máximo 1.000 linhas por resposta,
 * então uma soma de uma única página subestimaria o gasto e o teto passaria a
 * não valer justamente nos meses de uso intenso. Estourar o teto de páginas é
 * ERRO (fail-closed) — soma parcial silenciosa é o defeito, não a alternativa.
 */
async function gastoDoMes(supabase: SupabaseClient, agora: Date): Promise<number> {
  const inicio = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
  let soma = 0;

  for (let pagina = 0; pagina < MAX_PAGINAS_SOMA; pagina += 1) {
    const de = pagina * PAGINA_SOMA;
    const { data, error } = await supabase
      .from(TABELA_TRILHA)
      .select("cost_usd")
      .gte("created_at", inicio.toISOString())
      .order("created_at", { ascending: true })
      .range(de, de + PAGINA_SOMA - 1);
    if (error) throw new Error(`budget_read_failed: ${error.message}`);

    const linhas = (data ?? []) as Array<{ cost_usd: unknown }>;
    for (const linha of linhas) soma += Number(linha.cost_usd) || 0;
    if (linhas.length < PAGINA_SOMA) return soma;
  }

  throw new Error("budget_read_truncated: a soma do mês não coube no teto de páginas");
}

async function contarUsoDeHoje(supabase: SupabaseClient, usuarioId: string, agora: Date): Promise<number> {
  const inicio = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()));
  const { count, error } = await supabase
    .from(TABELA_TRILHA)
    .select("id", { count: "exact", head: true })
    .eq("created_by", usuarioId)
    .gte("created_at", inicio.toISOString());
  if (error) throw new Error(`daily_count_failed: ${error.message}`);
  return count ?? 0;
}

async function buscarNoCache(supabase: SupabaseClient, inputHash: string, agora: Date): Promise<unknown | null> {
  const desde = new Date(agora.getTime() - CACHE_TTL_MS);
  const { data, error } = await supabase
    .from(TABELA_TRILHA)
    .select("output")
    .eq("input_hash", inputHash)
    .eq("status", "ok")
    .gte("created_at", desde.toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`cache_read_failed: ${error.message}`);
  return (data as { output?: unknown } | null)?.output ?? null;
}

/**
 * Custo da linha pela tarifa VIGENTE (`ai_model_prices`, IA-055).
 *
 * Reusa `calcularCusto` em vez de repetir uma regra de preço: vigência, moeda e
 * "sem tarifa ⇒ nulo, nunca zero" já estão resolvidos lá. A tabela cobra por
 * (modelo, unidade) — não separa entrada de saída —, então a quantidade é a
 * soma dos tokens.
 */
async function custoDoUso(
  supabase: SupabaseClient,
  modelo: string | null,
  tokensIn: number,
  tokensOut: number,
  agora: Date,
  log: Logger,
): Promise<number | null> {
  if (modelo === null) return null;

  const { data, error } = await supabase
    .from(TABELA_TARIFAS)
    .select("model, unit, currency, unit_price, valid_from, valid_to, source")
    .eq("model", modelo)
    .eq("unit", "token");
  if (error) {
    // A chamada paga JÁ aconteceu quando esta leitura roda: lançar aqui daria
    // 500 sem trilha e o gasto sumiria do mês. O contrato é o mesmo de "sem
    // tarifa": custo nulo com warn — a trilha é gravada mesmo assim.
    log.warn("leitura de ai_model_prices falhou depois da chamada paga — a linha fica sem custo", {
      modelo,
      erro: error.message,
    });
    return null;
  }

  const unidades: readonly string[] = ["token", "character", "second", "request"];
  const tarifas: TarifaDeModelo[] = [];
  for (const linha of (data ?? []) as Array<Record<string, unknown>>) {
    const unidade = String(linha.unit ?? "");
    if (!unidades.includes(unidade)) continue;
    tarifas.push({
      model: String(linha.model ?? ""),
      unit: unidade as UnidadeCobravel,
      currency: String(linha.currency ?? "USD"),
      unitPrice: Number(linha.unit_price),
      validFrom: String(linha.valid_from ?? ""),
      validTo: linha.valid_to === null || linha.valid_to === undefined ? null : String(linha.valid_to),
      source: linha.source === null || linha.source === undefined ? null : String(linha.source),
    });
  }

  const resultado = calcularCusto(tarifas, {
    model: modelo,
    unit: "token",
    em: agora,
    quantidade: tokensIn + tokensOut,
  });
  if (resultado.custo === null) {
    log.warn("sem tarifa vigente — a linha fica sem custo (nunca zero inventado)", {
      modelo,
      motivo: resultado.motivo,
    });
  }
  return resultado.custo;
}

interface LinhaDaTrilha {
  kind: TalkxAiKind;
  entity_type: string | null;
  entity_id: string | null;
  input_hash: string;
  output: unknown;
  model: string | null;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number | null;
  status: "ok" | "error";
  created_by: string;
  created_at: string;
}

async function gravarTrilha(supabase: SupabaseClient, linha: LinhaDaTrilha): Promise<void> {
  const { error } = await supabase.from(TABELA_TRILHA).insert(linha).select("id");
  if (error) throw new Error(`trail_write_failed: ${error.message}`);
}

// ─── Handler ────────────────────────────────────────────────────────────────

function extrairJwt(req: Request): string | null {
  const cabecalho = req.headers.get("Authorization");
  if (!cabecalho) return null;
  const token = cabecalho.replace(/^Bearer\s+/i, "").trim();
  return token === "" ? null : token;
}

function textoOuNulo(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo === "" || limpo.length > 200 ? null : limpo;
}

export async function handleTalkxAi(req: Request, deps: TalkxAiDeps): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("talkx-ai");
  const agora = (deps.agora ?? (() => new Date()))();

  try {
    if (req.method !== "POST") {
      return jsonResponse({ ok: false, reason: "method_not_allowed" }, 405, req);
    }

    // ── 1. Identidade: JWT do chamador ──────────────────────────────────────
    const jwt = extrairJwt(req);
    if (!jwt) return jsonResponse({ ok: false, reason: "unauthorized" }, 401, req);

    const { data: auth, error: erroAuth } = await deps.supabase.auth.getUser(jwt);
    const chamador = auth?.user;
    if (erroAuth || !chamador) {
      return jsonResponse({ ok: false, reason: "unauthorized" }, 401, req);
    }

    // ── 2. Papel: admin/supervisor (RPC canônica) ───────────────────────────
    const { data: staff, error: erroPapel } = await deps.supabase.rpc("is_admin_or_supervisor", {
      _user_id: chamador.id,
    });
    if (erroPapel) throw new Error(`role_check_failed: ${erroPapel.message}`);
    if (staff !== true) return jsonResponse({ ok: false, reason: "forbidden" }, 403, req);

    // ── 3. Pedido ───────────────────────────────────────────────────────────
    let bruto: unknown;
    try {
      bruto = await req.json();
    } catch {
      return jsonResponse({ ok: false, reason: "invalid_body" }, 400, req);
    }
    if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) {
      return jsonResponse({ ok: false, reason: "invalid_body" }, 400, req);
    }
    const corpo = bruto as Record<string, unknown>;

    const kindBruto = corpo.kind;
    if (typeof kindBruto !== "string" || !(KINDS as readonly string[]).includes(kindBruto)) {
      return jsonResponse({ ok: false, reason: "invalid_kind" }, 400, req);
    }
    const kind = kindBruto as TalkxAiKind;

    const entrada = validarEntrada(kind, corpo.input);
    if (!entrada.ok) return jsonResponse({ ok: false, reason: entrada.reason }, 400, req);

    const entityType = textoOuNulo(corpo.entity_type);
    const entityId = textoOuNulo(corpo.entity_id);

    // ── 4. Recusas ANTES da rede ────────────────────────────────────────────
    const ajustes = await lerAjustes(deps.supabase);
    if (!ajustes.iaLigada || ajustes.orcamentoUsd <= 0) {
      return jsonResponse({ ok: false, reason: "ai_disabled" }, 403, req);
    }

    const gasto = await gastoDoMes(deps.supabase, agora);
    if (gasto >= ajustes.orcamentoUsd) {
      log.warn("teto do mês atingido — recusa sem chamar o proxy", {
        gasto,
        orcamento: ajustes.orcamentoUsd,
      });
      return jsonResponse({ ok: false, reason: "budget_exceeded" }, 429, req);
    }

    const usadosHoje = await contarUsoDeHoje(deps.supabase, chamador.id, agora);
    if (usadosHoje >= ajustes.limiteDiario) {
      return jsonResponse({ ok: false, reason: "user_daily_limit_exceeded" }, 429, req);
    }

    // ── 5. Cache de 24 h por `input_hash` ───────────────────────────────────
    const inputHash = await hashDeEntrada(kind, entrada);
    const cacheado = await buscarNoCache(deps.supabase, inputHash, agora);
    if (cacheado !== null) {
      return jsonResponse({ ok: true, kind, cached: true, output: cacheado }, 200, req);
    }

    // ── 6. Chamada paga (via `ai-proxy`) ────────────────────────────────────
    const prompt = montarPrompt(entrada);
    const respostaProxy = await deps.chamarProxy(
      { messages: [{ role: "user", content: prompt }], use_for: USE_FOR[kind], requestId: crypto.randomUUID() },
      jwt,
    );

    if (respostaProxy.status < 200 || respostaProxy.status >= 300) {
      log.error("ai-proxy recusou a chamada", { status: respostaProxy.status, kind });
      // A gravação da tentativa é conferida em TODO caminho: se falhar, a
      // exceção sobe e a resposta vira 500 — nunca um 502 que esconde do gasto
      // uma chamada que chegou ao proxy.
      await gravarTrilha(deps.supabase, {
        kind,
        entity_type: entityType,
        entity_id: entityId,
        input_hash: inputHash,
        output: null,
        model: null,
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: null,
        status: "error",
        created_by: chamador.id,
        created_at: agora.toISOString(),
      });
      return jsonResponse({ ok: false, reason: "proxy_error" }, 502, req);
    }

    // ── 7. Custos e trilha ──────────────────────────────────────────────────
    // A chamada paga já aconteceu: modelo, tokens e custo do corpo valem para
    // QUALQUER desfecho depois de resposta 2xx — saída válida, vazia ou
    // inválida — senão o gasto ficaria fora do teto do mês e do limite diário.
    const modelo = extrairModelo(respostaProxy.body);
    const { tokensIn, tokensOut } = extrairUso(respostaProxy.body);
    const custo = await custoDoUso(deps.supabase, modelo, tokensIn, tokensOut, agora, log);

    const registrarTentativa = (output: unknown, status: "ok" | "error") =>
      gravarTrilha(deps.supabase, {
        kind,
        entity_type: entityType,
        entity_id: entityId,
        input_hash: inputHash,
        output,
        model: modelo,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost_usd: custo,
        status,
        created_by: chamador.id,
        created_at: agora.toISOString(),
      });

    const saida = extrairTexto(respostaProxy.body);
    if (saida === null) {
      log.error("ai-proxy devolveu corpo sem conteúdo", { kind });
      await registrarTentativa(null, "error");
      return jsonResponse({ ok: false, reason: "empty_output" }, 502, req);
    }

    const validacao = validarSaida(kind, entrada, saida);
    if (!validacao.ok) {
      log.error("saída inválida depois da chamada paga", { kind, reason: validacao.reason });
      await registrarTentativa(null, "error");
      return jsonResponse(
        { ok: false, reason: validacao.reason, ...(validacao.variaveis ? { variaveis: validacao.variaveis } : {}) },
        422,
        req,
      );
    }

    await registrarTentativa(validacao.output, "ok");

    log.info("pedido atendido", { kind, modelo, tokens: tokensIn + tokensOut, custo, cached: false });
    return jsonResponse(
      {
        ok: true,
        kind,
        cached: false,
        output: validacao.output,
        model: modelo,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost_usd: custo,
      },
      200,
      req,
    );
  } catch (erro) {
    return internalErrorResponse(erro, req);
  }
}

if (import.meta.main) {
  Deno.serve((req) => {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceRole);
    return handleTalkxAi(req, {
      supabase,
      env: { get: (nome) => Deno.env.get(nome) },
      chamarProxy: async (payload, jwt) => {
        const resposta = await fetch(`${supabaseUrl}/functions/v1/ai-proxy`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
          body: JSON.stringify(payload),
        });
        return { status: resposta.status, body: await resposta.json().catch(() => null) };
      },
    });
  });
}
