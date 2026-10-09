/**
 * Kill switch por CAPACIDADE de IA lido no SERVIDOR (IA-009; achado B8 da IA-003).
 *
 * Lacuna que este módulo fecha: `feature_flags` só era lida no cliente
 * (`src/hooks/system/useFeatureFlag.ts`) e, no servidor, apenas por
 * `crm-integration`. Desligar a flag escondia o botão no front, mas quem chamasse
 * a Edge Function direto — ou um bundle velho — continuava consumindo provedor
 * pago. Aqui a capacidade é conferida DENTRO do caminho de execução, antes de
 * reservar orçamento, de bater no contador compartilhado ou de chamar o provedor.
 *
 * PADRÃO SEGURO (decidido neste cartão, SEM seed/migration): a AUSÊNCIA da chave
 * vale LIGADA — o operador não desligou a capacidade, e o padrão é a IA funcionar.
 * O que DESLIGA é só o `enabled = false` booleano explícito. Leitura não confiável
 * — erro do PostgREST, exceção ou valor de tipo inesperado — FECHA (bloqueia):
 * falha de leitura nunca reativa efeito automático, o mesmo princípio do
 * `fallback = false` do hook do cliente (que, no cliente, segue valendo).
 *
 * ESCOPO: as 10 capacidades do desenho IA-009, uma chave por capacidade
 * (`ai.capability.<capacidade>`). Chave por provedor (`ai.provider.*`) e por
 * conexão (`ai.bot.<connectionId>`) são o cartão irmão (SL-010 / IA-039) e não
 * entram aqui. Função SEM capacidade declarada no mapa abaixo não é barrada por
 * este gate (decisão explícita: função nova não nasce desligada por engano);
 * `ai-proxy` (transporte genérico, sem capacidade de produto) e os classificadores
 * `classify-*` ficam de fora pelo mesmo motivo — ver o relato do cartão.
 *
 * SEM CACHE, de propósito: a IA-009 exige desligamento IMEDIATO sem deploy, e um
 * cache — mesmo curto — reabriria a janela em que a flag já desligada ainda vale.
 * O custo é uma leitura do PostgREST por requisição de IA.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { getCorsHeaders, requireEnv } from "./validation.ts";

/** Capacidades de IA do desenho IA-009 (chave `ai.capability.<capacidade>`). */
export type AiCapability =
  | "suggest_reply"
  | "enhance_message"
  | "summary"
  | "conversation_analysis"
  | "auto_tag"
  | "churn"
  | "classify_tickets"
  | "transcribe_audio"
  | "voice"
  | "chatbot_l1";

/** Prefixo único das chaves de capacidade (nada de string solta no código). */
export const AI_CAPABILITY_FLAG_PREFIX = "ai.capability.";

/**
 * Função de IA -> capacidade que ela consome. É o mapa que dá nome à chave lida.
 *
 * Congelado: ninguém descobre uma capacidade nova mutando o objeto em runtime.
 * Quem não está aqui não passa por este gate — o mapa é a lista fechada do
 * desenho, não uma convenção por prefixo de nome de arquivo.
 */
export const AI_CAPABILITY_BY_FUNCTION: Readonly<Record<string, AiCapability>> = Object.freeze({
  "ai-suggest-reply": "suggest_reply",
  "ai-enhance-message": "enhance_message",
  "ai-conversation-summary": "summary",
  "ai-conversation-analysis": "conversation_analysis",
  "ai-auto-tag": "auto_tag",
  "ai-churn-analysis": "churn",
  "ai-classify-tickets": "classify_tickets",
  "ai-transcribe-audio": "transcribe_audio",
  "voice-agent": "voice",
  "chatbot-l1": "chatbot_l1",
});

/** Chave canônica de uma capacidade: `ai.capability.<capacidade>`. */
export function aiCapabilityFlagKey(capability: AiCapability): string {
  return `${AI_CAPABILITY_FLAG_PREFIX}${capability}`;
}

/** Chave que a função deve ler, ou `null` quando ela não tem capacidade declarada. */
export function capabilityFlagKeyForFunction(functionName: string): string | null {
  const capability = Object.prototype.hasOwnProperty.call(AI_CAPABILITY_BY_FUNCTION, functionName)
    ? AI_CAPABILITY_BY_FUNCTION[functionName]
    : undefined;
  return capability ? aiCapabilityFlagKey(capability) : null;
}

/**
 * Leitura da flag. `true` = LIGADA, e isso inclui a LINHA AUSENTE (sem seed,
 * ausência é "o operador não desligou"); `false` = DESLIGADA, e só o
 * `enabled = false` booleano explícito desliga; `null` = NÃO FOI POSSÍVEL LER
 * (infra fora, env ausente, erro do PostgREST, exceção ou valor não booleano).
 * `false` e `null` bloqueiam — a diferença existe só para o log dizer se a IA
 * parou por decisão do operador ou por falha de leitura.
 */
export type CapabilityFlagReader = (key: string) => Promise<boolean | null>;

/** Cliente de service role memoizado por isolate (mesmo padrão de `ai-guards.ts`). */
function createServiceClient() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}
let serviceClientPromise: Promise<ReturnType<typeof createServiceClient>> | null = null;
function getServiceClient(): Promise<ReturnType<typeof createServiceClient>> {
  if (!serviceClientPromise) {
    serviceClientPromise = Promise.resolve()
      .then(createServiceClient)
      .catch((err) => {
        serviceClientPromise = null;
        throw err;
      });
  }
  return serviceClientPromise;
}

/**
 * Lê `feature_flags.enabled` da chave (service role: a Edge não depende de RLS
 * nem de sessão de usuário para conferir a própria capacidade).
 *
 * Veredito em três estados:
 *  - `true`  → LIGADA: `enabled = true` explícito, ou LINHA AUSENTE (sem seed, a
 *    ausência da chave é o padrão "o operador não desligou", não um desligamento);
 *  - `false` → DESLIGADA: só o `false` booleano explícito desliga;
 *  - `null`  → INDETERMINADO: erro do PostgREST, exceção de rede ou valor de tipo
 *    inesperado (a coluna é booleana — qualquer outro tipo é leitura não
 *    confiável). O chamador bloqueia (fail-closed).
 */
export async function readCapabilityFlag(key: string): Promise<boolean | null> {
  try {
    const supabase = await getServiceClient();
    const { data, error } = await supabase
      .from("feature_flags")
      .select("enabled")
      .eq("key", key)
      .maybeSingle();
    if (error) {
      console.warn(JSON.stringify({
        level: "warn",
        source: "edge",
        msg: "[ai-feature-flags] falha ao ler a flag de capacidade; capacidade BLOQUEADA (fail-closed)",
        key,
        error: error.message ?? String(error),
      }));
      return null;
    }
    // Linha ausente: `.maybeSingle()` devolve `data = null` sem erro (0 linhas).
    // Não é desligamento nem falha de leitura: sem seed, o padrão é LIGADA.
    if (data === null || data === undefined) return true;
    const enabled = (data as { enabled?: unknown }).enabled;
    // A coluna é booleana; outro tipo (ex.: "true") é leitura não confiável e o
    // chamador bloqueia — nunca se liga IA a partir de valor que não se interpreta.
    if (typeof enabled !== "boolean") return null;
    return enabled;
  } catch (err) {
    console.warn(JSON.stringify({
      level: "warn",
      source: "edge",
      msg: "[ai-feature-flags] leitura da flag indisponivel; capacidade BLOQUEADA (fail-closed)",
      key,
      error: err instanceof Error ? err.message : String(err),
    }));
    return null;
  }
}

/** Resposta explícita de capacidade desativada (status >= 500 não esconde o motivo). */
function capabilityDisabledResponse(req: Request): Response {
  return new Response(
    JSON.stringify({ error: "AI capability disabled", code: "AI_CAPABILITY_DISABLED" }),
    {
      status: 503,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    },
  );
}

export interface AiCapabilityGateOptions {
  /** Slug da Edge Function (mesmo nome usado na cota/rate limit). */
  functionName: string;
  req: Request;
  /** Injeção para teste; em produção a leitura real do PostgREST. */
  readFlag?: CapabilityFlagReader;
}

/**
 * Veredito do gate: `null` = pode seguir; `Response` (503) = capacidade desligada.
 *
 * Nunca lança: erro do leitor conta como desligado (fail-closed), como manda o
 * padrão seguro da IA-009.
 */
export async function enforceAiCapability(
  opts: AiCapabilityGateOptions,
): Promise<Response | null> {
  const key = capabilityFlagKeyForFunction(opts.functionName);
  if (key === null) return null;

  const read = opts.readFlag ?? readCapabilityFlag;
  let enabled: boolean | null;
  try {
    enabled = await read(key);
  } catch (_err) {
    enabled = null;
  }
  if (enabled === true) return null;

  console.warn(JSON.stringify({
    level: "warn",
    source: "edge",
    msg: "[ai-feature-flags] capacidade de IA desativada: nenhuma reserva de orcamento nem chamada de provedor",
    function_name: opts.functionName,
    key,
    motivo: enabled === null ? "falha_de_leitura" : "flag_desligada",
  }));
  return capabilityDisabledResponse(opts.req);
}
