import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { toast } from 'sonner';
import { log } from '@/lib/logger';

export interface WhatsAppTemplate {
  [key: string]: unknown;
  id: string;
  name: string;
  category: string;
  language: string;
  content: string;
  header_text: string | null;
  footer_text: string | null;
  buttons: Record<string, unknown>[] | null;
  variables: string[] | null;
  status: string;
  whatsapp_connection_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const TEMPLATE_CATEGORIES = [
  { value: 'marketing', label: 'Marketing', color: 'bg-info/20 text-info' },
  { value: 'utility', label: 'Utilidade', color: 'bg-success/20 text-success' },
  { value: 'authentication', label: 'Autenticação', color: 'bg-primary/20 text-primary' },
];

export const TEMPLATE_LANGUAGES = [
  { value: 'pt_BR', label: 'Português (BR)' },
  { value: 'en_US', label: 'English (US)' },
  { value: 'es', label: 'Español' },
];

// R2-MOD-067: `whatsapp_templates.status` é o estado do CADASTRO LOCAL. O formulário
// não define aprovação oficial; todo rótulo diz que o estado é local porque hoje não há
// fluxo neste repositório que grave retorno da Meta nesta tabela para comprovar
// "Aprovado" como selo oficial do WhatsApp Business API.
export const TEMPLATE_STATUS_SCOPE = 'local' as const;

export const STATUS_BADGES: Record<string, { label: string; className: string; iconName: string; scope: typeof TEMPLATE_STATUS_SCOPE }> = {
  approved: { label: 'Aprovado (local)', className: 'bg-success/20 text-success', iconName: 'CheckCircle2', scope: TEMPLATE_STATUS_SCOPE },
  pending: { label: 'Pendente (local)', className: 'bg-warning/20 text-warning', iconName: 'Clock', scope: TEMPLATE_STATUS_SCOPE },
  rejected: { label: 'Rejeitado (local)', className: 'bg-destructive/20 text-destructive', iconName: 'XCircle', scope: TEMPLATE_STATUS_SCOPE },
  draft: { label: 'Rascunho local', className: 'bg-muted text-muted-foreground', iconName: 'FileText', scope: TEMPLATE_STATUS_SCOPE },
};

export const EMPTY_TEMPLATE: Partial<WhatsAppTemplate> = {
  name: '', category: 'utility', language: 'pt_BR', content: '',
  header_text: '', footer_text: '', buttons: [], variables: [], status: 'draft',
};

export function useWhatsAppTemplates() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Partial<WhatsAppTemplate>>(EMPTY_TEMPLATE);
  const [previewTemplate, setPreviewTemplate] = useState<WhatsAppTemplate | null>(null);
  const [previewVariables, setPreviewVariables] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('whatsapp_templates').select('*').order('updated_at', { ascending: false });
      if (error) throw error;
      setTemplates((data || []) as unknown as WhatsAppTemplate[]);
    } catch (err) {
      log.error('Error fetching templates:', err);
      toast.error('Erro ao carregar templates');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const extractVariables = (text: string): string[] => {
    const matches = text.match(/\{\{(\d+)\}\}/g);
    return matches ? [...new Set(matches)].sort((a, b) => a.localeCompare(b)) : [];
  };

  const handleContentChange = useCallback((content: string) => {
    setEditingTemplate(prev => ({ ...prev, content, variables: extractVariables(content) }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!editingTemplate.name?.trim() || !editingTemplate.content?.trim()) {
      toast.error('Nome e conteúdo são obrigatórios'); return;
    }
    setIsSaving(true);
    try {
      // R2-MOD-067: o formulário NÃO define o estado de aprovação. `status` é estado
      // local guardado na tabela; hoje não há fluxo neste repositório que grave retorno da
      // Meta neste campo. Por isso ele não entra no payload: cadastro novo nasce como
      // rascunho local e a edição preserva o valor guardado, em vez de aceitar
      // "approved" escolhido na tela.
      const templateData = {
        name: editingTemplate.name.trim().toLowerCase().replace(/\s+/g, '_'),
        category: editingTemplate.category || 'utility',
        language: editingTemplate.language || 'pt_BR',
        content: editingTemplate.content.trim(),
        header_text: editingTemplate.header_text?.trim() || null,
        footer_text: editingTemplate.footer_text?.trim() || null,
        buttons: (editingTemplate.buttons || []) as unknown as Record<string, never>,
        variables: editingTemplate.variables || [],
        created_by: user?.id || null,
      };
      if (editingTemplate.id) {
        const { error } = await supabase.from('whatsapp_templates').update(templateData).eq('id', editingTemplate.id);
        if (error) throw error;
        toast.success('Template salvo localmente. A aprovação oficial não é alterada por este formulário.');
      } else {
        const { error } = await supabase.from('whatsapp_templates').insert({ ...templateData, status: 'draft' });
        if (error) throw error;
        toast.success('Rascunho local salvo. O status de aprovação não é definido por este formulário.');
      }
      setIsDialogOpen(false);
      setEditingTemplate(EMPTY_TEMPLATE);
      fetchTemplates();
    } catch (err) {
      log.error('Error saving template:', err); toast.error('Erro ao salvar template');
    } finally { setIsSaving(false); }
  }, [editingTemplate, user, fetchTemplates]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('whatsapp_templates').delete().eq('id', id);
      if (error) throw error;
      toast.success('Template removido!'); fetchTemplates();
    } catch (err) { log.error('Error deleting:', err); toast.error('Erro ao remover template'); }
  }, [fetchTemplates]);

  const handleDuplicate = useCallback((template: WhatsAppTemplate) => {
    setEditingTemplate({ ...template, id: undefined, name: `${template.name}_copy`, status: 'draft' });
    setIsDialogOpen(true);
  }, []);

  const handlePreview = useCallback((template: WhatsAppTemplate) => {
    setPreviewTemplate(template);
    const vars: Record<string, string> = {};
    (template.variables || []).forEach((v: string) => {
      vars[v] = v === '{{1}}' ? 'João' : v === '{{2}}' ? '12345' : `valor_${v}`;
    });
    setPreviewVariables(vars);
    setIsPreviewOpen(true);
  }, []);

  const renderPreviewContent = useCallback((content: string, variables: Record<string, string>) => {
    let rendered = content;
    Object.entries(variables).forEach(([key, value]) => {
      rendered = rendered.split(key).join(value || key);
    });
    return rendered;
  }, []);

  const filteredTemplates = templates.filter(t => {
    if (search && !t.name.includes(search.toLowerCase()) && !t.content.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCategory !== 'all' && t.category !== filterCategory) return false;
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    return true;
  });

  const openNew = useCallback(() => { setEditingTemplate(EMPTY_TEMPLATE); setIsDialogOpen(true); }, []);
  const openEdit = useCallback((t: WhatsAppTemplate) => { setEditingTemplate(t); setIsDialogOpen(true); }, []);

  return {
    templates: filteredTemplates, loading, search, setSearch,
    filterCategory, setFilterCategory, filterStatus, setFilterStatus,
    isDialogOpen, setIsDialogOpen, isPreviewOpen, setIsPreviewOpen,
    editingTemplate, setEditingTemplate, previewTemplate, previewVariables, setPreviewVariables,
    isSaving, handleContentChange, handleSave, handleDelete, handleDuplicate,
    handlePreview, renderPreviewContent, openNew, openEdit,
  };
}
