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

function formDataFor(template: QuickReplyTemplate | null): CreateTemplateInput {
  return template
    ? { title: template.title, content: template.content, shortcut: template.shortcut || '', category: template.category || 'geral' }
    : { title: '', content: '', shortcut: '', category: 'geral' };
}

/**
 * O formulário é um componente próprio e vive DENTRO do `DialogContent`. O estado
 * nasce do template que está sendo aberto, então uma abertura nunca reaproveita o
 * formulário da anterior. Antes o estado ficava no `QuickReplyDialog` (que permanece
 * montado no gerenciador mesmo fechado): editar outra resposta mostrava os dados
 * anteriores e "Salvar" gravava esses dados no template recém-aberto (item 347).
 */
function QuickReplyForm({ editingTemplate, isSubmitting, onClose, onCreate, onUpdate }: Omit<QuickReplyDialogProps, 'open'>) {
  const [formData, setFormData] = useState<CreateTemplateInput>(() => formDataFor(editingTemplate));

  const handleSubmit = async () => {
    if (!formData.title || !formData.content) return;
    if (editingTemplate) await onUpdate(editingTemplate.id, formData);
    else await onCreate(formData);
    onClose();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editingTemplate ? 'Editar Resposta Rápida' : 'Nova Resposta Rápida'}</DialogTitle>
        <DialogDescription>Crie respostas prontas para agilizar seu atendimento</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <label htmlFor="qr-title" className="text-sm font-medium">Título</label>
          <Input id="qr-title" placeholder="Ex: Saudação inicial" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} />
        </div>
        <div className="space-y-2">
          <label htmlFor="qr-content" className="text-sm font-medium">Conteúdo</label>
          <Textarea id="qr-content" placeholder="Digite o conteúdo da resposta..." value={formData.content} onChange={(e) => setFormData({ ...formData, content: e.target.value })} rows={4} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="qr-shortcut" className="text-sm font-medium">Atalho</label>
            <Input id="qr-shortcut" placeholder="/saudacao" value={formData.shortcut} onChange={(e) => setFormData({ ...formData, shortcut: e.target.value })} />
          </div>
          <div className="space-y-2">
            <label htmlFor="qr-category" className="text-sm font-medium">Categoria</label>
            <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
              <SelectTrigger id="qr-category"><SelectValue /></SelectTrigger>
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
    </>
  );
}

export function QuickReplyDialog({ open, editingTemplate, isSubmitting, onClose, onCreate, onUpdate }: QuickReplyDialogProps) {
  const handleOpenChange = (v: boolean) => { if (!v) onClose(); };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        {/* A `key` pelo alvo reinicia o formulário se o diálogo passar a editar outro
            template sem fechar (o Radix mantém o conteúdo montado na animação de saída). */}
        <QuickReplyForm
          key={editingTemplate ? editingTemplate.id : '__new__'}
          editingTemplate={editingTemplate}
          isSubmitting={isSubmitting}
          onClose={onClose}
          onCreate={onCreate}
          onUpdate={onUpdate}
        />
      </DialogContent>
    </Dialog>
  );
}
