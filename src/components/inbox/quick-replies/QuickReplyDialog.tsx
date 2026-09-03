import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { QuickReplyTemplate, CreateTemplateInput } from '@/hooks/chat/useQuickReplies';

interface QuickReplyDialogProps {
  open: boolean;
  editingTemplate: QuickReplyTemplate | null;
  isSubmitting: boolean;
  onClose: () => void;
  onCreate: (data: CreateTemplateInput) => Promise<void>;
  onUpdate: (id: string, data: CreateTemplateInput) => Promise<void>;
}

export function QuickReplyDialog({ open, editingTemplate, isSubmitting, onClose, onCreate, onUpdate }: QuickReplyDialogProps) {
  const [formData, setFormData] = useState<CreateTemplateInput>(() =>
    editingTemplate
      ? { title: editingTemplate.title, content: editingTemplate.content, shortcut: editingTemplate.shortcut || '', category: editingTemplate.category || 'geral' }
      : { title: '', content: '', shortcut: '', category: 'geral' }
  );

  // Sync form when editingTemplate changes
  const handleOpenChange = (v: boolean) => { if (!v) onClose(); };

  const handleSubmit = async () => {
    if (!formData.title || !formData.content) return;
    if (editingTemplate) await onUpdate(editingTemplate.id, formData);
    else await onCreate(formData);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{editingTemplate ? 'Editar Resposta Rápida' : 'Nova Resposta Rápida'}</DialogTitle>
          <DialogDescription>Crie respostas prontas para agilizar seu atendimento</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Título</label>
            <Input placeholder="Ex: Saudação inicial" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Conteúdo</label>
            <Textarea placeholder="Digite o conteúdo da resposta..." value={formData.content} onChange={(e) => setFormData({ ...formData, content: e.target.value })} rows={4} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Atalho</label>
              <Input placeholder="/saudacao" value={formData.shortcut} onChange={(e) => setFormData({ ...formData, shortcut: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Categoria</label>
              <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="geral">Geral</SelectItem>
                  <SelectItem value="saudacao">Saudação</SelectItem>
                  <SelectItem value="suporte">Suporte</SelectItem>
                  <SelectItem value="vendas">Vendas</SelectItem>
                  <SelectItem value="encerramento">Encerramento</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                Salvando...
              </span>
            ) : (<><Check className="w-4 h-4 mr-2" />{editingTemplate ? 'Salvar Alterações' : 'Criar Resposta'}</>)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
