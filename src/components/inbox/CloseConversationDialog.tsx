import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { CheckCircle2 } from 'lucide-react';

interface CloseConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  profileId?: string | null;
  onClosed?: () => void;
}

const CLOSE_REASONS = [
  { value: 'resolved', label: 'Resolvido' },
  { value: 'no_response', label: 'Sem resposta do cliente' },
  { value: 'transferred', label: 'Transferido para outro canal' },
  { value: 'spam', label: 'Spam / Irrelevante' },
  { value: 'duplicate', label: 'Duplicado' },
  { value: 'self_resolved', label: 'Cliente resolveu sozinho' },
  { value: 'other', label: 'Outro' },
];

const OUTCOMES = [
  { value: 'sale', label: 'Venda realizada' },
  { value: 'lead_qualified', label: 'Lead qualificado' },
  { value: 'support_resolved', label: 'Suporte resolvido' },
  { value: 'follow_up', label: 'Requer follow-up' },
  { value: 'lost', label: 'Oportunidade perdida' },
  { value: 'no_outcome', label: 'Sem resultado específico' },
];

const CLASSIFICATIONS = [
  { value: 'sales', label: 'Comercial' },
  { value: 'support', label: 'Suporte' },
  { value: 'billing', label: 'Financeiro' },
  { value: 'complaint', label: 'Reclamação' },
  { value: 'information', label: 'Informação' },
  { value: 'feedback', label: 'Feedback' },
];

export function CloseConversationDialog({
  open,
  onOpenChange,
  contactId,
  profileId,
  onClosed,
}: CloseConversationDialogProps) {
  const [reason, setReason] = useState('');
  const [outcome, setOutcome] = useState('');
  const [classification, setClassification] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleClose = async () => {
    if (!reason) {
      toast.error('Selecione o motivo de encerramento');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('conversation_closures')
      .insert({
        contact_id: contactId,
        closed_by: profileId,
        close_reason: reason,
        outcome: outcome || null,
        classification: classification || null,
        notes: notes || null,
      });
    if (!error) {
      toast.success('Conversa encerrada com registro');
      onOpenChange(false);
      setReason('');
      setOutcome('');
      setClassification('');
      setNotes('');
      onClosed?.();
    } else {
      toast.error('Erro ao registrar encerramento');
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-success" />
            Encerrar Conversa
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Motivo do encerramento *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o motivo" />
              </SelectTrigger>
              <SelectContent>
                {CLOSE_REASONS.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Resultado</Label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger>
                <SelectValue placeholder="Resultado do atendimento" />
              </SelectTrigger>
              <SelectContent>
                {OUTCOMES.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Classificação</Label>
            <Select value={classification} onValueChange={setClassification}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo de atendimento" />
              </SelectTrigger>
              <SelectContent>
                {CLASSIFICATIONS.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Observações</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anotações sobre o atendimento..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleClose} disabled={saving || !reason}>
            {saving ? 'Salvando...' : 'Encerrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
