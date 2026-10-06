import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleCors, errorResponse, jsonResponse, requireEnv, checkRateLimit, getClientIP, Logger } from "../_shared/validation.ts";

/**
 * T73 / item 62 — entrega a gravacao da chamada ao dono, com o JWT dele.
 *
 * CONTRATO: a resposta e JSON `{ "url": "<url da gravacao>" }` (200). E o que o player consome:
 * `useCallRecording` le `data.url` e `RecordingPlayer` monta `<audio src={url}>` e o link de
 * download com essa URL. Corpo de audio cru (Blob) nao tem `.url` — era o defeito do item 62:
 * a Edge respondia `new Response(upstream.body)` com Content-Type de audio, o player devolvia
 * null e a gravacao disponivel nunca aparecia para ouvir.
 *
 * O QUE PROTEGE A GRAVACAO: quem decide o que existe e a RLS do proprio chamador (cliente com o
 * JWT dele) — chamada de outro agente nao aparece e vira 403, sem JWT e 401. A URL do provedor
 * so chega a quem ja podia ouvir a chamada, e so depois de a origem confirmar que o audio existe
 * (502 se ela nao responder). A resposta sai com `Cache-Control: no-store`, entao intermediario
 * nao guarda essa URL temporaria.
 *
 * Aceite: com JWT e dono -> 200 (JSON com `url`); com JWT de outro agente -> 403; sem JWT -> 401.
 */

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
  /** Confere na origem que a gravacao existe antes de entregar a URL ao player. */
  buscarOrigem(url: string): Promise<Response>;
}

export const depsReais: GetCallRecordingDeps = {
  clienteDoChamador: (authHeader) =>
    createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    }) as unknown as ClienteDoChamador,
  buscarOrigem: (url) => fetch(url),
};

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

    // A origem precisa estar de pe agora: antes este mesmo ramo devolvia 502 quando o audio
    // tinha sumido. O corpo do probe nao e consumido — quem baixa o audio e o <audio> do
    // player, direto na URL (com o Range que ele quiser); aqui so se confirma que existe.
    const origem = await deps.buscarOrigem(chamada.recording_url);
    if (!origem.ok && origem.status !== 206) {
      logger.error("upstream da gravacao falhou", { status: origem.status });
      return errorResponse("Gravacao indisponivel na origem", 502, req);
    }
    try {
      await origem.body?.cancel();
    } catch {
      // Descartar o corpo do probe nao decide a resposta — a URL ja foi validada acima.
    }

    return jsonResponse({ url: chamada.recording_url }, 200, req);
  } catch (erro) {
    logger.error("falha inesperada", { erro: String(erro) });
    return errorResponse("Erro inesperado", 500, req);
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleGetCallRecording(req));
}
