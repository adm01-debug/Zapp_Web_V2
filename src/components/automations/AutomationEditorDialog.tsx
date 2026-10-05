import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Zap, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { TRIGGER_TYPES, ACTION_TYPES, REQUIRED_ACTION_CONFIG } from './automationConstants';
import type { AutomationRow } from './useAutomations';

interface AutomationEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  automation?: AutomationRow | null;
  onSave: (data: Partial<AutomationRow>) => Promise<void>;
}

interface AutomationEditorFormProps {
  automation?: AutomationRow | null;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<AutomationRow>) => Promise<void>;
}

type ActionRecord = Record<string, unknown>;

function readActions(automation?: AutomationRow | null): ActionRecord[] {
  const raw = Array.isArray(automation?.actions) ? automation.actions : [];
  return raw as unknown as ActionRecord[];
}

function readConfig(action?: ActionRecord): ActionRecord {
  const config = action?.config;
  return config && typeof config === 'object' && !Array.isArray(config) ? (config as ActionRecord) : {};
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function AutomationEditorForm({ automation, onOpenChange, onSave }: AutomationEditorFormProps) {
  const [name, setName] = useState(automation?.name ?? '');
  const [description, setDescription] = useState(automation?.description ?? '');
  const [triggerType, setTriggerType] = useState(automation?.trigger_type ?? 'new_message');
  const [actionType, setActionType] = useState(() => {
    const [firstAction] = readActions(automation);
    return readString(firstAction?.type) || 'send_message';
  });
  const [messageContent, setMessageContent] = useState(() => {
    const [firstAction] = readActions(automation);
    return readString(readConfig(firstAction).message);
  });
  const [isSaving, setIsSaving] = useState(false);

  // Mescla a primeira ação com a existente em vez de recriá-la, para não perder
  // parâmetros de configuração que o editor não expõe (ex.: delay_seconds).
  const buildFirstAction = (): { action: ActionRecord; config: ActionRecord } => {
    const [firstAction] = readActions(automation);
    const config: ActionRecord = { ...readConfig(firstAction) };
    if (actionType === 'send_message') {
      config.message = messageContent;
    } else {
      delete config.message;
    }
    return { action: { ...(firstAction ?? {}), type: actionType, config }, config };
  };

  const { config: draftConfig } = buildFirstAction();
  const requiredConfig = REQUIRED_ACTION_CONFIG[actionType] ?? [];
  const missingConfig = requiredConfig.filter((key) => readString(draftConfig[key]).trim() === '');

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Nome é obrigatório'); return; }
    if (missingConfig.length > 0) {
      const label = ACTION_TYPES.find((a) => a.type === actionType)?.label ?? actionType;
      toast.error(`Ação "${label}" está sem configuração obrigatória: ${missingConfig.join(', ')}`);
      return;
    }
    const existing = readActions(automation);
    const { action: firstAction } = buildFirstAction();
    const actions = existing.length > 0 ? [firstAction, ...existing.slice(1)] : [firstAction];
    setIsSaving(true);
    try {
      // R2-MOD-002: preserva trigger_config e as demais ações que a UI não edita.
      await onSave({
        name,
        description,
        trigger_type: triggerType,
        trigger_config: automation?.trigger_config ?? {},
        actions: actions as unknown as AutomationRow['actions'],
      });
      onOpenChange(false);
    } finally { setIsSaving(false); }
  };

  return (
    <>
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
        {missingConfig.length > 0 && actionType !== 'send_message' && (
          <p className="text-xs text-amber-600">
            Esta ação exige configuração ({missingConfig.join(', ')}) que não é editável nesta tela e não
            está presente na automação salva. Salvar ficará bloqueado até a configuração existir.
          </p>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Salvar
        </Button>
      </DialogFooter>
    </>
  );
}

export function AutomationEditorDialog({ open, onOpenChange, automation, onSave }: AutomationEditorDialogProps) {
  // Remonta o formulário ao abrir/trocar de automação: o estado inicial vem do
  // registro aberto, sem efeito de sincronização (evita cascading renders).
  const formKey = `${open ? 'open' : 'closed'}:${automation?.id ?? 'new'}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-lg">
        <AutomationEditorForm key={formKey} automation={automation} onOpenChange={onOpenChange} onSave={onSave} />
      </DialogContent>
    </Dialog>
  );
}
