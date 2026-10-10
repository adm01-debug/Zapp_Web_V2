import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Zap, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { TRIGGER_TYPES, ACTION_TYPES } from './automationConstants';
import type { AutomationRow } from './useAutomations';

interface AutomationEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  automation?: AutomationRow | null;
  onSave: (data: Partial<AutomationRow>) => Promise<void>;
}

export function AutomationEditorDialog({ open, onOpenChange, automation, onSave }: AutomationEditorDialogProps) {
  const [name, setName] = useState(automation?.name || '');
  const [description, setDescription] = useState(automation?.description || '');
  const [triggerType, setTriggerType] = useState(automation?.trigger_type || 'new_message');
  const actions = Array.isArray(automation?.actions) ? automation.actions : [];
  const [actionType, setActionType] = useState((actions[0] as Record<string, unknown>)?.type as string || 'send_message');
  const [messageContent, setMessageContent] = useState(((actions[0] as Record<string, Record<string, string>>)?.config)?.message || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Nome é obrigatório'); return; }
    setIsSaving(true);
    try {
      await onSave({ name, description, trigger_type: triggerType, trigger_config: {}, actions: [{ type: actionType, config: { message: messageContent } }] });
      onOpenChange(false);
    } finally { setIsSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            {automation ? 'Editar Automação' : 'Nova Automação'}
          </DialogTitle>
          <DialogDescription>Configure gatilhos e ações automáticas</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Nome da Automação</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Boas-vindas Automáticas" />
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descreva o que essa automação faz" />
          </div>
          <div className="space-y-2">
            <Label>Gatilho (Quando executar?)</Label>
            <Select value={triggerType} onValueChange={setTriggerType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TRIGGER_TYPES.map((t) => (
                  <SelectItem key={t.type} value={t.type}>
                    <div className="flex items-center gap-2"><t.icon className="w-4 h-4" /><span>{t.label}</span></div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Ação (O que fazer?)</Label>
            <Select value={actionType} onValueChange={setActionType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTION_TYPES.map((a) => (
                  <SelectItem key={a.type} value={a.type}>
                    <div className="flex items-center gap-2"><a.icon className="w-4 h-4" /><span>{a.label}</span></div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {actionType === 'send_message' && (
            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Input value={messageContent} onChange={(e) => setMessageContent(e.target.value)} placeholder="Digite a mensagem automática..." />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
