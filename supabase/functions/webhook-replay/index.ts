import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { getCorsHeaders, handleCors, internalErrorResponse } from "../_shared/validation.ts";
import { decideControlAuthz } from "../_shared/evolution-control-authz.ts";
import { WEBHOOK_DEAD_LETTER_ENDPOINT } from "../_shared/webhook-dead-letter.ts";

/**
 * webhook-replay — AÇÃO ADMIN que reprocessa itens da dead-letter.
 *
 * Para que existe: quando o `ingest_inbound_message` falha de forma transitória,
 * o evolution-webhook grava o evento em `webhook_failures` (payload truncado +
 * `replay_payload`) e responde 5xx. O provedor reenvia, mas se ele desistir o
 * evento ficaria perdido. Esta função é o caminho de volta: pega as linhas NÃO
 * resolvidas que têm `replay_payload` e chama a MESMA RPC do webhook.
 *
 * Idempotência: quem garante é o `ux_messages_dedup` do
 * `ingest_inbound_message`. Reenviar um `p_external_id` que já existe não cria
 * mensagem nova (a RPC devolve `outcome = 'duplicate'`) — por isso, para o
 * replay, "a RPC não deu erro" já é sucesso e a linha sai da fila. Rodar a
 * mesma chamada duas vezes não duplica nada.
 *
 * Autorização: exige admin/supervisor (`is_admin_or_supervisor`) — é ação de
 * controle, não de leitura. Ver `_shared/evolution-control-authz.ts`.
 */

/** Teto de itens reprocessados por chamada (o resto fica na fila). */
export const MAX_REPLAY_BATCH = 50;
const DEFAULT_REPLAY_BATCH = 20;

export interface WebhookReplayDeps {
  /** Injeção para teste: substitui o client do banco (produção usa a service role). */
  supabase?: SupabaseClient;
  /** Injeção para teste: client do usuário chamador (produção usa o token do header). */
  callerClient?: SupabaseClient;
  serviceKey?: string;
  anonKey?: string;
}

export interface WebhookReplayResult {
  endpoint: string;
  /** Linhas da fila lidas nesta chamada. */
  lidas: number;
  /** Linhas que tinham `replay_payload` completo e foram passadas à RPC. */
  reprocessados: number;
  /** Linhas que saíram da fila (ingest OK, duplicada ou atualizada). */
  resolvidos: number;
  /** Linhas que continuam na fila (a RPC falhou de novo). */
  falhas: number;
  /** Linhas puladas por payload incompleto — ficam para conferência manual. */
  ignorados: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** O replay só roda com os campos que o `ingest_inbound_message` exige. */
function hasReplayArgs(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  return (
    typeof value.p_connection_id === "string" &&
    typeof value.p_phone === "string" &&
    typeof value.p_external_id === "string" &&
    typeof value.p_message_type === "string"
  );
}

function clampLimit(raw: unknown): number {
  const parsed = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_REPLAY_BATCH;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_REPLAY_BATCH);
}

export async function handleWebhookReplay(req: Request, _injected?: WebhookReplayDeps): Promise<Response> {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: jsonHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabase =
      _injected?.supabase ??
      createClient(supabaseUrl, _injected?.serviceKey ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const callerClient =
      _injected?.callerClient ??
      createClient(supabaseUrl, _injected?.anonKey ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
        global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      });

    const { data: { user }, error: authError } = await callerClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Não autenticado." }), { status: 401, headers: jsonHeaders });
    }
    const { data: isAdmin } = await callerClient.rpc("is_admin_or_supervisor", { _user_id: user.id });
    // Ação de CONTROLE (matriz em _shared/evolution-control-authz.ts). O corpo da
    // resposta é fixo de propósito: erro de autorização não expõe detalhe interno.
    const decision = decideControlAuthz(!!isAdmin);
    if (!decision.allowed) {
      return new Response(JSON.stringify({ error: "Apenas administradores ou supervisores podem reprocessar a dead-letter." }), {
        status: 403,
        headers: jsonHeaders,
      });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const limit = clampLimit(body.limit);
    const endpoint = typeof body.endpoint === "string" && body.endpoint.trim()
      ? body.endpoint.trim()
      : WEBHOOK_DEAD_LETTER_ENDPOINT;

    const { data: rows, error: readError } = await supabase
      .from("webhook_failures")
      .select("id, external_id, replay_payload, retry_count")
      .eq("endpoint", endpoint)
      .eq("resolved", false)
      .not("replay_payload", "is", null)
      .order("error_at", { ascending: true })
      .limit(limit);
    if (readError) return internalErrorResponse(readError, req);

    const result: WebhookReplayResult = {
      endpoint,
      lidas: (rows ?? []).length,
      reprocessados: 0,
      resolvidos: 0,
      falhas: 0,
      ignorados: 0,
    };

    for (const row of (rows ?? []) as Array<Record<string, unknown>>) {
      const externalId = typeof row.external_id === "string" ? row.external_id : null;
      if (!hasReplayArgs(row.replay_payload)) {
        // Payload incompleto (linha antiga, anterior ao replay_payload): não há
        // como reprocessar sem inventar argumento. Fica na fila, contabilizada.
        result.ignorados += 1;
        continue;
      }
      result.reprocessados += 1;
      const { error: rpcError } = await supabase.rpc("ingest_inbound_message", row.replay_payload);
      if (!rpcError) {
        const { error: markError } = await supabase
          .from("webhook_failures")
          .update({ resolved: true, resolved_at: new Date().toISOString() })
          .eq("id", row.id);
        if (markError) result.falhas += 1;
        else result.resolvidos += 1;
        continue;
      }
      // A falha não é silenciosa: a linha continua na fila com retry_count + 1.
      console.warn("[REPLAY] ingest_inbound_message falhou:", {
        externalId,
        code: rpcError.code ?? "sem-code",
      });
      const retryCount = typeof row.retry_count === "number" ? row.retry_count : 0;
      const { error: bumpError } = await supabase
        .from("webhook_failures")
        .update({ retry_count: retryCount + 1 })
        .eq("id", row.id);
      if (bumpError) console.error("[REPLAY] falha ao incrementar retry_count:", bumpError.code ?? "sem-code");
      result.falhas += 1;
    }

    return new Response(JSON.stringify(result), { status: 200, headers: jsonHeaders });
  } catch (err) {
    return internalErrorResponse(err, req);
  }
}

if (import.meta.main) {
  Deno.serve((req: Request) => handleWebhookReplay(req));
}
