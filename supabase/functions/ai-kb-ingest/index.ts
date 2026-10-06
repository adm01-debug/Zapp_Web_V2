import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import {
  checkRateLimit,
  errorResponse,
  getClientIP,
  isValidUUID,
  jsonResponse,
  requireAuth,
  requireEnv,
} from "../_shared/validation.ts";
import { bootEdge, type EdgeInjected } from "../_shared/edge-boot.ts";
import {
  buildKbArticle,
  extractKbText,
  isKbTextExtractable,
  kbExtension,
  resolveKbStorageObject,
} from "../_shared/ai-kb-ingest.ts";

/**
 * ai-kb-ingest (R2-API-054 / item 227) — pipeline de ingestão da Base de
 * Conhecimento: baixa o arquivo do bucket PERMITIDO, extrai o texto e o publica
 * como `knowledge_base_articles` (é o que a IA lê), gravando o progresso por
 * arquivo em `knowledge_base_files.processing_status`.
 *
 * Antes: o upload criava só a linha do arquivo (`pending`, sem `article_id`),
 * então o documento nunca entrava no contexto da IA. Este handler é chamado
 * pelo `useKnowledgeBase.uploadFile` logo depois do INSERT.
 *
 * O arquivo só é dado como conhecimento DEPOIS de virar artigo publicado e
 * recuperável; formato sem extrator local fica `unsupported` (somente
 * armazenado). Nenhuma escrita é engolida: erro de gravação → 500.
 */
const FILE_COLUMNS = "id, file_name, file_url, file_type, processing_status, article_id";

export async function handleAiKbIngest(
  req: Request,
  _injected?: EdgeInjected<SupabaseClient>,
): Promise<Response> {
  const { cors, log, supabase } = bootEdge<SupabaseClient>(req, {
    fnName: "ai-kb-ingest",
    injected: _injected,
    makeClient: () => createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY")),
  });
  if (cors) return cors;

  if (req.method !== "POST") return errorResponse("Method not allowed", 405, req);

  const authCheck = await requireAuth(req);
  if (authCheck instanceof Response) return authCheck;
  const userId = authCheck.userId;

  try {
    const ip = getClientIP(req);
    if (!checkRateLimit(`kb-ingest:${ip}`, 20, 60_000).allowed) {
      return errorResponse("Rate limit exceeded", 429, req);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Corpo JSON invalido", 400, req);
    }
    const fileId = (body as { fileId?: unknown } | null)?.fileId;
    if (!isValidUUID(fileId)) return errorResponse("fileId invalido", 400, req);

    const { data: file, error: loadError } = await supabase
      .from("knowledge_base_files")
      .select(FILE_COLUMNS)
      .eq("id", fileId)
      .maybeSingle();
    if (loadError) {
      log.error("falha ao carregar o arquivo", { error: loadError.message });
      return errorResponse("Falha ao carregar o arquivo", 500, req);
    }
    if (!file) return errorResponse("Arquivo nao encontrado", 404, req);

    // Idempotência: já processado não gera segundo artigo (repetir a chamada é seguro).
    if (file.processing_status === "completed" && file.article_id) {
      return jsonResponse(
        { status: "completed", articleId: file.article_id, extractedChars: 0, idempotent: true },
        200,
        req,
      );
    }

    const markStatus = async (status: string, patch: Record<string, unknown> = {}): Promise<void> => {
      const { error } = await supabase
        .from("knowledge_base_files")
        .update({ processing_status: status, ...patch })
        .eq("id", fileId);
      if (error) throw new Error(`falha ao gravar processing_status=${status}: ${error.message}`);
    };

    try {
      await markStatus("processing");

      // Lista de PERMITIDOS: host do projeto + bucket conhecido. Fora disso, nada é baixado.
      const target = resolveKbStorageObject(file.file_url, requireEnv("SUPABASE_URL"));
      if (!target) {
        await markStatus("failed");
        log.warn("file_url recusada: destino fora do storage do projeto", { fileId });
        return errorResponse("file_url nao aponta para o storage do projeto", 422, req);
      }

      const ext = kbExtension(file.file_name, file.file_type);
      if (!isKbTextExtractable(ext)) {
        await markStatus("unsupported");
        return jsonResponse(
          {
            status: "unsupported",
            articleId: null,
            extractedChars: 0,
            reason: `sem extrator local para .${ext || "desconhecido"} — arquivo apenas armazenado`,
          },
          200,
          req,
        );
      }

      const { data: blob, error: downloadError } = await supabase.storage
        .from(target.bucket)
        .download(target.objectPath);
      if (downloadError || !blob) {
        throw new Error(`falha ao baixar o objeto: ${downloadError?.message ?? "sem conteudo"}`);
      }

      const extraction = extractKbText(new Uint8Array(await blob.arrayBuffer()), ext);
      if (!extraction.ok) {
        await markStatus("unsupported");
        return jsonResponse(
          { status: "unsupported", articleId: null, extractedChars: 0, reason: extraction.reason },
          200,
          req,
        );
      }

      const article = buildKbArticle(file.file_name, extraction.text);
      const { data: created, error: insertError } = await supabase
        .from("knowledge_base_articles")
        .insert({
          title: article.title,
          content: article.content,
          category: "general",
          tags: ["documento", "upload"],
          is_published: true,
          embedding_status: "completed",
          created_by: userId,
        })
        .select("id")
        .single();
      if (insertError || !created?.id) {
        throw new Error(`falha ao criar o artigo: ${insertError?.message ?? "sem id"}`);
      }

      await markStatus("completed", { article_id: created.id, extracted_text: extraction.text });

      log.info("documento ingerido", { fileId, articleId: created.id, chars: extraction.text.length });
      return jsonResponse(
        { status: "completed", articleId: created.id, extractedChars: extraction.text.length },
        200,
        req,
      );
    } catch (err) {
      // Erro NÃO engolido: registra o desfecho por arquivo e falha visível.
      const detail = err instanceof Error ? err.message : String(err);
      try {
        await markStatus("failed");
      } catch (markErr) {
        log.error("nao foi possivel gravar processing_status=failed", {
          error: markErr instanceof Error ? markErr.message : String(markErr),
        });
      }
      log.error("ingestao falhou", { fileId, error: detail });
      return errorResponse("Falha ao processar o documento", 500, req);
    }
  } catch (err) {
    log.error("erro inesperado", { error: err instanceof Error ? err.message : String(err) });
    return errorResponse("Internal server error", 500, req);
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleAiKbIngest(req));
}
