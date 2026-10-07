import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Zap, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { TRIGGER_TYPES, ACTION_TYPES, filterActionConfig, MESSAGE_ACTION_TYPES } from './automationConstants';
import type { AutomationRow } from './useAutomations';

interface AutomationEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  automation?: AutomationRow | null;
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

function buildFirstAction(
  automation: AutomationRow | null | undefined,
  actionType: string,
  messageContent: string
): { action: ActionRecord; config: ActionRecord } {
  const [firstAction] = readActions(automation);
  const previousType = readString(firstAction?.type);
  let config: ActionRecord = { ...readConfig(firstAction) };
  // `message` é chave declarada válida para send_message E send_notification
  // (ACTION_CONFIG_OWNERS); o editor grava sempre o que o usuário digitou nesses
  // dois tipos, e nunca em um tipo que não declara a chave (a troca de tipo
  // depois filtra o que sobrou).
  if (MESSAGE_ACTION_TYPES.includes(actionType)) {
    config.message = messageContent;
  }
  if (previousType !== actionType) {
    config = filterActionConfig(actionType, config);
  }
  return { action: { ...(firstAction ?? {}), type: actionType, config }, config };
}

// R2-MOD-001: o `AutomationsManager` mantém este diálogo SEMPRE montado e troca
// apenas a prop `automation` (o `open` só o esconde). Como os inicializadores de
// `useState` rodam uma única vez, na montagem, o formulário ficava preso nos
// valores do PRIMEIRO registro aberto — abrir outro registro reutilizava o estado
// do anterior. Remontamos o formulário sempre que o alvo muda (registro
// diferente, ou abertura depois de fechar, inclusive de volta para "Nova") via
// `key`, o padrão do React para reset de estado por prop.
export function AutomationEditorDialog(props: AutomationEditorDialogProps) {
  const key = props.open ? (props.automation?.id ?? 'new') : 'closed';
  return <AutomationEditorForm key={key} {...props} />;
}

function AutomationEditorForm({ open, onOpenChange, automation, onSave }: AutomationEditorDialogProps) {
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
  // O campo de mensagem aparece para TODO tipo que declara a chave `message`
  // (antes só send_message): send_notification era oferecido sem nenhum controle
  // para a mensagem e salvava a ação com config vazia.
  const editsMessage = MESSAGE_ACTION_TYPES.includes(actionType);

  // Mescla a primeira ação com a existente em vez de recriá-la, para não perder
  // parâmetros que o editor não expõe. Ao trocar o tipo, remove só chaves
  // conhecidas como exclusivas de outro tipo; chaves desconhecidas são mantidas
  // porque este repositório não contém o executor que definiria o contrato total.
  const handleSave = async () => {
    if (!name.trim()) { toast.error('Nome é obrigatório'); return; }
    const existing = readActions(automation);
    const { action: firstAction } = buildFirstAction(automation, actionType, messageContent);
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
          {editsMessage && (
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
