import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/ui/use-toast';
import { useAuth } from '@/hooks/auth/useAuth';
import { log } from '@/lib/logger';

export interface Template {
  id: string;
  title: string;
  content: string;
  shortcut: string | null;
  category: string;
  use_count: number;
}

export function useMessageTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Guarda de montagem: resposta atrasada não grava estado depois do unmount.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const fetchTemplates = useCallback(async () => {
    if (!user) return;
    if (!isMountedRef.current) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('message_templates')
        .select('*')
        .order('use_count', { ascending: false });
      if (error) throw error;
      if (!isMountedRef.current) return;
      setTemplates((data || []) as Template[]);
    } catch (err) {
      log.error('Error fetching templates:', err);
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [user]);

  const addTemplate = useCallback(async (template: { title: string; content: string; shortcut: string; category: string }) => {
    if (!user || !template.title || !template.content) {
      toast({ title: "Campos obrigatórios", description: "Preencha título e conteúdo do template.", variant: "destructive" });
      return false;
    }
    try {
      const { error } = await supabase.from('message_templates').insert({
        user_id: user.id, title: template.title, content: template.content,
        shortcut: template.shortcut || null, category: template.category,
      });
      if (error) throw error;
      toast({ title: "Template criado!", description: "Seu template foi salvo com sucesso." });
      queryClient.invalidateQueries({ queryKey: ['quick-replies'] });
      await fetchTemplates();
      return true;
    } catch (err) {
      toast({ title: "Erro ao criar template", description: err instanceof Error ? err.message : 'Erro', variant: "destructive" });
      return false;
    }
  }, [user, toast, fetchTemplates, queryClient]);

  const updateTemplate = useCallback(async (template: Template) => {
    try {
      const { error } = await supabase.from('message_templates')
        .update({ title: template.title, content: template.content, shortcut: template.shortcut, category: template.category })
        .eq('id', template.id);
      if (error) throw error;
      toast({ title: "Template atualizado!", description: "As alterações foram salvas." });
      queryClient.invalidateQueries({ queryKey: ['quick-replies'] });
      await fetchTemplates();
      return true;
    } catch {
      toast({ title: "Erro ao atualizar", variant: "destructive" });
      return false;
    }
  }, [toast, fetchTemplates, queryClient]);

  const deleteTemplate = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('message_templates').delete().eq('id', id);
      if (error) throw error;
      toast({ title: "Template excluído", description: "O template foi removido." });
      queryClient.invalidateQueries({ queryKey: ['quick-replies'] });
      await fetchTemplates();
      return true;
    } catch {
      toast({ title: "Erro ao excluir", variant: "destructive" });
      return false;
    }
  }, [toast, fetchTemplates, queryClient]);

  // Contagem direta na tabela. A RPC atômica (`increment_quick_reply_use`) nasce
  // na migration do cartão pai (t_32034c99) e não existe neste recorte: o guard
  // de uso exige que o cartão só chame o que já está no catálogo.
  const incrementUseCount = useCallback(async (template: Template) => {
    const { error } = await supabase
      .from('message_templates')
      .update({ use_count: template.use_count + 1 })
      .eq('id', template.id);
    if (error) {
      toast({ title: "Erro ao registrar o uso", description: "Não foi possível contar o uso do template.", variant: "destructive" });
      log.error('Error incrementing template use:', error);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['quick-replies'] });
  }, [toast, queryClient]);

  return { templates, isLoading, fetchTemplates, addTemplate, updateTemplate, deleteTemplate, incrementUseCount };
}
