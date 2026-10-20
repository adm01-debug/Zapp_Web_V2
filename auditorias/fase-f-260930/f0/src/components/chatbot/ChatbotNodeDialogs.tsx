import { ChatbotNode } from '@/hooks/integrations/useChatbotFlows';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  MessageSquare, HelpCircle, GitBranch, Clock, Users, Zap, CheckCircle2,
} from 'lucide-react';
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
  if (!node) return null;

  return (
    <Dialog open={!!node} onOpenChange={() => onClose()}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-md">
        <DialogHeader><DialogTitle>Editar Nó: {node.data.label}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome</Label>
            <Input value={node.data.label} onChange={e => onChange({ ...node, data: { ...node.data, label: e.target.value } })} />
          </div>
          {(node.type === 'message' || node.type === 'question') && (
            <div>
              <Label>Conteúdo da mensagem</Label>
              <Textarea value={node.data.content || ''} onChange={e => onChange({ ...node, data: { ...node.data, content: e.target.value } })} rows={3} />
            </div>
          )}
          {node.type === 'question' && (
            <div>
              <Label>Opções (uma por linha)</Label>
              <Textarea value={(node.data.options || []).join('\n')} onChange={e => onChange({ ...node, data: { ...node.data, options: e.target.value.split('\n').filter(Boolean) } })} rows={3} />
            </div>
          )}
          {node.type === 'delay' && (
            <div>
              <Label>Tempo de espera (segundos)</Label>
              <Input type="number" value={node.data.delaySeconds || 5} onChange={e => onChange({ ...node, data: { ...node.data, delaySeconds: Number(e.target.value) } })} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onSave(node)}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
