import { reprocessarOutboxDeLog } from "../_shared/ai-usage.ts";

const DEFAULT_LIMITE = 50;
const MAX_LIMITE = 500;

function respostaJson(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function serviceRoleAutorizado(req: Request, serviceRoleKey: string): boolean {
  const authorization = req.headers.get("authorization") ?? "";
  const apikey = req.headers.get("apikey") ?? "";
  return authorization === `Bearer ${serviceRoleKey}` || apikey === serviceRoleKey;
}

async function limiteDaRequisicao(req: Request): Promise<number> {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const bruto = typeof body === "object" && body !== null ? (body as Record<string, unknown>).limite : null;
  const numero = typeof bruto === "number" ? bruto : Number(bruto ?? DEFAULT_LIMITE);
  if (!Number.isFinite(numero)) return DEFAULT_LIMITE;
  return Math.max(1, Math.min(MAX_LIMITE, Math.floor(numero)));
}

/**
 * Consumidor real da outbox de logs essenciais de IA.
 *
 * A fila mora no schema `internal` e só é lida/baixada por RPCs concedidas a
 * `service_role`; este handler também exige a service role no Authorization (ou
 * apikey) antes de chamar `reprocessarOutboxDeLog`. Assim um cron/scheduler
 * interno pode drenar pendentes sem expor a fila para `anon`/`authenticated`.
 */
export async function handleAiUsageOutboxDrain(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return respostaJson({ ok: false, error: "method_not_allowed" }, 405);
  }

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) {
    return respostaJson({ ok: false, error: "service_role_missing" }, 503);
  }
  if (!serviceRoleAutorizado(req, serviceRoleKey)) {
    return respostaJson({ ok: false, error: "unauthorized" }, 401);
  }

  const limite = await limiteDaRequisicao(req);
  const resultado = await reprocessarOutboxDeLog(limite);
  return respostaJson({ ok: resultado.falha === null, ...resultado }, resultado.falha === null ? 200 : 503);
}

if (import.meta.main) Deno.serve(handleAiUsageOutboxDrain);
