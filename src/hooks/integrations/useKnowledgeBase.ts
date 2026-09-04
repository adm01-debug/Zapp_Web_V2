import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/ui/use-toast';

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

export const CATEGORIES = ['general', 'product', 'support', 'sales', 'onboarding', 'technical', 'faq'];

export const CATEGORY_LABELS: Record<string, string> = {
  general: 'Geral', product: 'Produto', support: 'Suporte', sales: 'Vendas',
  onboarding: 'Onboarding', technical: 'Técnico', faq: 'FAQ'
};

export function useKnowledgeBase() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [files, setFiles] = useState<KBFile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [articlesRes, filesRes] = await Promise.all([
      supabase.from('knowledge_base_articles').select('*').order('updated_at', { ascending: false }),
      supabase.from('knowledge_base_files').select('*').order('created_at', { ascending: false }),
    ]);
    if (articlesRes.data) setArticles(articlesRes.data.map((a) => ({ ...a, tags: a.tags || [] })));
    if (filesRes.data) setFiles(filesRes.data);
    setLoading(false);
  }, []);

  const saveArticle = useCallback(async (payload: { title: string; content: string; category: string; tags: string[]; is_published: boolean }, editingId?: string) => {
    if (editingId) {
      const { error } = await supabase.from('knowledge_base_articles').update(payload).eq('id', editingId);
      if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return false; }
      toast({ title: 'Artigo atualizado!' });
    } else {
      const { error } = await supabase.from('knowledge_base_articles').insert(payload);
      if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return false; }
      toast({ title: 'Artigo criado!' });
    }
    fetchData();
    return true;
  }, [fetchData]);

  const deleteArticle = useCallback(async (id: string) => {
    await supabase.from('knowledge_base_articles').delete().eq('id', id);
    toast({ title: 'Artigo removido' });
    fetchData();
  }, [fetchData]);

  const uploadFile = useCallback(async (file: File) => {
    const fileName = `kb/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage.from('whatsapp-media').upload(fileName, file);
    if (uploadError) { toast({ title: 'Erro no upload', description: uploadError.message, variant: 'destructive' }); return; }
    const { data: locatorData } = supabase.storage.from('whatsapp-media').getPublicUrl(fileName);
    if (!locatorData?.publicUrl) {
      toast({ title: 'Erro', description: 'Não foi possível criar a referência durável do arquivo.', variant: 'destructive' });
      return;
    }
    const { error: insertError } = await supabase.from('knowledge_base_files').insert({ file_name: file.name, file_url: locatorData.publicUrl, file_type: file.type, file_size: file.size });
    if (insertError) {
      await supabase.storage.from('whatsapp-media').remove([fileName]);
      toast({ title: 'Erro', description: insertError.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Arquivo enviado!', description: file.name });
    fetchData();
  }, [fetchData]);

  return { articles, files, loading, fetchData, saveArticle, deleteArticle, uploadFile };
}
