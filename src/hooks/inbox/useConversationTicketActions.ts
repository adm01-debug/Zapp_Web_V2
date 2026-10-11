import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { useUserRole } from '@/hooks/system/useUserRole';
import type { ConversationContact, ConversationStatus } from '@/types/chat';

/**
 * Acoes de ticket do cabecalho da conversa (paridade V3 -> V2, faixa C):
 * "Assumir" e "Devolver a fila".
 *
 * As duas RPCs (`assume_conversation`, `return_conversation_to_queue`) sao a
 * unica fonte de verdade da permissao: revalidam fila/papel e gravam
 * `assigned_to` + `conversation_status` sob concorrencia otimista. Aqui o hook
 * so espelha o resultado para a UI:
 *   - atualiza o contato de forma otimista e volta atras se a RPC falhar;
 *   - traduz os erros da RPC para portugues (o usuario nunca ve um token);
 *   - deriva `canAssume`/`canReturn` e o rotulo de estado da conversa.
 *
 * Nota de estado (FSM `contacts.conversation_status`): `open` = em atendimento
 * com responsavel; `waiting` = na fila, sem responsavel; `resolved`/`closed`/
 * `archived` = encerrada (nao e assumivel nem devolvivel por aqui).
 */

/** Valores que a UI mostra enquanto a RPC nao responde. */
interface TicketPatch {
  contactId: string;
  /** Estado do servidor no momento do clique: base para soltar o patch quando
   *  o realtime/refetch trouxer qualquer valor novo (inclusive o esperado). */
  baseAssignedTo: string | null;
  baseStatus: ConversationStatus | null;
  assigned_to: string | null;
  conversation_status: ConversationStatus;
}

const TICKET_ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: 'Sua sessão expirou. Entre novamente para continuar.',
  profile_not_found: 'Seu perfil não foi encontrado. Fale com um administrador.',
  not_authorized: 'Você não tem permissão para esta ação nesta conversa.',
  contact_not_found: 'Esta conversa não existe mais. Atualize a lista.',
  conversation_not_active: 'Esta conversa já foi encerrada e não pode ser alterada.',
  already_assigned: 'Outro atendente já assumiu esta conversa.',
  concurrent_assignment: 'Outro atendente assumiu esta conversa antes de você.',
  concurrent_update: 'A conversa mudou enquanto você agia. Tente novamente.',
};

/**
 * Traduz o token levantado pela RPC (`RAISE EXCEPTION 'not_authorized'`, ...)
 * para uma mensagem em portugues. Sem token conhecido, devolve o generico.
 */
/**
 * Tipagem mínima local para as RPCs do cartão pai (t_4e49a6dc).
 * Evita importar os tipos gerados do pai (proibido pela recusa Ponto 1);
 * segue o precedente de `AtomicQueueRpc` em outbound-message.service.ts.
 * A chamada é feita como método de `rpcClient` (nunca função destacada)
 * para preservar o `this` do client.
 */
interface TicketQueueRpc {
  rpc: (
    name: 'assume_conversation' | 'return_conversation_to_queue',
    args: { p_contact_id: string; p_reason?: string | null },
  ) => Promise<{ data: TicketMutationResult | null; error: { message: string } | null }>;
}

export function translateTicketActionError(message?: string | null): string {
  if (message) {
    for (const [token, text] of Object.entries(TICKET_ERROR_MESSAGES)) {
      if (message.includes(token)) return text;
    }
  }
  return 'Não foi possível concluir a ação. Tente novamente.';
}

function isActiveStatus(status: ConversationStatus | null): boolean {
  return status !== 'resolved' && status !== 'closed' && status !== 'archived';
}

function isTerminalStatus(status: ConversationStatus | null): boolean {
  return status === 'resolved' || status === 'closed' || status === 'archived';
}

export interface UseConversationTicketActionsResult {
  /** Assume a conversa para o usuario logado. */
  assume: () => Promise<void>;
  /** Devolve a conversa para a fila (motivo opcional, entra em audit_logs). */
  returnToQueue: (reason?: string) => Promise<void>;
  isAssuming: boolean;
  isReturning: boolean;
  isBusy: boolean;
  /** Ha um responsavel e o usuario logado pode devolver a fila. */
  canReturn: boolean;
  /** Sem responsavel, ou responsavel de terceiro que o usuario pode assumir. */
  canAssume: boolean;
  /** Rotulo derivado: 'Aberta' | 'Na fila' | 'Em atendimento por <nome>' | 'Encerrada'. */
  statusLabel: string;
  /** Responsavel efetivo (ja com a atualizacao otimista aplicada). */
  assignedTo: string | null;
  /** Estado efetivo (ja com a atualizacao otimista aplicada). */
  conversationStatus: ConversationStatus | null;
}

function errorMessageOf(error: unknown): string | null {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message;
    return typeof value === 'string' ? value : null;
  }
  return null;
}

export function useConversationTicketActions(
  contact: ConversationContact,
): UseConversationTicketActionsResult {
  const { profile } = useAuth();
  const { isAdmin, isSupervisor } = useUserRole();
  const queryClient = useQueryClient();

  const myProfileId = profile?.id ?? null;
  const serverAssignedTo = contact.assigned_to ?? null;
  const serverStatus = contact.conversation_status ?? null;

  const [patch, setPatch] = useState<TicketPatch | null>(null);

  // Solta o patch quando a conversa mudou ou quando o servidor ja refletiu um
  // valor novo (realtime/refetch). Sem isso, o valor otimista ficaria preso e
  // esconderia uma mudanca real — ex.: outro atendente assumiu antes.
  if (patch) {
    const contactChanged = patch.contactId !== contact.id;
    const serverMoved =
      serverAssignedTo !== patch.baseAssignedTo || serverStatus !== patch.baseStatus;
    if (contactChanged || serverMoved) setPatch(null);
  }

  const assignedTo = patch ? patch.assigned_to : serverAssignedTo;
  const conversationStatus = patch ? patch.conversation_status : serverStatus;

  const isMine = myProfileId !== null && assignedTo === myProfileId;

  // Nome do responsavel: o proprio usuario ja vem do contexto de auth; um
  // responsavel de terceiro e resolvido em profiles (contacts.assigned_to e FK
  // para profiles.id, nunca o auth.users.id).
  const { data: assigneeName } = useQuery({
    queryKey: ['profile-display-name', assignedTo],
    enabled: !!assignedTo && !isMine,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', assignedTo as string)
        .maybeSingle();
      if (error) throw error;
      return (data?.name as string | undefined) ?? null;
    },
  });

  const statusLabel = (() => {
    if (isTerminalStatus(conversationStatus)) return 'Encerrada';
    if (assignedTo) {
      const name = isMine ? (profile?.name ?? assigneeName ?? null) : (assigneeName ?? null);
      return name ? `Em atendimento por ${name}` : 'Em atendimento';
    }
    if (conversationStatus === 'waiting') return 'Na fila';
    return 'Aberta';
  })();

  const canSupervise = isAdmin || isSupervisor;
  const canReturn = isActiveStatus(conversationStatus) && !!assignedTo && (canSupervise || isMine);
  const canAssume =
    isActiveStatus(conversationStatus) && !isMine && (assignedTo === null || canSupervise);

  const assumeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as unknown as TicketQueueRpc).rpc('assume_conversation', {
        p_contact_id: contact.id,
      });
      if (error) throw error;
      if (!data || (data as { ok?: boolean }).ok !== true) {
        throw new Error('unexpected_response');
      }
      return data as { ok: true; assigned_to: string | null; conversation_status: string };
    },
    onMutate: () => {
      setPatch({
        contactId: contact.id,
        baseAssignedTo: serverAssignedTo,
        baseStatus: serverStatus,
        assigned_to: myProfileId,
        conversation_status: 'open',
      });
    },
    onError: (error) => {
      setPatch(null);
      toast.error(translateTicketActionError(errorMessageOf(error)));
    },
    onSuccess: () => {
      // Patch otimista da lista in-memory (mesmo canal do encerramento) — o
      // assigned_to chega pelo realtime de contacts, sem recarregar a pagina.
      window.dispatchEvent(
        new CustomEvent('zapp:contact-status-changed', {
          detail: { contactId: contact.id, status: 'open' },
        }),
      );
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Conversa assumida');
    },
  });

  const returnMutation = useMutation({
    mutationFn: async (reason?: string) => {
      const { data, error } = await (supabase as unknown as TicketQueueRpc).rpc('return_conversation_to_queue', {
        p_contact_id: contact.id,
        p_reason: reason ?? undefined,
      });
      if (error) throw error;
      if (!data || (data as { ok?: boolean }).ok !== true) {
        throw new Error('unexpected_response');
      }
      return data as { ok: true; assigned_to: string | null; conversation_status: string };
    },
    onMutate: () => {
      setPatch({
        contactId: contact.id,
        baseAssignedTo: serverAssignedTo,
        baseStatus: serverStatus,
        assigned_to: null,
        conversation_status: 'waiting',
      });
    },
    onError: (error) => {
      setPatch(null);
      toast.error(translateTicketActionError(errorMessageOf(error)));
    },
    onSuccess: () => {
      window.dispatchEvent(
        new CustomEvent('zapp:contact-status-changed', {
          detail: { contactId: contact.id, status: 'waiting' },
        }),
      );
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Conversa devolvida para a fila');
    },
  });

  return {
    assume: async () => {
      await assumeMutation.mutateAsync();
    },
    returnToQueue: async (reason?: string) => {
      await returnMutation.mutateAsync(reason);
    },
    isAssuming: assumeMutation.isPending,
    isReturning: returnMutation.isPending,
    isBusy: assumeMutation.isPending || returnMutation.isPending,
    canReturn,
    canAssume,
    statusLabel,
    assignedTo,
    conversationStatus,
  };
}
