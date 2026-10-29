/**
 * Outbox durável do log essencial de IA — consumidor de produção (IA-TIMEOUT-001).
 *
 * Defeito que este consumidor fecha: `_shared/ai-usage.ts` já grava a pendência
 * durável em `public.ai_usage_outbox` quando o insert em `ai_usage_logs` falha
 * (conflito transitório, rede fora) e `reprocessarLogEssencial` já sabe drenar
 * essa fila — mas nada em produção chamava o reprocessador, então a fila só
 * crescia.
 *
 * Arquitetura (a da `dia`), lida do próprio reprocessador:
 *   - fila: tabela PÚBLICA `public.ai_usage_outbox`, chave `id` (uuid, PK);
 *   - leitura: `GET /rest/v1/ai_usage_outbox?select=id,payload,tentativas`
 *     `&processed_at=is.null&order=tentativas.asc,created_at.asc&limit=<n>`;
 *   - baixa: `PATCH /rest/v1/ai_usage_outbox?id=eq.<id>`;
 *   - `log_key` NÃO é coluna da fila: é a chave de idempotência do LOG, em
 *     `ai_usage_logs.metadata.log_key`.
 * A credencial de banco (service role) fica DENTRO do reprocessador; este
 * handler nunca monta cliente privilegiado a partir do que o chamador manda.
 *
 * Proteção — igual à das demais funções de cron:
 *   - só o header `x-cron-secret` autoriza, conferido em TEMPO CONSTANTE contra
 *     o `CRON_SECRET` do ambiente;
 *   - `anon`/JWT de usuário/`apikey` NÃO autorizam;
 *   - fail-closed: segredo ausente/vazio ou header ausente ⇒ 401 e a fila não é
 *     lida nem tocada.
 *
 * Lote limitado: o corpo aceita `{"limite": n}`, preso a [1, 500], padrão 50 —
 * a fila drena em pedaços, sem um run gigante reprocessando o backlog inteiro.
 *
 * Erro do reprocessamento sai como 500 SEM texto interno: o detalhe (que pode
 * trazer URL/erro de banco) vai só para o log do servidor.
 */
import {
  reprocessarLogEssencial,
  type ResultadoReprocessamentoLogEssencial,
} from "../_shared/ai-usage.ts";
import { timingSafeStringEqual } from "../_shared/cron-secret-auth.ts";
import { errorResponse, internalErrorResponse, jsonResponse } from "../_shared/validation.ts";

/** Tamanho do lote quando a requisição não pede outro. */
export const LIMITE_PADRAO = 50;
/** Teto do lote: um run nunca reprocessa o backlog inteiro. */
export const LIMITE_MAXIMO = 500;

export interface AiUsageOutboxDrainDeps {
  /** Reprocessador. O teste troca por um espião; produção usa o real. */
  reprocessar?: (limite: number) => Promise<ResultadoReprocessamentoLogEssencial>;
  /** Override do `CRON_SECRET` (o teste não mexe no env do processo). */
  cronSecret?: string;
}

/** `limite` → inteiro em [1, 500]; qualquer coisa ilegível vira o padrão. */
export function normalizarLimite(bruto: unknown): number {
  const numero = typeof bruto === "number" ? bruto : Number(bruto);
  if (!Number.isFinite(numero)) return LIMITE_PADRAO;
  return Math.max(1, Math.min(LIMITE_MAXIMO, Math.floor(numero)));
}

async function limiteDaRequisicao(req: Request): Promise<number> {
  try {
    const corpo = (await req.json()) as unknown;
    if (corpo !== null && typeof corpo === "object") {
      const bruto = (corpo as Record<string, unknown>).limite;
      return normalizarLimite(bruto === undefined ? LIMITE_PADRAO : bruto);
    }
  } catch {
    // Sem corpo JSON (ou corpo inválido): usa o padrão — nunca falha por isso.
  }
  return LIMITE_PADRAO;
}

export async function handleAiUsageOutboxDrain(
  req: Request,
  deps: AiUsageOutboxDrainDeps = {},
): Promise<Response> {
  // ── Autorização primeiro: sem credencial de cron não se toca na fila ──
  const cronSecret = deps.cronSecret !== undefined
    ? deps.cronSecret
    : (Deno.env.get("CRON_SECRET") ?? "");
  const headerDoCron = req.headers.get("x-cron-secret");
  // Fail-closed: segredo do ambiente vazio não autoriza nada.
  const autorizado = cronSecret !== "" && headerDoCron !== null &&
    timingSafeStringEqual(headerDoCron, cronSecret);
  if (!autorizado) {
    return errorResponse("Unauthorized", 401, req);
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405, req);
  }

  const limite = await limiteDaRequisicao(req);
  const reprocessar = deps.reprocessar ?? reprocessarLogEssencial;

  let resultado: ResultadoReprocessamentoLogEssencial;
  try {
    resultado = await reprocessar(limite);
  } catch (erro) {
    // Detalhe do erro só no log do servidor (internalErrorResponse loga e
    // devolve corpo genérico).
    return internalErrorResponse(erro, req);
  }

  if (resultado.falha !== null) {
    // `falha` carrega texto interno (ex.: `leitura:<msg>`); ele NÃO vai ao
    // cliente — só o log do servidor.
    return internalErrorResponse(new Error(`reprocessamento_falhou:${resultado.falha}`), req);
  }

  return jsonResponse({
    ok: true,
    lidos: resultado.lidos,
    entregues: resultado.entregues,
    pendentes: resultado.pendentes,
    esgotadas: resultado.esgotadas,
  }, 200, req);
}

if (import.meta.main) {
  Deno.serve((req) => handleAiUsageOutboxDrain(req));
}
