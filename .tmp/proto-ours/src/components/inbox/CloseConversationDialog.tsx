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

// `contacts.conversation_status` é a fonte da FSM. Só ela define quais ações
// este diálogo pode oferecer; transições permitidas:
//   open     -> waiting | resolved | archived
//   waiting  -> open | resolved
//   resolved -> open | archived
//   archived -> open
type ConversationStatus = 'open' | 'waiting' | 'resolved' | 'archived';

const CONVERSATION_STATUS_LABEL: Record<ConversationStatus, string> = {
  open: 'Aberto',
  waiting: 'Aguardando',
  resolved: 'Resolvido',
  archived: 'Arquivado',
};

const isConversationStatus = (value: unknown): value is ConversationStatus =>
  value === 'open' || value === 'waiting' || value === 'resolved' || value === 'archived';

// Erros distintos de `close_conversation_atomic`/`set_conversation_status`:
// 23514 invalid_transition · 42501 contact_not_authorized ·
// 22023 invalid_conversation_closure · 23505 closure_request_id_reused...
type ClosureErrorKind =
  | 'invalid_transition'
  | 'forbidden'
  | 'invalid_payload'
  | 'payload_mismatch'
  | 'unknown';

const ERROR_MESSAGES: Record<Exclude<ClosureErrorKind, 'unknown'>, string> = {
  invalid_transition: 'Esta conversa já foi encerrada ou mudou de estado. A lista foi atualizada.',
  forbidden: 'Você não tem permissão para alterar esta conversa.',
  invalid_payload:
    'Os dados informados são inválidos. Revise motivo, resultado e classificação.',
  payload_mismatch:
    'Este encerramento já foi registrado com outros dados. Reabra o diálogo e tente novamente.',
};

// O PostgREST devolve `code` canônico, mas `set_conversation_status` levanta
// transição inválida sem ERRCODE (P0001) — por isso também casamos a mensagem.
function classifyClosureError(error: unknown): ClosureErrorKind {
  const code = String((error as { code?: unknown } | null)?.code ?? '');
  const message = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
  if (code === '23514' || message.includes('invalid_transition') || message.includes('invalid transition')) {
    return 'invalid_transition';
  }
  if (
    code === '42501' ||
    message.includes('contact_not_authorized') ||
    message.includes('active_profile_not_found') ||
    message.includes('authentication_required')
  ) {
    return 'forbidden';
  }
  if (code === '22023' || message.includes('invalid_conversation_closure')) {
    return 'invalid_payload';
  }
  if (code === '23505' || message.includes('closure_request_id_reused')) {
    return 'payload_mismatch';
  }
  return 'unknown';
}

// `invalid_transition open -> resolved` / `invalid transition waiting -> open`.
function statusFromTransitionError(error: unknown): ConversationStatus | null {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const match = /invalid[_ ]transition\s+([a-z_]+)\s*->/i.exec(message);
  const found = match?.[1]?.toLowerCase();
  return isConversationStatus(found) ? found : null;
}

interface StatusLoad {
  contactId: string;
  status: ConversationStatus | null;
  failed: boolean;
}

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
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [statusLoad, setStatusLoad] = useState<StatusLoad | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
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

  // Só o estado real do contato decide as ações: sem ele, nenhuma escrita é
  // oferecida (evita 'Reabrir' numa conversa aberta e 'Arquivar' repetido).
  useEffect(() => {
    if (!open || !contactId) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('contacts')
          .select('conversation_status')
          .eq('id', contactId)
          .maybeSingle();
        if (cancelled) return;
        const raw = (data as { conversation_status?: string } | null)?.conversation_status;
        setStatusLoad({
          contactId,
          status: isConversationStatus(raw) ? raw : null,
          failed: Boolean(error),
        });
      } catch (error) {
        if (cancelled) return;
        console.warn('[CloseConversationDialog] Falha ao ler o estado da conversa:', error);
        setStatusLoad({ contactId, status: null, failed: true });
      }
    })();
    return () => { cancelled = true; };
  }, [open, contactId, reloadKey]);

  const loaded = statusLoad?.contactId === contactId ? statusLoad : null;
  const loadingStatus = loaded === null;
  const conversationStatus = loaded?.status ?? null;
  const statusUnavailable = !loadingStatus && conversationStatus === null;

  const canClose = conversationStatus === 'open' || conversationStatus === 'waiting';
  const canArchive = conversationStatus === 'open' || conversationStatus === 'resolved';
  const canReopen =
    conversationStatus === 'waiting' ||
    conversationStatus === 'resolved' ||
    conversationStatus === 'archived';

  // Traduz o erro real do servidor e, quando a transição é inválida, recarrega
  // a lista (o dono já não é o estado que este diálogo mostrou).
  const reportFailure = (error: unknown, fallback: string) => {
    const kind = classifyClosureError(error);
    if (kind === 'invalid_transition') {
      const current = statusFromTransitionError(error);
      if (current) {
        window.dispatchEvent(
          new CustomEvent('zapp:contact-status-changed', {
            detail: { contactId, status: current },
          })
        );
      }
      toast.error(ERROR_MESSAGES.invalid_transition);
      // O pai liga onClosed ao refetch da lista do inbox.
      onClosed?.();
      return;
    }
    toast.error(kind === 'unknown' ? fallback : ERROR_MESSAGES[kind]);
  };

  const handleClose = async () => {
    if (!canClose) return;
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
    } catch (error) {
      console.warn('[CloseConversationDialog] Falha no encerramento atômico:', error);
      reportFailure(
        error,
        'Não foi possível encerrar a conversa. Nenhuma alteração parcial foi salva.',
      );
    } finally {
      if (isMountedRef.current) setSaving(false);
    }
  };

  // Arquivar/desarquivar usam a RPC set_conversation_status (a mesma da FSM de
  // contatos). O `motivo` do formulário é o motivo do ENCERRAMENTO: a FSM só o
  // grava quando o destino é 'resolved' e ele é ignorado em archived/open, então
  // não o enviamos aqui (evita registrar um motivo de encerramento numa ação de
  // arquivamento/reapertura).
  const handleStatusChange = async (next: 'archived' | 'open') => {
    if (saving) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('set_conversation_status', {
        p_contact_id: contactId,
        p_next: next,
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
      reportFailure(
        error,
        next === 'archived'
          ? 'Não foi possível arquivar a conversa.'
          : 'Não foi possível reabrir a conversa.',
      );
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
          {conversationStatus && (
            <p className="text-xs text-muted-foreground">
              Estado atual: {CONVERSATION_STATUS_LABEL[conversationStatus]}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="close-reason" className="text-sm font-medium">Motivo do encerramento *</Label>
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
            <Label htmlFor="close-outcome" className="text-sm font-medium">Resultado</Label>
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
            <Label htmlFor="close-classification" className="text-sm font-medium">Classificação</Label>
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
            <Label htmlFor="close-notes" className="text-sm font-medium">Observações</Label>
            <Textarea
              id="close-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anotações sobre o atendimento..."
              rows={3}
            />
          </div>

          {confirmingArchive && (
            <div
              role="group"
              aria-label="Confirmação de arquivamento"
              className="space-y-2 rounded-md border border-border bg-muted/50 p-3"
            >
              <p className="text-sm">
                Arquivar esta conversa? Ela sai da caixa de entrada e pode ser reaberta depois.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setConfirmingArchive(false)}>
                  Voltar
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setConfirmingArchive(false);
                    void handleStatusChange('archived');
                  }}
                  disabled={saving}
                >
                  Confirmar arquivamento
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
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
