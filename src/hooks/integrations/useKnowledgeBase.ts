import { useState, useCallback } from 'react';
import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';
import { toast } from '@/hooks/ui/use-toast';
import { parseSupabaseStorageObjectUrl } from '@/lib/storage_object_reference';

export interface Article {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  is_published: boolean;
  embedding_status: string;
  created_at: string;
  updated_at: string;
}

export interface KBFile {
  id: string;
  article_id: string | null;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  processing_status: string;
  created_at: string;
}

export const CATEGORIES = [
  'general',
  'product',
  'support',
  'sales',
  'onboarding',
  'technical',
  'faq',
];

export const CATEGORY_LABELS: Record<string, string> = {
  general: 'Geral',
  product: 'Produto',
  support: 'Suporte',
  sales: 'Vendas',
  onboarding: 'Onboarding',
  technical: 'Técnico',
  faq: 'FAQ',
};

/** Bucket dos arquivos da Base de Conhecimento. */
export const KB_STORAGE_BUCKET = 'whatsapp-media';

/** Validade da URL assinada gravada no upload (1 dia). */
const KB_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24;

/**
 * Origem do Storage deste projeto — lista de PERMITIDOS. Sem ela, uma referência
 * de outro host não vira uma remoção de objeto por engano.
 */
function kbStorageAllowedOrigins(): string[] {
  try {
    return [new URL(SUPABASE_URL).origin];
  } catch {
    return [];
  }
}

export function useKnowledgeBase() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [files, setFiles] = useState<KBFile[]>([]);
  const [loading, setLoading] = useState(true);
  // t_1944d290: antes só checava `data` — um erro de rede/RLS deixava
  // articles/files vazios e a tela anunciava "Nenhum arquivo enviado" com a
  // leitura quebrada. `error` distingue "sem dado" de "a leitura falhou".
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [articlesRes, filesRes] = await Promise.all([
      supabase
        .from('knowledge_base_articles')
        .select('*')
        .order('updated_at', { ascending: false }),
      supabase.from('knowledge_base_files').select('*').order('created_at', { ascending: false }),
    ]);
    const failureMessage = articlesRes.error?.message ?? filesRes.error?.message ?? null;
    if (failureMessage) {
      setError(failureMessage);
      setArticles([]);
      setFiles([]);
      setLoading(false);
      return;
    }
    setError(null);
    if (articlesRes.data)
      setArticles(articlesRes.data.map((a) => ({ ...a, tags: a.tags || [] })) as Article[]);
    if (filesRes.data) setFiles(filesRes.data as KBFile[]);
    setLoading(false);
  }, []);

  const saveArticle = useCallback(
    async (
      payload: {
        title: string;
        content: string;
        category: string;
        tags: string[];
        is_published: boolean;
      },
      editingId?: string
    ) => {
      if (editingId) {
        const { error } = await supabase
          .from('knowledge_base_articles')
          .update(payload)
          .eq('id', editingId);
        if (error) {
          toast({ title: 'Erro', description: error.message, variant: 'destructive' });
          return false;
        }
        toast({ title: 'Artigo atualizado!' });
      } else {
        const { error } = await supabase.from('knowledge_base_articles').insert(payload);
        if (error) {
          toast({ title: 'Erro', description: error.message, variant: 'destructive' });
          return false;
        }
        toast({ title: 'Artigo criado!' });
      }
      fetchData();
      return true;
    },
    [fetchData]
  );

  const deleteArticle = useCallback(
    async (id: string) => {
      // R2-API-053: o DELETE era descartado e a remoção era anunciada mesmo com error.
      // O sucesso só sai depois do aceite da persistência.
      const { error } = await supabase.from('knowledge_base_articles').delete().eq('id', id);
      if (error) {
        toast({
          title: 'Erro ao remover artigo',
          description: error.message,
          variant: 'destructive',
        });
        return false;
      }
      toast({ title: 'Artigo removido' });
      fetchData();
      return true;
    },
    [fetchData]
  );

  const uploadFile = useCallback(
    async (file: File) => {
      const fileName = `kb/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from(KB_STORAGE_BUCKET)
        .upload(fileName, file);
      if (uploadError) {
        toast({
          title: 'Erro no upload',
          description: uploadError.message,
          variant: 'destructive',
        });
        return;
      }
      // Bucket privado: `getPublicUrl` devolvia um locator que NÃO abre. A URL
      // assinada é a referência que abre o objeto. O pipeline (`ai-kb-ingest`)
      // reextrai bucket+caminho da referência e baixa com a chave de serviço, então
      // o processamento não depende da validade do token gravado.
      const { data: signed, error: signError } = await supabase.storage
        .from(KB_STORAGE_BUCKET)
        .createSignedUrl(fileName, KB_SIGNED_URL_TTL_SECONDS);
      const signedUrl = signed?.signedUrl;
      if (signError || !signedUrl) {
        await supabase.storage.from(KB_STORAGE_BUCKET).remove([fileName]);
        toast({
          title: 'Erro',
          description: signError?.message ?? 'Não foi possível criar a URL assinada do arquivo.',
          variant: 'destructive',
        });
        return;
      }
      const { data: inserted, error: insertError } = await supabase
        .from('knowledge_base_files')
        .insert({
          file_name: file.name,
          file_url: signedUrl,
          file_type: file.type,
          file_size: file.size,
        })
        .select('id')
        .single();
      if (insertError || !inserted?.id) {
        await supabase.storage.from(KB_STORAGE_BUCKET).remove([fileName]);
        toast({
          title: 'Erro',
          description: insertError?.message ?? 'Não foi possível registrar o arquivo.',
          variant: 'destructive',
        });
        return;
      }
      // R2-API-054: o arquivo só vira conhecimento DEPOIS do processamento
      // (extração → artigo publicado → recuperável pela IA). Sem o pipeline o
      // documento ficava só armazenado e a tela prometia treino da IA à toa.
      const { data: ingest, error: ingestError } = await supabase.functions.invoke('ai-kb-ingest', {
        body: { fileId: inserted.id },
      });
      if (ingestError || !ingest || ingest.status === 'failed') {
        toast({
          title: 'Falha no processamento',
          description: 'O arquivo foi armazenado, mas não entrou no contexto da IA.',
          variant: 'destructive',
        });
      } else if (ingest.status === 'unsupported') {
        toast({
          title: 'Arquivo armazenado',
          description: 'Sem texto extraível neste formato: não entra no contexto da IA.',
        });
      } else {
        toast({ title: 'Documento processado', description: `${file.name} disponível para a IA` });
      }
      fetchData();
    },
    [fetchData]
  );

  const deleteFile = useCallback(
    async (id: string): Promise<boolean> => {
      // A linha guarda o objeto no Storage (`file_url`); sem ela não há o que remover.
      const { data: row, error: readError } = await supabase
        .from('knowledge_base_files')
        .select('id, file_url')
        .eq('id', id)
        .maybeSingle();
      if (readError || !row) {
        toast({
          title: 'Erro ao excluir arquivo',
          description: readError?.message ?? 'Arquivo não encontrado.',
          variant: 'destructive',
        });
        return false;
      }

      // A RLS de `knowledge_base_files` decide quem pode excluir (admin/supervisor).
      // `.select('id')` confere as linhas atingidas: DELETE barrado pela RLS não dá
      // erro, devolve zero linhas — e zero linhas não é sucesso (senão o objeto
      // seria removido de um arquivo que continua na base).
      const { data: removidas, error: deleteError } = await supabase
        .from('knowledge_base_files')
        .delete()
        .eq('id', id)
        .select('id');
      if (deleteError || !removidas || removidas.length === 0) {
        toast({
          title: 'Erro ao excluir arquivo',
          description: deleteError?.message ?? 'Nada foi excluído — verifique a permissão.',
          variant: 'destructive',
        });
        return false;
      }

      // Lista de PERMITIDOS: só o bucket/origem desta base. Referência estranha não
      // vira remoção de objeto.
      const reference = parseSupabaseStorageObjectUrl(
        row.file_url ?? '',
        [KB_STORAGE_BUCKET],
        kbStorageAllowedOrigins()
      );
      if (!reference) {
        fetchData();
        toast({
          title:
            'Arquivo removido da base, mas o objeto não foi localizado para exclusão no Storage.',
          variant: 'destructive',
        });
        return true;
      }

      const { error: removeError } = await supabase.storage
        .from(reference.bucket)
        .remove([reference.path]);
      fetchData();
      if (removeError) {
        toast({
          title: 'Arquivo removido da base, mas o objeto não pôde ser excluído do Storage.',
          description: removeError.message,
          variant: 'destructive',
        });
        return true;
      }
      toast({ title: 'Arquivo removido' });
      return true;
    },
    [fetchData]
  );

  const reprocessFile = useCallback(
    async (id: string): Promise<boolean> => {
      // A idempotência é do `ai-kb-ingest`: ele reivindica o arquivo com UPDATE
      // condicional e, quando já concluiu, devolve `idempotent` em vez de criar um
      // segundo artigo para o mesmo documento.
      const { data, error } = await supabase.functions.invoke('ai-kb-ingest', {
        body: { fileId: id },
      });
      if (error) {
        const httpStatus = (error as { context?: { status?: number } }).context?.status;
        fetchData();
        if (httpStatus === 409) {
          toast({
            title: 'Documento em processamento',
            description: 'Aguarde a conclusão atual antes de reprocessar.',
          });
          return false;
        }
        toast({
          title: 'Falha ao reprocessar',
          description: error.message,
          variant: 'destructive',
        });
        return false;
      }

      const outcome = data as { status?: string; idempotent?: boolean } | null;
      fetchData();
      if (outcome?.status === 'completed') {
        toast({
          title: outcome.idempotent ? 'Documento já processado' : 'Documento processado',
          description: outcome.idempotent
            ? 'Nada a refazer: o documento já está no contexto da IA.'
            : 'Disponível para a IA.',
        });
        return true;
      }
      if (outcome?.status === 'unsupported') {
        toast({
          title: 'Sem texto extraível',
          description: 'Este formato não entra no contexto da IA.',
          variant: 'destructive',
        });
        return false;
      }
      toast({
        title: 'Falha ao reprocessar',
        description: 'O documento não entrou no contexto da IA.',
        variant: 'destructive',
      });
      return false;
    },
    [fetchData]
  );

  return {
    articles,
    files,
    loading,
    error,
    fetchData,
    saveArticle,
    deleteArticle,
    uploadFile,
    deleteFile,
    reprocessFile,
  };
}
