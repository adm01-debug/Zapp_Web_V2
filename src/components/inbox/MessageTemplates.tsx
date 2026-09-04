import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Plus, Search, Trash2, Edit2, X, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useMessageTemplates, type Template } from '@/hooks/chat/useMessageTemplates';
import { useAuth } from '@/hooks/auth/useAuth';

interface MessageTemplatesProps {
  onSelectTemplate: (content: string) => void;
}

const categories = ['general', 'saudacao', 'despedida', 'suporte', 'vendas'];

export function MessageTemplates({ onSelectTemplate }: MessageTemplatesProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ title: '', content: '', shortcut: '', category: 'general' });
  const { user } = useAuth();
  const { templates, isLoading, fetchTemplates, addTemplate, updateTemplate, deleteTemplate, incrementUseCount } = useMessageTemplates();

  useEffect(() => { if (isOpen && user) fetchTemplates(); }, [isOpen, user, fetchTemplates]);

  const handleSelectTemplate = async (template: Template) => {
    onSelectTemplate(template.content);
    await incrementUseCount(template);
    setIsOpen(false);
  };

  const handleAdd = async () => {
    if (await addTemplate(newTemplate)) {
      setNewTemplate({ title: '', content: '', shortcut: '', category: 'general' });
      setShowAddForm(false);
    }
  };

  const handleUpdate = async () => {
    if (editingTemplate && await updateTemplate(editingTemplate)) setEditingTemplate(null);
  };

  const filteredTemplates = templates.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.content.toLowerCase().includes(search.toLowerCase()) ||
    t.shortcut?.toLowerCase().includes(search.toLowerCase())
  );

  const formData = editingTemplate || newTemplate;
  const setFormData = (data: Partial<Template & typeof newTemplate>) =>
    editingTemplate ? setEditingTemplate({ ...editingTemplate, ...data }) : setNewTemplate({ ...newTemplate, ...data });

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setIsOpen(true)} className="text-muted-foreground hover:text-primary hover:bg-primary/10" title="Templates de mensagem">
        <FileText className="h-5 w-5" />
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />Templates de Mensagem</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar templates..." className="pl-9" />
            </div>
            <Button onClick={() => setShowAddForm(true)} className="gap-2"><Plus className="h-4 w-4" />Novo</Button>
          </div>

          <AnimatePresence>
            {(showAddForm || editingTemplate) && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-4 p-4 border border-border rounded-lg bg-muted/30">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium">{editingTemplate ? 'Editar Template' : 'Novo Template'}</h4>
                  <Button variant="ghost" size="icon" onClick={() => { setShowAddForm(false); setEditingTemplate(null); }}><X className="h-4 w-4" /></Button>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Input placeholder="Título do template" value={formData.title} onChange={(e) => setFormData({ title: e.target.value })} />
                    <Input placeholder="Atalho (ex: /ola)" value={formData.shortcut || ''} onChange={(e) => setFormData({ shortcut: e.target.value })} />
                  </div>
                  <Textarea placeholder="Conteúdo da mensagem..." rows={3} value={formData.content} onChange={(e) => setFormData({ content: e.target.value })} />
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1">
                      {categories.map(cat => (
                        <Badge key={cat} variant={formData.category === cat ? 'default' : 'outline'} className="cursor-pointer capitalize"
                          onClick={() => setFormData({ category: cat })}>{cat}</Badge>
                      ))}
                    </div>
                    <Button onClick={editingTemplate ? handleUpdate : handleAdd} className="gap-2"><Save className="h-4 w-4" />Salvar</Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex-1 overflow-y-auto space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : filteredTemplates.length > 0 ? (
              filteredTemplates.map((template) => (
                <motion.div key={template.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-3 border border-border rounded-lg hover:bg-muted/30 transition-colors group">
                  <div className="flex items-start justify-between">
                    <button onClick={() => handleSelectTemplate(template)} className="flex-1 text-left">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{template.title}</span>
                        {template.shortcut && <Badge variant="outline" className="text-[10px]">{template.shortcut}</Badge>}
                        <Badge variant="secondary" className="text-[10px] capitalize">{template.category}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{template.content}</p>
                      <span className="text-[10px] text-muted-foreground mt-1 block">Usado {template.use_count}x</span>
                    </button>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingTemplate(template)}><Edit2 className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteTemplate(template.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Nenhum template encontrado</p>
                <p className="text-sm">Crie seu primeiro template clicando em "Novo"</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
