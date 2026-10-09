import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, requireEnv, checkRateLimit, getClientIP, Logger } from "../_shared/validation.ts";

/**
 * T73 / item 62 — entrega a gravacao da chamada SEM expor a URL.
 *
 * O front nunca recebe `recording_url`: ele pede o audio aqui, com o proprio JWT, e a
 * funcao confere o dono pela RLS antes de buscar. Isso resolve dois problemas de uma vez:
 * (1) a URL do provedor costuma ser assinada e temporaria, e (2) se ela vazasse no HTML,
 * qualquer um com o link ouviria a ligacao de outra pessoa.
 *
 * Aceite: com JWT e dono -> 200 (stream de audio); com JWT de outro agente -> 403;
 * sem JWT -> 401. O item 62 fica no hook: ele consome este stream como Blob, em vez de
 * esperar JSON `{ url }`.
 */
export function cabecalhosDoAudio(
  de: { tipo?: string | null; tamanho?: string | null; faixa?: string | null; aceita?: string | null },
  cors: Record<string, string>,
): Record<string, string> {
  const cabecalhos: Record<string, string> = {
    ...cors,
    "Content-Type": de.tipo ?? "audio/mpeg",
    "Accept-Ranges": de.aceita ?? "bytes",
    "Cache-Control": "private, no-store",
  };
  if (de.tamanho) cabecalhos["Content-Length"] = de.tamanho;
  if (de.faixa) cabecalhos["Content-Range"] = de.faixa;
  return cabecalhos;
}

// ── Costura de injecao (item 62) ─────────────────────────────────────────────
// O handler exportado recebe o que faz efeito (o cliente com o JWT do chamador e a busca
// na origem) para o teste chamar o handler REAL com um `Request` e conferir status E corpo
// — sem banco e sem provedor. Os valores reais sao montados no `depsReais`, dentro do
// default, e nenhum deles e resolvido no import do modulo.

export interface LinhaDaChamada {
  id: string;
  recording_status: string | null;
  recording_url: string | null;
}

interface ConsultaDaChamada {
  select(colunas: string): ConsultaDaChamada;
  eq(coluna: string, valor: string): ConsultaDaChamada;
  maybeSingle(): Promise<{ data: LinhaDaChamada | null; error: { message?: string } | null }>;
}

export interface ClienteDoChamador {
  auth: {
    getUser(): Promise<{ data: { user: { id: string } | null } | null; error: unknown }>;
  };
  from(tabela: string): ConsultaDaChamada;
}

export interface GetCallRecordingDeps {
  /** Cliente com o JWT do chamador: quem decide o que ele pode ler e a RLS. */
  clienteDoChamador(authHeader: string): ClienteDoChamador;
  /** Busca a gravacao na origem, repassando o Range do cliente quando houver. */
  buscarOrigem(url: string, range: string | null): Promise<Response>;
}

export const depsReais: GetCallRecordingDeps = {
  clienteDoChamador: (authHeader) =>
    createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    }) as unknown as ClienteDoChamador,
  buscarOrigem: (url, range) => fetch(url, { headers: range ? { Range: range } : {} }),
};

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, range" };

export async function handleGetCallRecording(
  req: Request,
  deps: GetCallRecordingDeps = depsReais,
): Promise<Response> {
  // (o Deno.serve fica no fim, sob import.meta.main: importar este modulo num teste
  //  nao pode subir um servidor na porta 8000.)
  const logger = new Logger("get-call-recording");
  const preflight = handleCors(req);
  if (preflight) return preflight;

  if (req.method !== "GET" && req.method !== "POST") {
    return errorResponse("Method not allowed", 405, req);
  }

  try {
    const rl = await checkRateLimit(`recording:${getClientIP(req)}`, 60, 60_000);
    if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Unauthorized", 401, req);

    // Cliente com o JWT do usuario: quem decide o que ele pode ler e a RLS, nao esta funcao.
    const supabase = deps.clienteDoChamador(authHeader);

    const { data: usuario, error: erroAuth } = await supabase.auth.getUser();
    if (erroAuth || !usuario?.user) return errorResponse("Invalid or expired token", 401, req);

    const { callId } = req.method === "GET"
      ? { callId: new URL(req.url).searchParams.get("callId") }
      : await req.json().catch(() => ({ callId: null }));

    if (!callId) return errorResponse("callId obrigatorio", 400, req);

    // A leitura passa pela RLS: chamada de outro agente simplesmente nao aparece.
    const { data: chamada, error } = await supabase
      .from("calls")
      .select("id, recording_status, recording_url")
      .eq("id", callId)
      .maybeSingle();

    if (error) {
      logger.error("erro lendo a chamada", { erro: error.message });
      return errorResponse("Erro ao ler a chamada", 500, req);
    }
    if (!chamada) return errorResponse("Chamada nao encontrada", 403, req);
    if (chamada.recording_status !== "available" || !chamada.recording_url) {
      return errorResponse("Sem gravacao disponivel", 404, req);
    }

    // Repassa o Range do cliente: quando chamado direto por <audio>, ele pode pedir um trecho.
    const range = req.headers.get("Range");
    const upstream = await deps.buscarOrigem(chamada.recording_url, range);

    if (!upstream.ok && upstream.status !== 206) {
      logger.error("upstream da gravacao falhou", { status: upstream.status });
      return errorResponse("Gravacao indisponivel na origem", 502, req);
    }

    const headers = cabecalhosDoAudio({
      tipo: upstream.headers.get("Content-Type"),
      tamanho: upstream.headers.get("Content-Length"),
      faixa: upstream.headers.get("Content-Range"),
      aceita: upstream.headers.get("Accept-Ranges"),
    }, cors);

    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (erro) {
    logger.error("falha inesperada", { erro: String(erro) });
    return errorResponse("Erro inesperado", 500, req);
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleGetCallRecording(req));
}
