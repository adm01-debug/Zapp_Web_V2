import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#84CC16', // lime
];

/** Campos que o formulário de edição precisa conhecer de uma fila existente. */
export interface EditableQueue {
  id: string;
  name: string;
  description: string | null;
  color: string;
  max_wait_time_minutes: number | null;
}

export interface QueueUpdates {
  name: string;
  description: string | null;
  color: string;
  max_wait_time_minutes: number | null;
}

interface EditQueueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queue: EditableQueue | null;
  onSubmit: (id: string, updates: QueueUpdates) => Promise<void> | void;
}

/**
 * R2-QUE-006 — formulário de edição da fila, usado pelos dois pontos de entrada
 * que anunciavam a ação sem executá-la: o item "Editar" do card (QueuesView) e o
 * botão "Configurar" da página de detalhes (QueueDetails).
 *
 * O formulário só existe enquanto o diálogo está aberto (o conteúdo do Radix
 * desmonta ao fechar), então os campos nascem dos valores atuais da fila e são
 * descartados ao cancelar — sem estado derivado sincronizado por efeito. A
 * gravação é delegada ao `onSubmit` e o diálogo só fecha quando ela resolve.
 */
export function EditQueueDialog({ open, onOpenChange, queue, onSubmit }: EditQueueDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-md bg-card border-border/30">
        <DialogHeader>
          <DialogTitle className="text-foreground">Editar Fila</DialogTitle>
        </DialogHeader>
        {queue && (
          <EditQueueForm
            key={queue.id}
            queue={queue}
            onSubmit={onSubmit}
            onCancel={() => onOpenChange(false)}
            onSaved={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface EditQueueFormProps {
  queue: EditableQueue;
  onSubmit: (id: string, updates: QueueUpdates) => Promise<void> | void;
  onCancel: () => void;
  onSaved: () => void;
}

function EditQueueForm({ queue, onSubmit, onCancel, onSaved }: EditQueueFormProps) {
  const [name, setName] = useState(queue.name);
  const [description, setDescription] = useState(queue.description ?? '');
  const [color, setColor] = useState(queue.color || COLORS[0]);
  const [maxWait, setMaxWait] = useState(
    queue.max_wait_time_minutes === null ? '' : String(queue.max_wait_time_minutes)
  );
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const parsedMaxWait = maxWait.trim() === '' ? null : Number(maxWait);
    if (parsedMaxWait !== null && (!Number.isFinite(parsedMaxWait) || parsedMaxWait <= 0)) return;

    setLoading(true);
    try {
      await onSubmit(queue.id, {
        name: name.trim(),
        description: description.trim() || null,
        color,
        max_wait_time_minutes: parsedMaxWait,
      });
      onSaved();
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="edit-queue-name" className="text-foreground">Nome</Label>
        <Input
          id="edit-queue-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Suporte Técnico"
          className="bg-muted/20 border-border/30"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="edit-queue-description" className="text-foreground">Descrição</Label>
        <Textarea
          id="edit-queue-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descreva o propósito desta fila..."
          className="bg-muted/20 border-border/30 resize-none"
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="edit-queue-max-wait" className="text-foreground">Tempo máximo de espera (min)</Label>
        <Input
          id="edit-queue-max-wait"
          type="number"
          min={1}
          value={maxWait}
          onChange={(e) => setMaxWait(e.target.value)}
          placeholder="Ex: 30"
          className="bg-muted/20 border-border/30"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-foreground">Cor</Label>
        <div className="flex gap-2 flex-wrap">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Cor ${c}`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              className={`w-8 h-8 rounded-full transition-all ${
                color === c ? 'ring-2 ring-offset-2 ring-offset-card ring-primary scale-110' : 'hover:scale-105'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} className="text-muted-foreground">
          Cancelar
        </Button>
        <Button type="submit" disabled={loading || !name.trim()}>
          {loading ? 'Salvando...' : 'Salvar Alterações'}
        </Button>
      </DialogFooter>
    </form>
  );
}
