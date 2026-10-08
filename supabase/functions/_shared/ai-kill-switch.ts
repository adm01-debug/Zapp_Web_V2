/**
 * IA-009 — kill switch de IA lido NO SERVIDOR (capacidade, provedor e bot).
 *
 * Por que este módulo existe:
 *  - o desenho do IA-009 (`docs/ia/IA-009-desligamento-seguro.md`) prevê chaves
 *    por capacidade (`ai.capability.*`), por provedor (`ai.provider.*`) e por
 *    bot/conexão (`ai.bot.*`) sobre a tabela `feature_flags` que já existe — sem
 *    estrutura nova. Só que, até aqui, NENHUMA Edge Function lia `feature_flags`:
 *    desligar a flag escondia o botão no cliente e quem chamasse a função direto
 *    continuava consumindo provedor. Este módulo é o sinal que faltava no
 *    servidor;
 *  - o desligamento precisa ser IMEDIATO (escrita em tabela, sem deploy) e a
 *    leitura NÃO pode depender de cache: aqui é uma consulta por chamada, sem
 *    TTL — o cache de 5 min do `useFeatureFlag` é do cliente e não se aplica.
 *
 * Semântica (o ponto onde o desenho é explícito e onde ele é deliberado):
 *  - CAPACIDADE e PROVEDOR são permissões: só `enabled = true` autoriza. Linha
 *    ausente, chave inválida ou falha de leitura → NEGADO (desenho §2.5: "falha
 *    de leitura nunca reative efeito automático"). Negar é o desfecho seguro: a
 *    IA não age, o atendimento humano segue. Por isso a migration do IA-009
 *    semeia as chaves LIGADAS, tornando o estado atual explícito em vez de
 *    depender da ausência de linha;
 *  - BOT é PAUSA, não permissão: `ai.bot.<connectionId>` existe para pausar a
 *    automação de UMA conexão "sem derrubar as outras" (§2.3) — o que pressupõe
 *    as outras rodando. Só `enabled = false` pausa; linha ausente não pausa
 *    nada. Aplicar "ausência = desligado" aqui desligaria o bot de TODA conexão
 *    existente no merge (o oposto do aceite), então a pausa é explícita.
 *
 * Escopo: não toca `ai_providers.is_active` (desligar capacidade é decisão
 * humana) e não impede leitura de histórico, envio humano nem atribuição de
 * conversa — só o efeito automático que gasta provedor.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";

const LOG_PREFIX = "[ai-kill-switch]";

/** Prefixo das chaves de CAPACIDADE (IA-009 §2.1). */
export const AI_CAPABILITY_KEY_PREFIX = "ai.capability.";
/** Prefixo das chaves de PROVEDOR (IA-009 §2.2). */
export const AI_PROVIDER_KEY_PREFIX = "ai.provider.";

/**
 * Traduz `ai_providers.provider_type` para o nome da chave como o desenho a nomeia
 * (§2.2: `ai.provider.openai`, `.gemini`, `.elevenlabs`, `.anthropic`). O banco usa
 * outro vocabulário (`openai_compatible`, `google_gemini`); sem a tradução, a chave
 * que o operador desliga conforme o desenho não seria a chave consultada aqui — o
 * desligamento documentado não desligaria nada. Tipo fora do desenho usa o próprio
 * `provider_type`, para nenhum provedor ficar sem chave.
 */
export const AI_PROVIDER_KEY_BY_TYPE: Readonly<Record<string, string>> = Object.freeze({
  openai_compatible: "openai",
  google_gemini: "gemini",
  elevenlabs: "elevenlabs",
  anthropic: "anthropic",
});
/** Prefixo das chaves de BOT/conexão (IA-009 §2.3). */
export const AI_BOT_KEY_PREFIX = "ai.bot.";

/**
 * Capacidade canônica de cada função que consome provedor pelo despacho central
 * (IA-009 §2.1). A chave termina no slug do desenho; função sem slug declarado
 * usa o próprio nome — nenhuma chamada ao provedor fica sem chave de
 * desligamento (o que não está na lista continua NEGADO, nunca liberado).
 */
export const AI_CAPABILITY_BY_FUNCTION: Readonly<Record<string, string>> = Object.freeze({
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
  // SL-010b: a família voz/áudio da ElevenLabs inteira responde à ÚNICA
  // capacidade de voz do desenho (IA-009 §2.1, `ai.capability.voice`).
  "elevenlabs-tts": "voice",
  "elevenlabs-tts-stream": "voice",
  "elevenlabs-sfx": "voice",
  "elevenlabs-sts": "voice",
  "elevenlabs-dialogue": "voice",
  "elevenlabs-voice-design": "voice",
  "voice-changer": "voice",
  "elevenlabs-agent-token": "voice",
  "elevenlabs-scribe-token": "voice",
});

/** Alvo de uma decisão de desligamento. */
export interface AiKillSwitchTarget {
  /** Identidade da capacidade: `functionName` do despacho central. */
  functionName: string;
  /** `ai_providers.provider_type` resolvido — o valor que o servidor tem em mãos. */
  providerType?: string | null;
  /** Conexão do bot, quando a chamada é de automação de uma conexão. */
  connectionId?: string | null;
}

/** Motivo da negação (código estável, distinguível no log e no teste). */
export type AiKillSwitchCode =
  | "capability_disabled"
  | "provider_disabled"
  | "bot_paused"
  | "flag_absent"
  | "flag_read_error";

export interface AiKillSwitchDecision {
  allowed: boolean;
  code: AiKillSwitchCode | null;
  /** Chave que decidiu (`null` quando a leitura inteira falhou). */
  key: string | null;
  /** Motivo legível; vai para `ai_usage_logs.error_message`. */
  message: string | null;
}

/** Estado lido da tabela: `true`/`false` quando a linha existe, `null` quando não existe. */
export type AiFlagEntries = ReadonlyMap<string, boolean | null>;

/**
 * Normaliza uma parte de chave para o formato aceito pelo CHECK de
 * `feature_flags` (`^[a-z0-9][a-z0-9_.-]{0,63}$`, dado que a chave inteira é
 * prefixo + parte e cabe no limite). Valor fora do formato não pode existir na
 * tabela: devolver `null` evita consultar e inventar uma chave que nunca casaria.
 */
function normalizeKeyPart(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parte = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_.-]{0,35}$/.test(parte) ? parte : null;
}

/** Chave de capacidade da função (`ai.capability.<slug>`), ou `null` sem função válida. */
export function capabilityKeyForFunction(functionName: unknown): string | null {
  const parte = normalizeKeyPart(functionName);
  if (parte === null) return null;
  return `${AI_CAPABILITY_KEY_PREFIX}${AI_CAPABILITY_BY_FUNCTION[parte] ?? parte}`;
}

/** Chave de provedor (`ai.provider.<nome do desenho>`), ou `null` sem tipo válido. */
export function providerKeyForType(providerType: unknown): string | null {
  const parte = normalizeKeyPart(providerType);
  if (parte === null) return null;
  return `${AI_PROVIDER_KEY_PREFIX}${AI_PROVIDER_KEY_BY_TYPE[parte] ?? parte}`;
}

/** Chave de bot/conexão (`ai.bot.<connectionId>`), ou `null` sem conexão válida. */
export function botKeyForConnection(connectionId: unknown): string | null {
  const parte = normalizeKeyPart(connectionId);
  return parte === null ? null : `${AI_BOT_KEY_PREFIX}${parte}`;
}

/** Leitura de uma chave PERMISSIVA: só `true` autoriza; ausente/falso nega. */
function requireEnabled(
  entries: AiFlagEntries,
  key: string | null,
  code: Extract<AiKillSwitchCode, "capability_disabled" | "provider_disabled">,
  label: string,
): AiKillSwitchDecision | null {
  if (key === null) {
    return {
      allowed: false,
      code: "flag_absent",
      key: null,
      message: `${label} sem chave valida em feature_flags; sem prova de liberacao, a IA nao age.`,
    };
  }
  if (!entries.has(key)) {
    // O PostgREST devolve só as linhas existentes: ausência é ausência de prova.
    return {
      allowed: false,
      code: "flag_absent",
      key,
      message: `${label} desligada: a chave ${key} nao existe em feature_flags (ausencia nao autoriza).`,
    };
  }
  if (entries.get(key) !== true) {
    return {
      allowed: false,
      code,
      key,
      message: `${label} desligada pela chave ${key} em feature_flags.`,
    };
  }
  return null;
}

/**
 * Veredito PURO do kill switch — sem I/O, para o teste provar cada borda.
 *
 * `readError` é a falha de leitura da tabela: nega (falha fechada), nunca libera.
 */
export function decideAiKillSwitch(
  entries: AiFlagEntries,
  target: AiKillSwitchTarget,
  readError: string | null = null,
): AiKillSwitchDecision {
  if (readError !== null) {
    return {
      allowed: false,
      code: "flag_read_error",
      key: null,
      message: `Leitura de feature_flags falhou (${readError}); sem prova de liberacao, a IA nao age.`,
    };
  }

  const capacidade = requireEnabled(
    entries,
    capabilityKeyForFunction(target?.functionName),
    "capability_disabled",
    "Capacidade de IA",
  );
  if (capacidade !== null) return capacidade;

  const provedorInformado = typeof target?.providerType === "string" && target.providerType.trim() !== "";
  if (provedorInformado) {
    const provedor = requireEnabled(
      entries,
      providerKeyForType(target.providerType),
      "provider_disabled",
      "Provedor de IA",
    );
    if (provedor !== null) return provedor;
  }

  // BOT é pausa explícita (ver o cabeçalho): só `false` interrompe a automação.
  const botKey = botKeyForConnection(target?.connectionId);
  if (botKey !== null && entries.get(botKey) === false) {
    return {
      allowed: false,
      code: "bot_paused",
      key: botKey,
      message: `Automacao pausada pela chave ${botKey} em feature_flags.`,
    };
  }

  return { allowed: true, code: null, key: null, message: null };
}

/** Client de service role lido do ambiente (mesmo padrão de `ai-budget`/`ai-circuit`). */
function createServiceClient(): { client: SupabaseClient | null; missingEnv: string | null } {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const missing: string[] = [];
  if (!url) missing.push("SUPABASE_URL");
  if (!key) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return { client: null, missingEnv: missing.join(", ") };
  return { client: createClient(url, key), missingEnv: null };
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Lê as chaves pedidas em UMA consulta. Falha de env, de banco ou exceção vira
 * `readError` (o chamador NEGA) — a leitura nunca lança para quem consome a IA.
 */
export async function readAiFlagEntries(
  keys: readonly string[],
): Promise<{ entries: AiFlagEntries; readError: string | null }> {
  const unicas = [...new Set(keys.filter((key): key is string => typeof key === "string" && key !== ""))];
  if (unicas.length === 0) return { entries: new Map<string, boolean | null>(), readError: null };

  const { client, missingEnv } = createServiceClient();
  if (client === null) return { entries: new Map<string, boolean | null>(), readError: `env ausente: ${missingEnv}` };

  try {
    const { data, error } = await client.from("feature_flags").select("key,enabled").in("key", unicas);
    if (error) return { entries: new Map<string, boolean | null>(), readError: error.message };

    const entries = new Map<string, boolean | null>();
    for (const key of unicas) entries.set(key, null);
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const key = typeof row?.key === "string" ? row.key : null;
      if (key === null || !entries.has(key)) continue;
      entries.set(key, row.enabled === true);
    }
    return { entries, readError: null };
  } catch (err) {
    return { entries: new Map<string, boolean | null>(), readError: errorText(err) };
  }
}

/**
 * Decide se a chamada ao provedor pode acontecer (IA-009). É o ponto de entrada
 * do servidor: `generateWithRouting` e o despacho do `ai-proxy` chamam ANTES de
 * reservar orçamento e de tocar o provedor; o `chatbot-l1` chama antes de montar
 * o prompt (pausa por conexão). Nunca lança: falha de leitura nega, não estoura.
 */
export async function evaluateAiKillSwitch(target: AiKillSwitchTarget): Promise<AiKillSwitchDecision> {
  const keys = [
    capabilityKeyForFunction(target?.functionName),
    providerKeyForType(target?.providerType),
    botKeyForConnection(target?.connectionId),
  ].filter((key): key is string => key !== null);

  const { entries, readError } = await readAiFlagEntries(keys);
  const decision = decideAiKillSwitch(entries, target, readError);
  if (!decision.allowed) console.warn(`${LOG_PREFIX} ${decision.message}`);
  return decision;
}
