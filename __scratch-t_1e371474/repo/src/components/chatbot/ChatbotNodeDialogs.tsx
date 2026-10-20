import { useState } from 'react';
import { ChatbotNode } from '@/hooks/integrations/useChatbotFlows';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  MessageSquare, HelpCircle, GitBranch, Clock, Users, Zap, CheckCircle2,
} from 'lucide-react';
import {
  CONDITION_OPERATORS, DEFAULT_CONDITION_OPERATOR, missingNodeConfig,
} from './chatbotNodeConfig';
import { cn } from '@/lib/utils';

export const nodeTypes: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  start: { label: 'Início', icon: Zap, color: 'border-success bg-success/10' },
  message: { label: 'Mensagem', icon: MessageSquare, color: 'border-info bg-info/10' },
  question: { label: 'Pergunta', icon: HelpCircle, color: 'border-purple-500 bg-primary/10' },
  condition: { label: 'Condição', icon: GitBranch, color: 'border-yellow-500 bg-warning/10' },
  action: { label: 'Ação', icon: Zap, color: 'border-warning bg-warning/10' },
  delay: { label: 'Aguardar', icon: Clock, color: 'border-info bg-info/10' },
  transfer: { label: 'Transferir', icon: Users, color: 'border-destructive bg-destructive/10' },
  end: { label: 'Fim', icon: CheckCircle2, color: 'border-destructive bg-destructive/10' },
};

// ─── Add Node Dialog ───────────────────────────────────────
interface AddNodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (type: ChatbotNode['type']) => void;
}

export function AddNodeDialog({ open, onOpenChange, onAdd }: AddNodeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Adicionar Nó</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(nodeTypes).map(([type, config]) => {
            const Icon = config.icon;
            return (
              <Button key={type} variant="outline" className={cn('h-auto p-3 flex flex-col items-center gap-1 border-2', config.color)} onClick={() => onAdd(type as ChatbotNode['type'])}>
                <Icon className="w-5 h-5" />
                <span className="text-xs">{config.label}</span>
              </Button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Node Dialog ──────────────────────────────────────
interface EditNodeDialogProps {
  node: ChatbotNode | null;
  onClose: () => void;
  onSave: (node: ChatbotNode) => void;
  onChange: (node: ChatbotNode) => void;
}

export function EditNodeDialog({ node, onClose, onSave, onChange }: EditNodeDialogProps) {
  // R2-MOD-069: guarda o id do nó cuja última tentativa de salvar foi recusada.
  // A mensagem é recalculada a cada render a partir do estado atual, então ela
  // some assim que o campo é preenchido, e a troca de nó não herda a do anterior.
  const [tentativaRecusada, setTentativaRecusada] = useState<string | null>(null);

  if (!node) return null;

  const updateData = (patch: Partial<ChatbotNode['data']>) =>
    onChange({ ...node, data: { ...node.data, ...patch } });

  // Tolera nó vindo de fluxo antigo: `condition` pode faltar por completo; o
  // objeto só é criado quando o usuário escreve algo.
  const condition = {
    field: node.data.condition?.field ?? '',
    operator: node.data.condition?.operator ?? DEFAULT_CONDITION_OPERATOR,
    value: node.data.condition?.value ?? '',
  };
  const faltando = missingNodeConfig(node);
  const mostrarErro = tentativaRecusada === node.id && faltando.length > 0;

  const handleSave = () => {
    if (faltando.length > 0) {
      // Mantém o diálogo aberto com o rascunho: o nó só é levado ao fluxo depois
      // de representar de fato a operação que o tipo promete.
      setTentativaRecusada(node.id);
      return;
    }
    setTentativaRecusada(null);
    onSave(node);
  };

  return (
    <Dialog open={!!node} onOpenChange={() => onClose()}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-md">
        <DialogHeader><DialogTitle>Editar Nó: {node.data.label}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome</Label>
            <Input value={node.data.label} onChange={e => updateData({ label: e.target.value })} />
          </div>
          {(node.type === 'message' || node.type === 'question') && (
            <div>
              <Label>Conteúdo da mensagem</Label>
              <Textarea value={node.data.content || ''} onChange={e => updateData({ content: e.target.value })} rows={3} />
            </div>
          )}
          {node.type === 'question' && (
            <div>
              <Label>Opções (uma por linha)</Label>
              <Textarea value={(node.data.options || []).join('\n')} onChange={e => updateData({ options: e.target.value.split('\n').filter(Boolean) })} rows={3} />
            </div>
          )}
          {node.type === 'condition' && (
            <div className="space-y-2">
              <Label>Regra da condição</Label>
              <Input
                aria-label="Campo da condição"
                placeholder="Campo avaliado (ex: resposta do contato)"
                value={condition.field}
                onChange={e => updateData({ condition: { ...condition, field: e.target.value } })}
              />
              <Select
                value={condition.operator}
                onValueChange={operator => updateData({ condition: { ...condition, operator } })}
              >
                <SelectTrigger aria-label="Operador da condição"><SelectValue placeholder="Operador" /></SelectTrigger>
                <SelectContent>
                  {CONDITION_OPERATORS.map(op => (
                    <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                aria-label="Valor da condição"
                placeholder="Valor comparado (ex: sim)"
                value={condition.value}
                onChange={e => updateData({ condition: { ...condition, value: e.target.value } })}
              />
            </div>
          )}
          {node.type === 'action' && (
            <div>
              <Label>Ação a executar</Label>
              <Input
                aria-label="Ação"
                placeholder="Ex: send_message"
                value={node.data.action || ''}
                onChange={e => updateData({ action: e.target.value })}
              />
            </div>
          )}
          {node.type === 'transfer' && (
            <div>
              <Label>Destino da transferência</Label>
              <Input
                aria-label="Destino da transferência"
                placeholder="Ex: fila de atendimento humano"
                value={node.data.transferTo || ''}
                onChange={e => updateData({ transferTo: e.target.value })}
              />
            </div>
          )}
          {node.type === 'delay' && (
            <div>
              <Label>Tempo de espera (segundos)</Label>
              <Input type="number" value={node.data.delaySeconds || 5} onChange={e => updateData({ delaySeconds: Number(e.target.value) })} />
            </div>
          )}
          {mostrarErro && (
            <p role="alert" className="text-xs text-destructive">
              Preencha para salvar: {faltando.join(', ')}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
