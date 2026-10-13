import { useEffect, useRef, useState } from 'react';
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
  profileId: _profileId,
  onClosed,
}: CloseConversationDialogProps) {
  const [reason, setReason] = useState('');
  const [outcome, setOutcome] = useState('');
  const [classification, setClassification] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const clientRequestIdRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // A transport failure can occur after the RPC commits. Keep the same key for
  // a retry while this dialog remains open; reset only for a newly opened form.
  useEffect(() => {
    if (open) clientRequestIdRef.current = null;
  }, [open, contactId]);


  // CSAT automático: encerrar a conversa é a única porta de envio da pesquisa
  // (Edge `csat-auto-send`, que decide config/consentimento/cooldown e é
  // idempotente por `closure_id`). A chamada roda DEPOIS do encerramento
  // confirmado e NUNCA o bloqueia: falha da Edge vira aviso discreto, e uma
  // recusa normal (config desligada, cooldown, consentimento revogado) fica
  // em silêncio — a tela de configuração explica esses casos.
  const triggerCsatAutoSend = async (closureId?: string | null) => {
    try {
      const { data, error } = await supabase.functions.invoke('csat-auto-send', {
        body: {
          contact_id: contactId,
          ...(closureId ? { closure_id: closureId } : {}),
        },
      });
      if (error) throw error;
      const resultado = data as { sent?: boolean } | null;
      if (resultado?.sent === true) {
        toast.info('Pesquisa de satisfação enviada ao cliente');
      }
    } catch (erro) {
      console.warn(
        '[CloseConversationDialog] CSAT auto-send falhou (não bloqueia o encerramento):',
        erro,
      );
      toast.info('Conversa encerrada, mas a pesquisa de satisfação não pôde ser enviada.');
    }
  };

  const handleClose = async () => {
    if (!reason || saving) {
      if (!reason) {
        toast.error('Selecione o motivo de encerramento');
      }
      return;
    }
    const clientRequestId = clientRequestIdRef.current ?? crypto.randomUUID();
    clientRequestIdRef.current = clientRequestId;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('close_conversation_atomic', {
        p_contact_id: contactId,
        p_client_request_id: clientRequestId,
        p_close_reason: reason,
        p_outcome: outcome || undefined,
        p_classification: classification || undefined,
        p_notes: notes || undefined,
      });
      if (error || data?.length !== 1 || data[0]?.conversation_status !== 'resolved') {
        throw error ?? new Error('Encerramento não confirmado pelo servidor');
      }
      // O encerramento é a chave de idempotência da pesquisa: a Edge usa este
      // id como `client_message_id`, então a mesma conversa nunca gera duas.
      const closureId = data[0]?.closure_id;

      // The RPC commits closure, FSM transition and timeline event together.
      window.dispatchEvent(
        new CustomEvent('zapp:contact-status-changed', {
          detail: { contactId, status: 'resolved' },
        })
      );

      toast.success('Conversa encerrada com registro');
      clientRequestIdRef.current = null;
      onOpenChange(false);
      if (isMountedRef.current) {
        setReason('');
        setOutcome('');
        setClassification('');
        setNotes('');
      }
      onClosed?.();
      // Fora do caminho crítico: o fechamento já está confirmado e persistido.
      void triggerCsatAutoSend(closureId);
    } catch (error) {
      console.warn('[CloseConversationDialog] Falha no encerramento atômico:', error);
      toast.error('Não foi possível encerrar a conversa. Nenhuma alteração parcial foi salva.');
    } finally {
      if (isMountedRef.current) setSaving(false);
    }
  };

  // Arquivar/desarquivar usam a RPC set_conversation_status (a mesma da FSM de
  // contatos). Diferente do encerramento, não há registro de closure: o motivo
  // escolhido é opcional e só acompanha a chamada.
  const handleStatusChange = async (next: 'archived' | 'open') => {
    if (saving) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('set_conversation_status', {
        p_contact_id: contactId,
        p_next: next,
        p_reason: reason || undefined,
      });
      if (error) throw error;

      window.dispatchEvent(
        new CustomEvent('zapp:contact-status-changed', {
          detail: { contactId, status: next },
        })
      );

      toast.success(next === 'archived' ? 'Conversa arquivada' : 'Conversa reaberta');
      onOpenChange(false);
      if (isMountedRef.current) setReason('');
      onClosed?.();
    } catch (error) {
      console.warn('[CloseConversationDialog] Falha ao alterar status da conversa:', error);
      toast.error(
        next === 'archived'
          ? 'Não foi possível arquivar a conversa.'
          : 'Não foi possível reabrir a conversa.',
      );
    } finally {
      if (isMountedRef.current) setSaving(false);
    }
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
              <SelectTrigger aria-label="Motivo do encerramento">
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
              <SelectTrigger aria-label="Resultado">
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
              <SelectTrigger aria-label="Classificação (destino)">
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
          <Button variant="outline" onClick={() => handleStatusChange('open')} disabled={saving}>
            Desarquivar / Reabrir
          </Button>
          <Button variant="outline" onClick={() => handleStatusChange('archived')} disabled={saving}>
            Arquivar
          </Button>
          <Button onClick={handleClose} disabled={saving || !reason}>
            {saving ? 'Salvando...' : 'Encerrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
