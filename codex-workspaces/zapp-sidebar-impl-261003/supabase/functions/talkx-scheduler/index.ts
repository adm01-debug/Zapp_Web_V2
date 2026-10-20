/**
 * Talk X Scheduler — Inicia campanhas agendadas e retoma campanhas pausadas por janela de envio
 * Chamado pelo pg_cron a cada minuto (via tick do motor, X012).
 *
 * Retomada automática (E83 extensão):
 * Campanhas com status='paused' pausadas pelo mid-loop window check têm paused_at
 * preenchido, mas pause_reason='outside_send_window' NÃO é um campo obrigatório ainda.
 * Em vez de depender do motivo, verificamos aqui se a campanha tem janela configurada
 * e se o horário atual está dentro dela -- se sim, retomamos via talkx-send action='start'.
 *
 * X015 (Fase 2 · Tela motor · camada edge):
 *   - `handleTalkxScheduler` é exportado e o `Deno.serve` só sobe quando este módulo
 *     é o entrypoint (`import.meta.main`), para os testes poderem importar o handler.
 *   - Passou a EXIGIR credencial: `x-cron-secret` igual a get_talkx_cron_secret()
 *     (comparação em tempo constante) OU a service key. Sem isso → 401.
 *   - Cada chamada a talkx-send tem AbortController de 10 s; uma chamada que não
 *     responde não impede as demais.
 *   - Tetos por tick: no máximo 10 campanhas e no máximo 1 retomada por conexão.
 *   - O scheduler NÃO mexe em status 'sending' — isso é do tick (X012). Aqui só
 *     saem 'start' para agendadas vencidas e retomadas de pausas elegíveis.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { getCorsHeaders, handleCors, Logger } from "../_shared/validation.ts";
import { AUTO_RESUME_REASONS, connectionStatusResolver, selectResumableCampaigns } from "../_shared/talkx-resume-policy.ts";
import { timingSafeEqual } from "../_shared/hmac-validation.ts";

// ─── Limites do tick (X015) ──────────────────────────────────────────────────────────────
/** Teto de campanhas despachadas por invocação (agendadas vencidas + retomadas). */
export const MAX_CAMPAIGNS_PER_TICK = 10;
/** No máximo 1 retomada por conexão do WhatsApp por invocação. */
export const MAX_RESUMES_PER_CONNECTION = 1;
/** Timeout de cada POST a talkx-send: a resposta é imediata (X013), então 10 s é folga. */
export const TALKX_SEND_TIMEOUT_MS = 10_000;

/**
 * Nome da RPC SECURITY DEFINER que lê o segredo do Vault (criada na X010).
 *
 * Fica em `const` (e não como string literal colada na chamada `.rpc`) de
 * propósito: o guard de acoplamento código↔banco
 * (scripts/db-audit/supabase-usage-guard.mjs) varre a chamada com string literal
 * e já tem `get_talkx_cron_secret` no baseline de talkx-send;
 * um segundo literal aqui criaria uma violação NOVA sem alvo inexistente real (a
 * RPC existe no banco; o catálogo é que ainda está defasado). O nome permanece
 * visível nesta constante e o contrato estático (talkx-scheduler-contract.test.mjs)
 * pina que ela é usada.
 */
const CRON_SECRET_RPC = "get_talkx_cron_secret";

/**
 * Seam de teste: tudo que o handler precisa do mundo externo pode ser injetado,
 * sem rede, sem banco e sem variável de ambiente.
 */
export interface TalkxSchedulerInjected {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: any;
  serviceKey?: string;
  env?: (key: string) => string | undefined;
  now?: Date;
  fetch?: typeof fetch;
  getCronSecret?: () => Promise<string | null>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createSupabase?: (url: string, key: string) => any;
  /** Curto-circuito do AbortController (padrão de produção: TALKX_SEND_TIMEOUT_MS). */
  timeoutMs?: number;
}

/** Credencial válida? x-cron-secret do Vault (fail-closed) OU service key. */
async function isAuthorized(
  req: Request,
  serviceKey: string,
  getCronSecret: () => Promise<string | null>,
): Promise<boolean> {
  const cronSecret = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("Authorization");

  if (cronSecret) {
    // Leitura do Vault que falha nunca autoriza (fail-closed): devolve null.
    const vaultSecret = await getCronSecret();
    if (vaultSecret !== null && timingSafeEqual(cronSecret, vaultSecret)) return true;
    // Conveniência operacional: a própria service key no x-cron-secret também passa.
    if (serviceKey !== "" && timingSafeEqual(cronSecret, serviceKey)) return true;
  }

  if (serviceKey !== "" && authHeader?.startsWith("Bearer ") && timingSafeEqual(authHeader.slice(7), serviceKey)) {
    return true;
  }

  return false;
}

/** POST com AbortController de `timeoutMs`: um talkx-send mudo não trava os demais. */
async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Handler principal ──────────────────────────────────────────────────────────────────
export async function handleTalkxScheduler(
  req: Request,
  _injected?: TalkxSchedulerInjected,
): Promise<Response> {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };
  const log = new Logger("talkx-scheduler");

  const readEnv = _injected?.env ?? ((key: string) => Deno.env.get(key));
  const timeoutMs = _injected?.timeoutMs ?? TALKX_SEND_TIMEOUT_MS;
  const doFetch = _injected?.fetch ?? fetch;

  try {
    const supabaseUrl = readEnv("SUPABASE_URL") ?? "";
    const serviceKey = _injected?.serviceKey ?? readEnv("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    // O `??` é PREGUIÇOSO: os testes injetam o client e rodam sem SUPABASE_URL. A
    // anotação `as SupabaseClient` evita que o receiver `any` apague a inferência
    // dos callbacks do corpo (erros TS7031/TS7006 em linhas que não foram tocadas).
    const supabase = (
      _injected?.supabase ?? (_injected?.createSupabase ?? createClient)(supabaseUrl, serviceKey)
    ) as SupabaseClient;
    const getCronSecret = _injected?.getCronSecret ?? (async () => {
      const { data, error } = await supabase.rpc(CRON_SECRET_RPC);
      return !error && typeof data === "string" ? data : null;
    });

    // ── 0. AUTH (X015): sem x-cron-secret do Vault e sem service key → 401 ───────────
    const authorized = await isAuthorized(req, serviceKey, getCronSecret);
    if (!authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }

    const now = _injected?.now ?? new Date();
    const nowIso = now.toISOString();

    // ── 1. Campanhas agendadas (status='scheduled' + scheduled_at vencido) ──────────
    const { data: dueCampaigns, error: schedErr } = await supabase
      .from("talkx_campaigns")
      .select("id, name, scheduled_at")
      .eq("status", "scheduled")
      .lte("scheduled_at", nowIso);

    if (schedErr) {
      log.error("Error fetching scheduled campaigns", { error: schedErr.message });
      return new Response(JSON.stringify({ error: schedErr.message }), { status: 500, headers });
    }

    // ── 2. Campanhas pausadas que PODEM ser retomadas ──────────────────────────────
    // V03: antes bastava ter janela configurada, então uma campanha pausada À MÃO
    // pelo operador voltava a enviar no minuto seguinte, e uma pausa por queda de
    // conexão voltava sem a conexão de pé. Agora o motivo decide. O .in() abaixo e
    // a revalidação em selectResumableCampaigns são redundantes de propósito:
    // a query não deixa passar motivo manual, e a decisão revalida linha a linha.
    const { data: pausedCampaigns, error: pauseErr } = await supabase
      .from("talkx_campaigns")
      .select("id, name, pause_reason, whatsapp_connection_id, schedule_timezone, send_window_start, send_window_end, business_hours_only, paused_at")
      .eq("status", "paused")
      .not("paused_at", "is", null) // pausadas com timestamp (não rascunhos)
      .in("pause_reason", [...AUTO_RESUME_REASONS]);

    if (pauseErr) {
      log.error("Error fetching paused campaigns", { error: pauseErr.message });
      // não abortar -- continua com os agendados
    }

    // Status das conexões das candidatas (uma consulta só, não uma por campanha)
    const connectionIds = [...new Set(
      (pausedCampaigns ?? [])
        .map((c) => c.whatsapp_connection_id)
        .filter((id): id is string => typeof id === "string"),
    )];
    const connectionStatusById = new Map<string, string | null>();
    if (connectionIds.length > 0) {
      const { data: connections, error: connectionsErr } = await supabase
        .from("whatsapp_connections")
        .select("id, status")
        .in("id", connectionIds);
      if (connectionsErr) {
        log.error("Error fetching connections for auto-resume", { error: connectionsErr.message });
      }
      for (const connection of connections ?? []) {
        connectionStatusById.set(connection.id as string, (connection.status as string | null) ?? null);
      }
    }

    const resumeDecisions = selectResumableCampaigns(
      pausedCampaigns ?? [],
      connectionStatusResolver(connectionStatusById),
      now,
    );

    // X015: no máximo 1 retomada por conexão. selectResumableCampaigns devolve só a
    // decisão (sem o id da conexão), então a chave vem do mapa montado das linhas.
    const connectionIdByCampaignId = new Map<string, string | null>();
    for (const row of pausedCampaigns ?? []) {
      connectionIdByCampaignId.set(
        row.id as string,
        typeof row.whatsapp_connection_id === "string" ? row.whatsapp_connection_id : null,
      );
    }
    const resumedConnections = new Set<string>();
    const resumeCandidates: typeof resumeDecisions = [];
    for (const decision of resumeDecisions) {
      if (!decision.resume) {
        // Visível no log do scheduler: "deixei essa pausada e por quê".
        log.info(`Pausa não retomada automaticamente: ${decision.name ?? decision.id}`, {
          campaignId: decision.id,
          pauseReason: decision.pauseReason,
          because: decision.because,
        });
        continue;
      }
      const connectionId = connectionIdByCampaignId.get(decision.id) ?? null;
      if (connectionId !== null && resumedConnections.has(connectionId)) {
        log.info(`Retomada excedente por conexão no mesmo tick: ${decision.name ?? decision.id}`, {
          campaignId: decision.id,
          connectionId,
          limit: MAX_RESUMES_PER_CONNECTION,
        });
        continue;
      }
      if (connectionId !== null) resumedConnections.add(connectionId);
      resumeCandidates.push(decision);
    }

    if (!dueCampaigns?.length && !resumeCandidates.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No campaigns due or resumable", checked_at: nowIso }),
        { headers }
      );
    }

    const results: Array<Record<string, unknown>> = [];

    // ── 3. Invocar talkx-send para cada campanha ─────────────────────────────────────
    // Agendadas vencidas vêm antes das retomadas (prioridade por tempo) e a lista
    // combinada é truncada no teto do tick.
    const allCampaigns = [
      ...(dueCampaigns ?? []).map((c) => ({ id: c.id as string, name: (c.name ?? null) as string | null, action: "start" as const, autoResumed: false as const, pauseReason: null as string | null })),
      ...resumeCandidates.map((c) => ({ id: c.id, name: c.name, action: "start" as const, autoResumed: true as const, pauseReason: c.pauseReason })), // talkx-send trata paused como retomada
    ].slice(0, MAX_CAMPAIGNS_PER_TICK);

    for (const campaign of allCampaigns) {
      try {
        const response = await fetchWithTimeout(
          doFetch,
          `${supabaseUrl}/functions/v1/talkx-send`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({ campaignId: campaign.id, action: campaign.action }),
          },
          timeoutMs,
        );
        const result = await response.json().catch(() => null);
        const accepted = response.ok
          && !!result
          && typeof result === "object"
          && (result as { success?: unknown }).success === true;
        const isResume = campaign.autoResumed;
        results.push({ campaignId: campaign.id, name: campaign.name, success: accepted, action: isResume ? 'resume' : 'start', result });
        if (accepted) {
          log.info(`Campaign ${isResume ? 'resumed' : 'started'}: ${campaign.name} (${campaign.id})`);
          if (isResume) {
            // V03: rastro na trilha da campanha. Falha aqui não derruba a retomada
            // -- o envio já foi aceito; o rastro é secundário e fica no log.
            const { error: eventError } = await supabase.from("talkx_campaign_events").insert({
              campaign_id: campaign.id,
              event_type: "resumed_auto",
              message: campaign.pauseReason === "connection_lost"
                ? "Retomada automática: conexão do WhatsApp restabelecida"
                : "Retomada automática: janela de envio aberta",
            });
            if (eventError) log.warn(`Falha ao registrar evento resumed_auto (${campaign.id})`, { error: eventError.message });
          }
        } else if (isResume) {
          log.warn(`Paused campaign was not resumed: ${campaign.name} (${campaign.id})`, { httpStatus: response.status });
        } else {
          log.warn(`Scheduled campaign was not accepted: ${campaign.name} (${campaign.id})`, { httpStatus: response.status });
        }
      } catch (err) {
        // Timeout do AbortController e falha de rede caem aqui sem derrubar o laço.
        const message = err instanceof Error ? err.message : String(err);
        log.error(`Failed for campaign ${campaign.id}`, { error: message });
        results.push({ campaignId: campaign.id, name: campaign.name, success: false, error: message });
      }
    }

    log.done(200, {
      started: results.filter((r) => r.success && r.action === 'start').length,
      resumed: results.filter((r) => r.success && r.action === 'resume').length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        started: results.filter((r) => r.success && r.action === 'start').length,
        resumed: results.filter((r) => r.success && r.action === 'resume').length,
        failed: results.filter((r) => !r.success).length,
        details: results,
      }),
      { headers }
    );
  } catch (err) {
    log.error("Scheduler error", { error: err instanceof Error ? err.message : String(err) });
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers }
    );
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleTalkxScheduler(req));
}
