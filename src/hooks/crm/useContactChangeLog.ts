import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { log } from '@/lib/logger';

/**
 * useContactChangeLog — leitura da trilha de alteração de contato (`contact_change_log`,
 * criada pelo cartão de banco t_ba716533).
 *
 * O que a tabela guarda: UMA linha por alteração, com `campos text[]` trazendo SOMENTE os
 * NOMES das colunas alteradas — nunca os valores (sem telefone, e-mail ou endereço). Este
 * hook lê essa trilha e a entrega pronta para a tela: campos e operação em pt-BR, data como
 * o banco guardou e ator resolvido.
 *
 * Leitura PAGINADA e honesta: um `select()` sem `.range()` devolve só a primeira página
 * (teto de 1000 linhas do PostgREST) e a trilha mais antiga sumiria em silêncio. Aqui a
 * paginação é estável (`performed_at desc` + `id desc`, chave única como desempate) e a
 * leitura incompleta NÃO é apresentada como completa: vira erro.
 */

export const CONTACT_CHANGE_LOG_PAGE_SIZE = 1000;

export type ContactChangeOperation = 'insert' | 'update' | 'soft_delete' | 'restore';

export interface ContactChangeLogEntry {
  id: number;
  contactId: string;
  /** Operação crua, como o banco grava. */
  operation: ContactChangeOperation;
  /** Operação em pt-BR para a tela: Criado / Alterado / Excluído / Restaurado. */
  operationLabel: string;
  /** Nomes das colunas alteradas, como o banco gravou (`phone`, `assigned_to`...). */
  fields: string[];
  /** Os mesmos campos em pt-BR (`Telefone`, `Responsável`...). */
  fieldLabels: string[];
  /** Exatamente o valor de `performed_at` (ISO), sem reformatar. */
  performedAt: string;
  /** id do perfil do ator, quando havia perfil. */
  actorProfileId: string | null;
  /** id do usuário logado (`auth.uid()`) que fez a alteração. */
  actorUserId: string | null;
  /** Nome do ator resolvido em `profiles`; null quando o perfil não existe mais ou não há perfil. */
  actorName: string | null;
  /** false quando não há nome de ator para mostrar (perfil excluído / escrita sem JWT). */
  hasActor: boolean;
  /** Papel da conexão que gravou (`authenticated`, `service_role`...). */
  actorRole: string;
}

/** Colunas da lista branca do gatilho → rótulo em pt-BR. Coluna nova fora daqui cai no nome cru. */
const FIELD_LABELS: Record<string, string> = {
  name: 'Nome',
  nickname: 'Apelido',
  surname: 'Sobrenome',
  phone: 'Telefone',
  email: 'E-mail',
  company: 'Empresa',
  job_title: 'Cargo',
  avatar_url: 'Foto',
  assigned_to: 'Responsável',
  queue_id: 'Fila',
  whatsapp_connection_id: 'Conexão do WhatsApp',
  channel_type: 'Canal',
  channel_connection_id: 'Conexão do canal',
  group_category: 'Categoria do grupo',
  contact_type: 'Tipo de contato',
  notes: 'Observações',
  tags: 'Etiquetas',
  lead_score: 'Pontuação do lead',
  risk_score: 'Pontuação de risco',
  lead_origin: 'Origem',
  consent_status: 'Consentimento',
  conversation_status: 'Status da conversa',
  postal_code: 'CEP',
  address: 'Endereço',
  address_number: 'Número',
  neighborhood: 'Bairro',
  city: 'Cidade',
  state: 'Estado',
  latitude: 'Latitude',
  longitude: 'Longitude',
  deleted_at: 'Exclusão',
};

const OPERATION_LABELS: Record<ContactChangeOperation, string> = {
  insert: 'Criado',
  update: 'Alterado',
  soft_delete: 'Excluído',
  restore: 'Restaurado',
};

function operationLabel(operation: string): string {
  return OPERATION_LABELS[operation as ContactChangeOperation] ?? operation;
}

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

export const contactChangeLogKey = (contactId: string) =>
  ['contact-change-log', contactId] as const;

interface ContactChangeLogRow {
  id: number;
  contact_id: string;
  operation: string;
  campos: string[] | null;
  performed_by: string | null;
  performed_by_profile: string | null;
  performed_by_db_role: string;
  performed_at: string;
}

export function useContactChangeLog(contactId: string, options?: { enabled?: boolean }) {
  const enabled = (options?.enabled ?? true) && !!contactId;

  const query = useQuery({
    queryKey: contactChangeLogKey(contactId),
    enabled,
    queryFn: async (): Promise<ContactChangeLogEntry[]> => {
      const { rows, incomplete, error } = await fetchAllRows<ContactChangeLogRow>(
        (from, to) =>
          supabase
            .from('contact_change_log')
            .select(
              'id, contact_id, operation, campos, performed_by, performed_by_profile, performed_by_db_role, performed_at',
            )
            .eq('contact_id', contactId)
            .order('performed_at', { ascending: false })
            .order('id', { ascending: false })
            .range(from, to),
        { pageSize: CONTACT_CHANGE_LOG_PAGE_SIZE },
      );

      // Erro no meio da leitura: sobe em vez de devolver a trilha parcial como se fosse a
      // trilha inteira do contato.
      if (error) throw new Error(error.message);
      if (incomplete) throw new Error('Não foi possível ler a trilha de alterações completa.');

      // Ator: resolve o nome em `profiles`. O perfil pode ter sido excluído — nesse caso a
      // entrada CONTINUA na trilha e só o nome do ator some.
      const profileIds = [
        ...new Set(rows.map((row) => row.performed_by_profile).filter((id): id is string => !!id)),
      ];
      let nameById = new Map<string, string | null>();
      if (profileIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, name')
          .in('id', profileIds);
        // Falha ao resolver os nomes: sobe. Engolir o erro faria todo ator parecer "excluído"
        // (nome nulo) em vez de a leitura falhar de verdade.
        if (profilesError) throw new Error(profilesError.message);
        nameById = new Map((profiles ?? []).map((p) => [p.id, p.name]));
      }

      return rows.map((row) => {
        const fields = row.campos ?? [];
        const actorName = row.performed_by_profile
          ? nameById.get(row.performed_by_profile) ?? null
          : null;
        return {
          id: row.id,
          contactId: row.contact_id,
          operation: row.operation as ContactChangeOperation,
          operationLabel: operationLabel(row.operation),
          fields,
          fieldLabels: fields.map(fieldLabel),
          performedAt: row.performed_at,
          actorProfileId: row.performed_by_profile,
          actorUserId: row.performed_by,
          actorName,
          hasActor: actorName !== null,
          actorRole: row.performed_by_db_role,
        };
      });
    },
  });

  const entries = useMemo(() => query.data ?? [], [query.data]);

  return {
    entries,
    isLoading: query.isLoading,
    error: query.error,
    isEmpty: !query.isLoading && !query.error && entries.length === 0,
    refetch: query.refetch,
  };
}

/** Loga a falha de leitura da trilha sem derrubar a tela (uso opcional pelo consumidor). */
export function logChangeLogError(error: unknown) {
  log.error('Error reading contact change log:', error);
}
