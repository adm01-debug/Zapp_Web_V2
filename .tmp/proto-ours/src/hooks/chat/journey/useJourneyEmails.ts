import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { JourneyRangeIso, RawEmail } from '@/lib/journey/rawRows';

/**
 * E-mails do contato no período (S026–S029) — a fonte de e-mail do Histórico (Journey).
 *
 * A consulta é das MENSAGENS (`email_messages`) das conversas (`email_threads`) DO CONTATO: a
 * junção embutida `email_threads!inner` traz o `assigned_to` da conversa e é por ela que o
 * escopo é aplicado — `email_threads.contact_id` e `email_threads.last_message_at` dentro do
 * intervalo. Ou seja, vale a `contact_id` do contato e a última atividade da conversa no
 * período, exatamente como se as duas consultas fossem feitas em série (uma ida ao banco).
 *
 * Ordem e paginação: `internal_date` decrescente com desempate por `id` e páginas de 300
 * mensagens por rolagem — sem teto de 500/200 (S096).
 *
 * Corpo do e-mail: a consulta pede `direction`, `subject`, `snippet`, `internal_date` e
 * `from_name`. `body_html`/`body_text` NÃO são pedidos nem existem no `RawEmail` — o Histórico
 * mostra assunto e trecho, nunca o corpo.
 *
 * Sem conta Gmail no departamento (ou RLS negando a leitura) o banco devolve zero linha sem
 * erro: o hook entrega lista vazia, sem exceção. Falha de verdade (rede/permissão que devolve
 * `error`) também NÃO vira exceção: a página vem vazia com `falhou` e o hook expõe `isError`,
 * para a tela dizer que não conseguiu carregar em vez de fingir "sem e-mail".
 */

/** Mensagens por página da rolagem. */
export const JOURNEY_EMAILS_PAGE_SIZE = 300;

/** Colunas cruas pedidas ao banco — sem corpo, sem endereço, sem rótulos do Gmail. */
const EMAIL_COLUMNS =
  'id, thread_id, direction, subject, snippet, internal_date, from_name, email_threads!inner(assigned_to)';

/** Linha de `email_messages` como o PostgREST a devolve (com a conversa embutida). */
interface EmailRow {
  id: string;
  thread_id: string;
  direction: string;
  subject: string;
  snippet: string;
  internal_date: string;
  from_name: string | null;
  /** Embed to-one; `!inner` garante que existe. */
  email_threads: { assigned_to: string | null } | null;
}

/**
 * Responsável pela conversa. O embed pode chegar como objeto (to-one) ou, em versões do
 * PostgREST que devolvem lista, como array de um item — os dois casos viram o mesmo valor.
 */
function assignedToOf(thread: EmailRow['email_threads'] | EmailRow['email_threads'][]): string | null {
  const alvo = Array.isArray(thread) ? thread[0] ?? null : thread;
  return alvo?.assigned_to ?? null;
}

/** Traduz a linha do banco para o tipo cru do histórico (corpo nunca é lido nem copiado). */
export function mapEmailRow(row: EmailRow): RawEmail {
  return {
    id: row.id,
    threadId: row.thread_id,
    direction: row.direction,
    subject: row.subject,
    snippet: row.snippet,
    at: row.internal_date,
    fromName: row.from_name ?? null,
    assignedTo: assignedToOf(row.email_threads),
  };
}

/** Uma página: as linhas e a marca de que a consulta DELA falhou (RLS silencioso não marca). */
export interface JourneyEmailPage {
  emails: RawEmail[];
  falhou: boolean;
}

export interface UseJourneyEmailsArgs {
  contactId: string | null | undefined;
  /** Pontas em UTC do período (do seletor da aba); `null` deixa aquele lado aberto. */
  range: JourneyRangeIso;
}

export interface JourneyEmailsState {
  emails: RawEmail[];
  /** Primeira carga (nenhuma página ainda) — controla o esqueleto de carga. */
  isLoading: boolean;
  /** Página seguinte em voo — controla o esqueleto do fim da lista. */
  isFetchingNextPage: boolean;
  /** Há mais páginas não carregadas. */
  hasMore: boolean;
  /** Sem conta Gmail/RLS negado NÃO marca: só falha real, com `error` do banco. */
  isError: boolean;
  fetchNextPage: () => void;
  refetch: () => void;
}

/** Chave de cache: contato + as duas pontas do período (primitivas, para não invalidar à toa). */
export const journeyEmailsKey = (
  contactId: string | null | undefined,
  range: JourneyRangeIso,
): readonly unknown[] => ['journey-emails', contactId ?? null, range.sinceIso, range.untilIso];

export function useJourneyEmails({ contactId, range }: UseJourneyEmailsArgs): JourneyEmailsState {
  const sinceIso = range.sinceIso;
  const untilIso = range.untilIso;

  const query = useInfiniteQuery({
    queryKey: journeyEmailsKey(contactId, range),
    enabled: !!contactId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<JourneyEmailPage> => {
      const from = pageParam * JOURNEY_EMAILS_PAGE_SIZE;
      let consulta = supabase
        .from('email_messages')
        .select(EMAIL_COLUMNS)
        .eq('email_threads.contact_id', contactId as string);
      if (sinceIso) consulta = consulta.gte('email_threads.last_message_at', sinceIso);
      if (untilIso) consulta = consulta.lte('email_threads.last_message_at', untilIso);

      const { data, error } = await consulta
        .order('internal_date', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + JOURNEY_EMAILS_PAGE_SIZE - 1);

      // Sem conta Gmail ou RLS negado o banco não devolve `error`: só zero linha. Erro de
      // verdade vira página vazia marcada, para a tela distinguir falha de "não há e-mail".
      if (error) return { emails: [], falhou: true };
      return { emails: ((data ?? []) as EmailRow[]).map(mapEmailRow), falhou: false };
    },
    // Página cheia = pode haver mais; página incompleta = fim da lista.
    getNextPageParam: (lastPage, allPages) =>
      lastPage.emails.length === JOURNEY_EMAILS_PAGE_SIZE ? allPages.length : undefined,
    staleTime: 30_000,
  });

  // Depende só de `query.data` (referência estável entre renderizações) — um array novo a cada
  // render nas dependências faria o `useMemo` recalcular à toa e acender o aviso do ESLint.
  const emails = useMemo(
    () => (query.data?.pages ?? []).flatMap((pagina) => pagina.emails),
    [query.data],
  );

  return {
    emails,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasMore: !!query.hasNextPage,
    isError: query.isError || (query.data?.pages ?? []).some((pagina) => pagina.falhou),
    fetchNextPage: () => { void query.fetchNextPage(); },
    refetch: () => { void query.refetch(); },
  };
}
