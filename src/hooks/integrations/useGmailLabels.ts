import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { callGmailFunction } from '../gmail/gmailApi';
import type { EmailLabel } from '../gmail/gmailTypes';

/**
 * PE-94 / paridade V3 (`useGmailLabels.ts`): camada de dados dos MARCADORES do
 * Gmail (criar, renomear e apagar). A leitura continua na consulta
 * `['gmail-labels', accountId]` do `useGmail` — este hook é a camada de escrita:
 * cada mutação escreve otimisticamente no cache dessa MESMA consulta, chama a
 * Edge `gmail-sync` (ações `create-label`/`update-label`/`delete-label`) e, em
 * erro, devolve o cache ao estado anterior antes de propagar o erro.
 *
 * Diferença deliberada da V3: lá o erro era engolido (`catch { return null }`) e
 * a tela não distinguia falha de sucesso; aqui o erro sobe para o chamador.
 */

/** Chave canônica da lista de marcadores (mesma do `useGmail`). */
export const GMAIL_LABELS_QUERY_KEY = 'gmail-labels';
export function gmailLabelsQueryKey(accountId?: string | null) {
  return [GMAIL_LABELS_QUERY_KEY, accountId ?? undefined] as const;
}

/** Limite de nome do Gmail (`users.labels.create`). */
export const GMAIL_LABEL_MAX_NAME_LENGTH = 225;

export type GmailLabelColor = { backgroundColor: string; textColor: string };
export type GmailLabelListVisibility = 'labelShow' | 'labelShowIfUnread' | 'labelHide';
export type GmailLabelMessageListVisibility = 'show' | 'hide';

export interface CreateGmailLabelInput {
  name: string;
  color?: GmailLabelColor;
  labelListVisibility?: GmailLabelListVisibility;
  messageListVisibility?: GmailLabelMessageListVisibility;
}

export interface UpdateGmailLabelInput {
  name?: string;
  color?: GmailLabelColor;
  labelListVisibility?: GmailLabelListVisibility;
  messageListVisibility?: GmailLabelMessageListVisibility;
}

/** Recurso de marcador devolvido pela API do Gmail (id = `gmail_label_id`). */
export interface GmailLabelResource {
  id: string;
  name?: string;
  type?: string;
  color?: { backgroundColor?: string };
  messagesTotal?: number;
  messagesUnread?: number;
}

/** Apara o nome e recusa vazio/só espaços e acima do limite do Gmail. */
export function normalizeGmailLabelName(rawName: string): string {
  const name = rawName.trim();
  if (name.length === 0) throw new Error('Informe o nome do marcador.');
  if (name.length > GMAIL_LABEL_MAX_NAME_LENGTH) {
    throw new Error(`O nome do marcador não pode passar de ${GMAIL_LABEL_MAX_NAME_LENGTH} caracteres.`);
  }
  return name;
}

function sortByName(labels: EmailLabel[]): EmailLabel[] {
  return [...labels].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Marcador de sistema não pode ser apagado/renomeado pela API do Gmail. */
function isSystemLabel(label: EmailLabel | undefined): boolean {
  return label?.label_type === 'system';
}

export function useGmailLabelsManagement(accountId?: string | null) {
  const queryClient = useQueryClient();
  const key = gmailLabelsQueryKey(accountId);
  const pendingSeq = useRef(0);

  const readCachedLabels = useCallback(
    () => queryClient.getQueryData<EmailLabel[]>(key),
    [queryClient, key],
  );

  const writeCachedLabels = useCallback(
    (labels: EmailLabel[]) => { queryClient.setQueryData(key, sortByName(labels)); },
    [queryClient, key],
  );

  // Rollback cirúrgico: desfaz só o que ESTA mutação escreveu. Restaurar o array
  // inteiro apagaria a atualização otimista de uma mutação irmã ainda em voo.
  // Sem cache anterior não há o que restaurar: invalida para buscar do servidor,
  // em vez de deixar a lista otimista mentindo na tela.
  const undoOptimistic = useCallback(
    (previous: EmailLabel[] | undefined, apply: (current: EmailLabel[]) => EmailLabel[]) => {
      const current = readCachedLabels();
      if (previous === undefined || current === undefined) {
        void queryClient.invalidateQueries({ queryKey: key });
        return;
      }
      writeCachedLabels(apply(current));
    },
    [key, queryClient, readCachedLabels, writeCachedLabels],
  );

  const finish = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: key });
  }, [queryClient, key]);

  const requireAccount = useCallback(() => {
    if (!accountId) throw new Error('Nenhuma conta do Gmail ativa.');
    return accountId;
  }, [accountId]);

  const createLabel = useCallback(async (input: CreateGmailLabelInput): Promise<GmailLabelResource> => {
    const accId = requireAccount();
    const name = normalizeGmailLabelName(input.name);
    const previous = readCachedLabels();
    const pendingId = `pending-create-${pendingSeq.current++}`;
    if (previous) {
      writeCachedLabels([...previous, {
        id: pendingId, gmail_label_id: pendingId, name, label_type: 'user',
        color: input.color?.backgroundColor ?? null, message_count: 0, unread_count: 0,
      }]);
    }
    try {
      const result = await callGmailFunction('gmail-sync', {
        action: 'create-label',
        account_id: accId,
        name,
        ...(input.color ? { color: input.color } : {}),
        ...(input.labelListVisibility ? { label_list_visibility: input.labelListVisibility } : {}),
        ...(input.messageListVisibility ? { message_list_visibility: input.messageListVisibility } : {}),
      }) as { success?: boolean; label?: GmailLabelResource };
      // Resposta ausente/`success: false` vira erro explícito (a V3 declarava
      // sucesso com `data` indefinido).
      if (!result?.success || !result.label?.id) throw new Error('O Gmail não confirmou a criação do marcador.');
      finish();
      toast.success(`Marcador "${name}" criado.`);
      return result.label;
    } catch (error) {
      undoOptimistic(previous, current => current.filter(
        label => label.id !== pendingId && label.gmail_label_id !== pendingId,
      ));
      const message = error instanceof Error ? error.message : 'erro desconhecido';
      toast.error(`Não foi possível criar o marcador: ${message}`);
      throw error;
    }
  }, [finish, readCachedLabels, requireAccount, undoOptimistic, writeCachedLabels]);

  const renameLabel = useCallback(async (labelId: string, input: UpdateGmailLabelInput): Promise<GmailLabelResource> => {
    const accId = requireAccount();
    const previous = readCachedLabels();
    const current = previous?.find(label => label.gmail_label_id === labelId || label.id === labelId);
    if (isSystemLabel(current)) throw new Error('Marcadores de sistema não podem ser renomeados.');
    const previousName = current?.name;
    const previousColor = current?.color;
    const hasName = input.name !== undefined;
    const name = hasName ? normalizeGmailLabelName(input.name as string) : undefined;
    if (name === undefined && !input.color && !input.labelListVisibility && !input.messageListVisibility) {
      throw new Error('Informe ao menos um campo para atualizar o marcador.');
    }
    if (previous && current) {
      writeCachedLabels(previous.map(label => (
        label.gmail_label_id === labelId || label.id === labelId
          ? {
            ...label,
            ...(name !== undefined ? { name } : {}),
            ...(input.color ? { color: input.color.backgroundColor } : {}),
          }
          : label
      )));
    }
    try {
      const result = await callGmailFunction('gmail-sync', {
        action: 'update-label',
        account_id: accId,
        label_id: labelId,
        ...(name !== undefined ? { name } : {}),
        ...(input.color ? { color: input.color } : {}),
        ...(input.labelListVisibility ? { label_list_visibility: input.labelListVisibility } : {}),
        ...(input.messageListVisibility ? { message_list_visibility: input.messageListVisibility } : {}),
      }) as { success?: boolean; label?: GmailLabelResource };
      if (!result?.success || !result.label?.id) throw new Error('O Gmail não confirmou a alteração do marcador.');
      finish();
      toast.success('Marcador atualizado.');
      return result.label;
    } catch (error) {
      undoOptimistic(previous, list => list.map(label => (
        label.gmail_label_id === labelId || label.id === labelId
          ? {
            ...label,
            ...(name !== undefined && previousName !== undefined ? { name: previousName } : {}),
            ...(input.color && previousColor !== undefined ? { color: previousColor } : {}),
          }
          : label
      )));
      const message = error instanceof Error ? error.message : 'erro desconhecido';
      toast.error(`Não foi possível atualizar o marcador: ${message}`);
      throw error;
    }
  }, [finish, readCachedLabels, requireAccount, undoOptimistic, writeCachedLabels]);

  const deleteLabel = useCallback(async (labelId: string): Promise<{ deleted: boolean; label_id: string }> => {
    const accId = requireAccount();
    const previous = readCachedLabels();
    const current = previous?.find(label => label.gmail_label_id === labelId || label.id === labelId);
    // Mesma recusa da Edge, aqui antes da viagem: marcador de sistema (INBOX,
    // CATEGORY_*, ...) não pode ser apagado.
    if (isSystemLabel(current)) throw new Error('Marcadores de sistema não podem ser apagados.');
    const removed = current;
    if (previous) {
      writeCachedLabels(previous.filter(label => label.gmail_label_id !== labelId && label.id !== labelId));
    }
    try {
      const result = await callGmailFunction('gmail-sync', {
        action: 'delete-label',
        account_id: accId,
        label_id: labelId,
      }) as { success?: boolean; deleted?: boolean; label_id?: string };
      if (!result?.success || !result.deleted) throw new Error('O Gmail não confirmou a remoção do marcador.');
      finish();
      toast.success('Marcador apagado.');
      return { deleted: true, label_id: result.label_id ?? labelId };
    } catch (error) {
      undoOptimistic(previous, list => (
        removed === undefined || list.some(label => label.id === removed.id) ? list : [...list, removed]
      ));
      const message = error instanceof Error ? error.message : 'erro desconhecido';
      toast.error(`Não foi possível apagar o marcador: ${message}`);
      throw error;
    }
  }, [finish, readCachedLabels, requireAccount, undoOptimistic, writeCachedLabels]);

  return { createLabel, renameLabel, deleteLabel };
}
