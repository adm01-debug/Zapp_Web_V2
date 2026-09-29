import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { fromTable } from '@/lib/supabaseHelpers';
import { createMultiplixDraft } from './useMultiplixAudience';

export interface MultiplixDispatch {
  id: string;
  name: string;
  message_template: string;
  status: 'draft' | 'scheduled' | 'sending' | 'paused' | 'completed' | 'completed_with_failures' | 'failed' | 'cancelled';
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  delivered_count: number;
  outcome_unknown_count: number;
  started_at: string | null;
  paused_at: string | null;
  pause_reason: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface MultiplixRecipientRow {
  id: string;
  company_name_snapshot: string | null;
  destino_e164: string | null;
  status: string;
  sent_at: string | null;
  error_message: string | null;
  personalized_message: string | null;
}

export function useMultiplixDispatchesList() {
  return useQuery({
    queryKey: ['multiplix-dispatches-list'],
    queryFn: async () => {
      const { data, error } = await fromTable('multiplix_dispatches')
        .select('id, name, message_template, status, total_recipients, sent_count, failed_count, delivered_count, outcome_unknown_count, started_at, paused_at, pause_reason, completed_at, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as MultiplixDispatch[];
    },
    refetchInterval: 10_000,
  });
}

export function useMultiplixDispatch(dispatchId: string | null) {
  return useQuery({
    queryKey: ['multiplix-dispatch', dispatchId],
    queryFn: async () => {
      const { data, error } = await fromTable('multiplix_dispatches')
        .select('id, name, message_template, status, total_recipients, sent_count, failed_count, delivered_count, outcome_unknown_count, started_at, paused_at, pause_reason, completed_at, created_at')
        .eq('id', dispatchId!)
        .single();
      if (error) throw new Error(error.message);
      return data as MultiplixDispatch;
    },
    enabled: !!dispatchId,
    refetchInterval: 5_000,
  });
}

export function useMultiplixRecipients(dispatchId: string | null, statusFilter = 'all') {
  return useQuery({
    queryKey: ['multiplix-recipients', dispatchId, statusFilter],
    queryFn: async () => {
      let q = fromTable('multiplix_recipients')
        .select('id, company_name_snapshot, destino_e164, status, sent_at, error_message, personalized_message')
        .eq('dispatch_id', dispatchId!)
        .order('updated_at', { ascending: false })
        .limit(500);
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as MultiplixRecipientRow[];
    },
    enabled: !!dispatchId,
    refetchInterval: 5_000,
  });
}

export interface CreateMultiplixDispatchInput {
  name: string;
  messageTemplate: string;
  /** F08: o publico e por referencia — a edge re-resolve no Singu com o escopo do JWT. */
  companyIds: string[];
  contactIds?: string[];
  scheduledAt?: string | null;
  startNow: boolean;
  /** F17: confirmacao explicita quando o total passa do teto de destinatarios. */
  confirmOverLimit?: boolean;
}

async function invokeMultiplixSend(dispatchId: string, action: 'start' | 'pause' | 'cancel') {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const response = await supabase.functions.invoke('multiplix-send', {
    body: { dispatchId, action },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (response.error) throw new Error(response.error.message);
  // 'start' fora da janela de envio responde 200 com {ok:false, reason,
  // next_window} em vez de status de erro (nao ha transicao pra reverter),
  // entao invoke() nao rejeita sozinho -- sem isso, "Retomar" fecha o dialog
  // como sucesso mas o disparo continua pausado.
  const body = response.data as { ok?: boolean; reason?: string } | null;
  if (body?.ok === false) {
    throw new Error(body.reason ? `Fora da janela de envio: ${body.reason}` : 'Disparo recusado pelo motor de envio');
  }
  return response.data;
}

export interface CreateMultiplixDispatchResult {
  id: string;
  recipientCount: number;
  created: boolean;
}

export function useCreateMultiplixDispatch() {
  return useMutation({
    mutationFn: async (input: CreateMultiplixDispatchInput): Promise<CreateMultiplixDispatchResult> => {
      // F08: a criacao vive no servidor. A edge multiplix-audience re-resolve o
      // publico no Singu com o escopo do JWT e chama a RPC transacional
      // multiplix_create_draft (dispatch + destinatarios numa transacao,
      // idempotente por client_request_id). O navegador nao decide mais quem
      // recebe nem escreve direto em multiplix_dispatches/multiplix_recipients.
      const draft = await createMultiplixDraft({
        name: input.name,
        message_template: input.messageTemplate,
        company_ids: input.companyIds,
        contact_ids: input.contactIds ?? [],
        client_request_id: crypto.randomUUID(),
        scheduled_at: input.scheduledAt ?? null,
        confirm_over_limit: input.confirmOverLimit ?? false,
      });
      if (!draft.dispatch_id) throw new Error('Disparo criado sem identificador');
      const dispatchId = draft.dispatch_id;

      if (input.startNow) {
        // Nao aguarda: multiplix-send processa o loop de envio inteiro dentro
        // da mesma invocacao (sleep real de digitacao/intervalo por
        // destinatario), entao esperar aqui travaria o composer pelo tempo
        // total do disparo, sem permitir pausar/cancelar/acompanhar. Dispara
        // em background e deixa o monitor (que abre logo em seguida) refletir
        // o progresso via realtime/polling; se a janela de envio recusar o
        // start, o dispatch fica em 'draft' e o botao "Iniciar" do monitor
        // permite tentar de novo (com o erro real, via toast do runAction).
        invokeMultiplixSend(dispatchId, 'start').catch((startError) => {
          // Nao e so o caso esperado (fora da janela): auth/409/500/rede
          // tambem caem aqui, e sem avisar o usuario o disparo fica parado
          // (draft) ou preso em 'sending' sem ninguem saber o motivo.
          const message = startError instanceof Error ? startError.message : 'Erro ao iniciar disparo';
          console.error('multiplix-send start (background) falhou:', startError);
          toast.error(`Disparo salvo, mas o início falhou: ${message}`);
        });
      }

      return { id: dispatchId, recipientCount: draft.recipient_count, created: draft.created };
    },
  });
}

export function useMultiplixDispatchAction() {
  return useMutation({
    mutationFn: ({ dispatchId, action }: { dispatchId: string; action: 'start' | 'pause' | 'cancel' }) =>
      invokeMultiplixSend(dispatchId, action),
  });
}
