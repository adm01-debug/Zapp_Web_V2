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
 * Segurança: a escrita usa service role porque também precisa baixar storage e
 * gravar status, mas só depois de autenticar o usuário e exigir o mesmo papel
 * que a RLS da base de conhecimento usa para gestão (`is_admin_or_supervisor`).
 * Corrida: o arquivo é reivindicado com UPDATE condicional antes de qualquer
 * download/INSERT; se outra chamada já reivindicou, esta não publica artigo.
 */
const FILE_COLUMNS = "id, file_name, file_url, file_type, processing_status, article_id";
const CLAIMABLE_STATUSES = ["pending", "failed", "unsupported"];

type KbFileRow = {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  processing_status: string | null;
  article_id: string | null;
};

type EdgeLogger = {
  error: (message: string, ctx?: Record<string, unknown>) => void;
  warn: (message: string, ctx?: Record<string, unknown>) => void;
  info: (message: string, ctx?: Record<string, unknown>) => void;
};

function errorMessage(error: unknown): string {
  return error && typeof error === "object" && "message" in error && typeof error.message === "string"
    ? error.message
    : String(error);
}

async function requireKnowledgeBaseManager(
  supabase: SupabaseClient,
  userId: string,
  req: Request,
  log: EdgeLogger,
): Promise<Response | null> {
  const { data: canManage, error } = await supabase.rpc("is_admin_or_supervisor", { _user_id: userId });
  if (error) {
    log.error("falha ao checar papel para ingestao da base", { error: errorMessage(error), userId });
    return errorResponse("Forbidden", 403, req);
  }
  if (canManage !== true) return errorResponse("Forbidden", 403, req);
  return null;
}

async function claimFileForProcessing(
  supabase: SupabaseClient,
  fileId: string,
): Promise<{ file: KbFileRow | null; error: unknown }> {
  const { data, error } = await supabase
    .from("knowledge_base_files")
    .update({ processing_status: "processing" })
    .eq("id", fileId)
    .in("processing_status", CLAIMABLE_STATUSES)
    .select(FILE_COLUMNS)
    .maybeSingle();
  return { file: data as KbFileRow | null, error };
}

async function loadFile(
  supabase: SupabaseClient,
  fileId: string,
): Promise<{ file: KbFileRow | null; error: unknown }> {
  const { data, error } = await supabase
    .from("knowledge_base_files")
    .select(FILE_COLUMNS)
    .eq("id", fileId)
    .maybeSingle();
  return { file: data as KbFileRow | null, error };
}

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

    const roleGate = await requireKnowledgeBaseManager(supabase, userId, req, log);
    if (roleGate) return roleGate;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Corpo JSON invalido", 400, req);
    }
    const rawFileId = (body as { fileId?: unknown } | null)?.fileId;
    if (!isValidUUID(rawFileId)) return errorResponse("fileId invalido", 400, req);
    const fileId = rawFileId as string;

    const claimed = await claimFileForProcessing(supabase, fileId);
    if (claimed.error) {
      log.error("falha ao reivindicar o arquivo", { error: errorMessage(claimed.error), fileId });
      return errorResponse("Falha ao carregar o arquivo", 500, req);
    }

    const file = claimed.file;
    if (!file) {
      const current = await loadFile(supabase, fileId);
      if (current.error) {
        log.error("falha ao carregar o arquivo", { error: errorMessage(current.error), fileId });
        return errorResponse("Falha ao carregar o arquivo", 500, req);
      }
      if (!current.file) return errorResponse("Arquivo nao encontrado", 404, req);
      if (current.file.processing_status === "completed" && current.file.article_id) {
        return jsonResponse(
          { status: "completed", articleId: current.file.article_id, extractedChars: 0, idempotent: true },
          200,
          req,
        );
      }
      return errorResponse("Arquivo ja esta em processamento", 409, req);
    }

    const markStatus = async (status: string, patch: Record<string, unknown> = {}): Promise<void> => {
      const { error } = await supabase
        .from("knowledge_base_files")
        .update({ processing_status: status, ...patch })
        .eq("id", fileId);
      if (error) throw new Error(`falha ao gravar processing_status=${status}: ${errorMessage(error)}`);
    };

    const removeArticle = async (articleId: string): Promise<void> => {
      const { error } = await supabase
        .from("knowledge_base_articles")
        .delete()
        .eq("id", articleId);
      if (error) throw new Error(`falha ao remover artigo publicado apos erro de vinculo: ${errorMessage(error)}`);
    };

    let createdArticleId: string | null = null;
    let completedLinked = false;

    try {
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
        throw new Error(`falha ao baixar o objeto: ${downloadError ? errorMessage(downloadError) : "sem conteudo"}`);
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
          // Nenhuma embedding é gerada aqui; a busca lexical usa search_vector gerado pelo banco.
          embedding_status: "pending",
          created_by: userId,
        })
        .select("id")
        .single();
      if (insertError || !created?.id) {
        throw new Error(`falha ao criar o artigo: ${insertError ? errorMessage(insertError) : "sem id"}`);
      }
      createdArticleId = String(created.id);

      await markStatus("completed", { article_id: createdArticleId, extracted_text: extraction.text });
      completedLinked = true;

      log.info("documento ingerido", { fileId, articleId: createdArticleId, chars: extraction.text.length });
      return jsonResponse(
        { status: "completed", articleId: createdArticleId, extractedChars: extraction.text.length },
        200,
        req,
      );
    } catch (err) {
      // Erro NÃO engolido: se o artigo já foi publicado mas o vínculo/completed falhou,
      // desfaz a publicação antes de liberar retry; assim o retry não duplica artigo.
      const detail = err instanceof Error ? err.message : String(err);
      let rollbackDetail: string | null = null;
      if (createdArticleId && !completedLinked) {
        try {
          await removeArticle(createdArticleId);
        } catch (rollbackErr) {
          rollbackDetail = rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
          log.error("nao foi possivel remover artigo apos falha de vinculo", { fileId, articleId: createdArticleId, error: rollbackDetail });
        }
      }
      try {
        await markStatus("failed");
      } catch (markErr) {
        log.error("nao foi possivel gravar processing_status=failed", {
          error: markErr instanceof Error ? markErr.message : String(markErr),
        });
      }
      log.error("ingestao falhou", { fileId, error: rollbackDetail ? `${detail}; ${rollbackDetail}` : detail });
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
