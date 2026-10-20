import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { createGmailOAuthState, storeGmailOAuthReturnContext } from '@/lib/gmailOAuth';
import { callGmailFunction } from '../gmail/gmailApi';
import { useGmailLabelsManagement, gmailLabelsQueryKey } from './useGmailLabels';
import { RESERVED_HASHES } from '@/hooks/system/useNavigationHistory';
import { normalizeEmailBase64 } from '@/lib/emailAttachments';
import { downloadFileWithPermission, notifyDownloadBlocked } from '@/lib/downloadFile';
import { useDownloadPermission } from '@/hooks/system/useDownloadPermission';
import { chunkEmailIds, collectEmailPages } from '@/lib/emailPagination';
import { escapeOrFilterValue } from '@/lib/postgrestFilters';
import { emailLoadErrorCopy } from '@/lib/emailErrorState';
import {
  collectEmailSearchThreadIds, EMAIL_THREAD_DEFAULT_FILTERS, EMAIL_THREAD_SEARCH_PAGE_SIZE, emailThreadPageCount,
  emailThreadPageRange, emailThreadQueryDescriptor, emailThreadSearchOr, emailThreadSelectColumns,
  escapeLikeWildcards, type EmailThreadListQuery, type EmailThreadSearchMatch,
} from '@/lib/emailThreadQuery';

export { EMAIL_THREAD_DEFAULT_FILTERS, EMAIL_THREAD_PAGE_SIZE } from '@/lib/emailThreadQuery';
export type { EmailThreadListFilters, EmailThreadListQuery, EmailThreadStateFilter, EmailThreadPeriodFilter } from '@/lib/emailThreadQuery';

// Re-export types
export type { GmailAccount, EmailThread, EmailMessage, EmailAttachment, EmailLabel } from '../gmail/gmailTypes';
import type { GmailAccount, GmailSyncStatus, EmailThread, EmailMessage, EmailAttachment, EmailLabel } from '../gmail/gmailTypes';

// PE-94: camada de escrita dos marcadores, alcançável por quem importa o barril
// `hooks/integrations` (que faz `export * from './useGmail'`).
export {
  useGmailLabelsManagement, gmailLabelsQueryKey, normalizeGmailLabelName, GMAIL_LABEL_MAX_NAME_LENGTH,
} from './useGmailLabels';
export type {
  CreateGmailLabelInput, UpdateGmailLabelInput, GmailLabelResource, GmailLabelColor,
} from './useGmailLabels';

// Arrays vazios de identidade estável: `= []` no destructuring cria uma referência nova a cada
// render enquanto a consulta carrega, o que re-dispara memos/efeitos dos consumidores
// (R2-COM-001: EmailChatThread re-emitia o contexto e alimentava o ciclo de atualização do painel).
const EMPTY_MESSAGES: EmailMessage[] = [];
const EMPTY_ATTACHMENTS: EmailAttachment[] = [];

/**
 * OTH-005: a lista de threads busca UMA página no servidor — filtros e janela vão
 * para o banco antes da paginação. Não existe mais caminho que colete a caixa
 * inteira em memória (`full`), e a última tela que o pedia (GmailInboxView) migrou.
 */
const DEFAULT_THREAD_LIST_QUERY: EmailThreadListQuery = { ...EMAIL_THREAD_DEFAULT_FILTERS, page: 1 };

/**
 * Status da thread visto pela tela antiga de Gmail (`open`/`archived` na prática —
 * `gmail-helpers.ts` grava `open` quando a mensagem tem o rótulo INBOX e `archived`
 * caso contrário). Não é derivável dos campos do contrato paginado (estado, pasta,
 * período, anexos, busca), então entra como extensão OPCIONAL do hook e é aplicada
 * NO SERVIDOR: filtrar a página em memória esconderia itens das outras páginas.
 */
export type EmailThreadStatusFilter = 'open' | 'pending' | 'resolved' | 'archived';
export interface EmailThreadListQueryWithStatus extends EmailThreadListQuery {
  threadStatus?: EmailThreadStatusFilter;
}
const EMPTY_THREAD_PAGE: { rows: EmailThread[]; total: number | null } = { rows: [], total: null };

/**
 * Aviso padrão de falha das AÇÕES do e-mail (desconectar, marcar lido, lixeira,
 * marcador, rascunho). O texto por tipo de falha já existe em
 * `emailLoadErrorCopy` (offline, sessão expirada, sem permissão, limite do Gmail,
 * servidor) — o título diz QUAL ação não saiu e a descrição continua a mesma do
 * carregamento. Antes, as ações sem `onError` falhavam em silêncio e as que
 * tinham interpolavam `error.message` cru, que é `undefined` quando a rejeição
 * não é um `Error`.
 */
function notifyGmailActionError(action: string, error: unknown): void {
  toast.error(`Não foi possível ${action}`, { description: emailLoadErrorCopy(error).description });
}

// PE-94: camada de escrita dos marcadores, alcançável por quem importa o barril
// `hooks/integrations` (que faz `export * from './useGmail'`).
export {
  useGmailLabelsManagement, gmailLabelsQueryKey, normalizeGmailLabelName, GMAIL_LABEL_MAX_NAME_LENGTH,
} from './useGmailLabels';
export type {
  CreateGmailLabelInput, UpdateGmailLabelInput, GmailLabelResource, GmailLabelColor,
} from './useGmailLabels';

// Arrays vazios de identidade estável: `= []` no destructuring cria uma referência nova a cada
// render enquanto a consulta carrega, o que re-dispara memos/efeitos dos consumidores
// (R2-COM-001: EmailChatThread re-emitia o contexto e alimentava o ciclo de atualização do painel).
const EMPTY_MESSAGES: EmailMessage[] = [];
const EMPTY_ATTACHMENTS: EmailAttachment[] = [];

/**
 * OTH-005: o caminho padrão da lista busca UMA página no servidor. O consumidor legado
 * que ainda precisa do conjunto inteiro em memória pede `full: true` (GmailInboxView).
 */
const DEFAULT_THREAD_LIST_QUERY: EmailThreadListQuery = { ...EMAIL_THREAD_DEFAULT_FILTERS, page: 1 };
const EMPTY_THREAD_PAGE: { rows: EmailThread[]; total: number | null } = { rows: [], total: null };

/**
 * Origin view for the OAuth return trip. The canonical URL is ?view=<id>; the
 * hash stays as a migration fallback for links minted before the switch.
 * Skip-to-content anchors (RESERVED_HASHES) are not navigation views.
 */
function getOAuthReturnView(): string {
  const viewParam = new URLSearchParams(window.location.search).get('view');
  if (viewParam) return viewParam;
  const hash = window.location.hash.replace('#', '');
  if (hash && !RESERVED_HASHES.has(hash)) return hash;
  return 'integrations';
}

/**
 * PE-07 — texto pt-BR do cabeçalho do e-mail: há quanto tempo a conta sincronizou.
 * `null` quando a conta nunca sincronizou ou o carimbo é inválido (a tela não
 * mostra texto em branco nem 'há 0 min' inventado). Carimbo no futuro (relógio
 * fora de sincronia) cai em 'agora' em vez de número negativo.
 */
export function formatLastSyncLabel(lastSyncAt: string | Date | null, now: number = Date.now()): string | null {
  if (lastSyncAt === null || lastSyncAt === undefined || lastSyncAt === '') return null;
  const timestamp = lastSyncAt instanceof Date ? lastSyncAt.getTime() : new Date(lastSyncAt).getTime();
  if (Number.isNaN(timestamp)) return null;
  const elapsedMinutes = Math.floor((now - timestamp) / 60_000);
  if (elapsedMinutes < 1) return 'sincronizado agora';
  if (elapsedMinutes < 60) return `sincronizado há ${elapsedMinutes} min`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `sincronizado há ${elapsedHours} h`;
  return `sincronizado há ${Math.floor(elapsedHours / 24)} d`;
}

export function useGmail(accountId?: string, requestedThreadId?: string | null, listQuery?: EmailThreadListQueryWithStatus) {
  const queryClient = useQueryClient();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  // Y29 / SEC-SAIDAS_DE_INFORMACAO-01 — o anexo só desce para o disco com
  // `profiles.can_download` (mesmo gate de MediaPreview/ImagePreview).
  const { canDownload } = useDownloadPermission();

  const { data: accounts = [], isLoading: accountsLoading, error: accountsError, refetch: refetchAccounts } = useQuery({
    queryKey: ['gmail-accounts'],
    queryFn: async () => {
      try {
        const result = await callGmailFunction('gmail-oauth', { action: 'list-accounts' });
        return (result.accounts || []) as GmailAccount[];
      } catch {
        const { data, error } = await supabase.rpc('get_own_gmail_accounts');
        if (error) throw error;
        return (data || []).map((a: Record<string, unknown>) => ({
          id: a.id, user_id: a.user_id, email_address: a.email_address, is_active: a.is_active,
          sync_status: a.sync_status || 'pending', last_sync_at: a.last_sync_at,
          last_error: a.last_error ?? null, created_at: a.created_at,
        })) as GmailAccount[];
      }
    },
    // PE-07/PM-23 — o cron grava `reauth_required` na conta sem que ninguém mexa
    // na tela; com o `staleTime` de 5 min e `refetchOnWindowFocus:false` do
    // queryClient, a faixa de reconexão só aparecia depois de recarregar. A
    // consulta se repete a cada 60 s enquanto a tela estiver observando; em aba
    // oculta o ciclo fica parado (`refetchIntervalInBackground` é false).
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const activeAccount = accountId ? accounts.find(a => a.id === accountId && a.is_active) : accounts.find(a => a.is_active);

  // PE-06 — o módulo de e-mail passa a saber, pela conta ativa, se a sincronização
  // exige reconectar (`sync_status='reauth_required'`, gravado pelo backend quando o
  // Google recusa o refresh token) e qual foi a última falha. `lastError` é o texto
  // do backend já sanitizado (sem token nem e-mail completo —
  // supabase/functions/_shared/gmail-helpers.ts); aqui só é normalizado para
  // string não vazia ou null, sem inventar texto próprio.
  const syncStatus: GmailSyncStatus | null = activeAccount?.sync_status ?? null;
  const lastError: string | null = activeAccount?.last_error?.trim() ? activeAccount.last_error.trim() : null;
  const lastSyncedAt: string | null = activeAccount?.last_sync_at ?? null;
  const needsReconnect = syncStatus === 'reauth_required';

  // PE-07 — o rótulo relativo do cabeçalho ('sincronizado há 3 min') precisa
  // envelhecer sozinho: um relógio de 30 s re-renderiza o texto enquanto a tela
  // estiver montada, sem nenhuma consulta nova.
  const [clockNow, setClockNow] = useState(() => Date.now());
  useEffect(() => {
    const ticker = setInterval(() => setClockNow(Date.now()), 30_000);
    return () => clearInterval(ticker);
  }, []);
  const lastSyncLabel = formatLastSyncLabel(lastSyncedAt, clockNow);

  const invalidateThreadData = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['gmail-threads'] });
    void queryClient.invalidateQueries({ queryKey: ['gmail-thread-counts'] });
  }, [queryClient]);

  const connectGmail = useMutation({
    mutationFn: async () => {
      const returnView = getOAuthReturnView();
      const state = createGmailOAuthState({ view: returnView, integrationView: 'gmail' });
      const result = await callGmailFunction('gmail-oauth', { action: 'get-auth-url', state });
      return { url: result.url as string, returnView };
    },
    onSuccess: ({ url, returnView }) => { storeGmailOAuthReturnContext(returnView, 'gmail'); window.location.assign(url); },
    onError: (error: Error) => { toast.error(`Erro ao conectar Gmail: ${error.message}`); },
  });

  const exchangeCode = useMutation({
    mutationFn: async (params: { code: string; state: string }) => callGmailFunction('gmail-oauth', { action: 'exchange-code', ...params }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['gmail-accounts'] }); toast.success('Gmail conectado com sucesso!'); },
    onError: (error: Error) => { toast.error(`Erro na autenticação: ${error.message}`); },
  });

  const disconnectGmail = useMutation({
    mutationFn: async (accId: string) => callGmailFunction('gmail-oauth', { action: 'disconnect', account_id: accId }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['gmail-accounts'] });
      invalidateThreadData();
      // A Edge responde 200 com `partial: true` / `revoked: false` quando a conta
      // saiu daqui mas o Google não confirmou a revogação
      // (supabase/functions/gmail-oauth/index.ts:259-271). Anunciar 'Gmail
      // desconectado' ali faz o operador acreditar que o acesso foi revogado no
      // Google quando ainda existe credencial ativa lá.
      if (data?.revoked === false || data?.partial === true) {
        toast.warning('Gmail desconectado aqui', {
          description: 'O Google não confirmou a revogação do acesso. Revogue em myaccount.google.com/permissions.',
        });
        return;
      }
      toast.success('Gmail desconectado');
    },
    onError: (error: Error) => notifyGmailActionError('desconectar o Gmail', error),
  });

  const effectiveListQuery: EmailThreadListQueryWithStatus = listQuery ?? DEFAULT_THREAD_LIST_QUERY;

  const { data: threadPage = EMPTY_THREAD_PAGE, isLoading: threadsLoading, error: threadsError, refetch: refetchThreads } = useQuery({
    queryKey: ['gmail-threads', activeAccount?.id, effectiveListQuery],
    queryFn: async () => {
      if (!activeAccount) return EMPTY_THREAD_PAGE;

      // OTH-005: estado, pasta/marcador, período, anexos e busca vão ao servidor, antes
      // da paginação; a resposta traz só a janela pedida e a contagem exata do filtro.
      const descriptor = emailThreadQueryDescriptor(effectiveListQuery);
      let query = supabase
        .from('email_threads')
        .select(emailThreadSelectColumns(effectiveListQuery), { count: 'exact' })
        .eq('gmail_account_id', activeAccount.id);
      if (descriptor.isUnread) query = query.eq('is_unread', true);
      if (descriptor.isStarred) query = query.eq('is_starred', true);
      if (descriptor.labelId) query = query.contains('label_ids', [descriptor.labelId]);
      if (descriptor.since) query = query.gte('last_message_at', descriptor.since);
      if (descriptor.hasAttachments) query = query.eq('email_messages.has_attachments', true);
      // PE-09: o termo também mora no corpo (email_messages.body_text) e no nome do
      // anexo (email_attachments.filename), que esta consulta PostgREST não alcança.
      // A RPC search_email_threads (SECURITY INVOKER — respeita a RLS) devolve os
      // thread_id que casam em assunto/remetente/trecho/corpo/anexo, paginando por
      // cursor (p_after = last_message_at da última linha). Esses ids entram ADITIVOS
      // ao `.or` de colunas que já existia — combinados com os filtros estruturais
      // (pasta, estado, período, anexos) e com os contatos que casam o termo —, então
      // assunto/remetente/trecho seguem sendo encontrados mesmo se a RPC truncar.
      if (effectiveListQuery.threadStatus) query = query.eq('status', effectiveListQuery.threadStatus);
      const searchTerm = descriptor.search;
      if (searchTerm) {
        const matches = await collectEmailSearchThreadIds(async (after) => {
          const args: { p_account: string; p_q: string; p_limit: number; p_after?: string } = {
            p_account: activeAccount.id,
            p_q: searchTerm,
            p_limit: EMAIL_THREAD_SEARCH_PAGE_SIZE,
          };
          if (after) args.p_after = after;
          const { data, error } = await supabase.rpc('search_email_threads', args);
          if (error) throw error;
          return (data ?? []) as EmailThreadSearchMatch[];
        });
      if (descriptor.search) {
        // O OR também casa contato pelo `contact_id` da própria thread — coluna,
        // não join, então thread sem contato não é excluída. Os ids vêm de uma
        // consulta à tabela de contatos com o mesmo termo saneado.
        const pattern = escapeOrFilterValue(`%${escapeLikeWildcards(descriptor.search)}%`);
        const { data: contactRows, error: contactsError } = await supabase
          .from('contacts')
          .select('id')
          .or(`name.ilike.${pattern},email.ilike.${pattern}`)
          .limit(200);
        if (contactsError) throw contactsError;
        query = query.or(emailThreadSearchOr(
          searchTerm,
          (contactRows ?? []).map(row => row.id),
          matches.map(match => match.thread_id),
        ));
      }
      }
      const range = emailThreadPageRange(effectiveListQuery.page);
      const { data, error, count } = await query
        .order('last_message_at', { ascending: false })
        .order('id', { ascending: false })
        .range(range.from, range.to);
      if (error) throw error;
      // O select é montado em runtime (o join de anexos é condicional), então o
      // supabase-js não consegue inferir a linha: a lista de colunas é a mesma do
      // caminho legado e o tipo é declarado aqui.
      const rows = (data ?? []) as unknown as EmailThread[];
      // Mesmo preenchimento do caminho `full`, restrito aos ids da página.
      const attachmentRows = await Promise.all(chunkEmailIds(rows.map(row => row.id)).map(async threadIds => {
        const { data: flags, error: attachmentsError } = await supabase
          .from('email_messages')
          .select('thread_id')
          .eq('gmail_account_id', activeAccount.id)
          .eq('has_attachments', true)
          .in('thread_id', threadIds);
        if (attachmentsError) throw attachmentsError;
        return flags || [];
      }));
      const withAttachments = new Set(attachmentRows.flat().map(row => row.thread_id));
      return { rows: rows.map(row => ({ ...row, has_attachments: withAttachments.has(row.id) })), total: count ?? null };
    },
    enabled: !!activeAccount,
  });
  const threads = threadPage.rows;

  const { data: exactThreadCounts } = useQuery({
    queryKey: ['gmail-thread-counts', activeAccount?.id],
    queryFn: async () => {
      if (!activeAccount) return { unread: 0 };
      const unreadResult = await supabase
        .from('email_threads')
        .select('id', { count: 'exact', head: true })
        .eq('gmail_account_id', activeAccount.id)
        .eq('is_unread', true);
      if (unreadResult.error) throw unreadResult.error;
      return { unread: unreadResult.count ?? null };
    },
    enabled: !!activeAccount,
  });

  const { data: requestedThread = null, isLoading: requestedThreadLoading, error: requestedThreadError } = useQuery({
    queryKey: ['gmail-thread', activeAccount?.id, requestedThreadId],
    queryFn: async () => {
      if (!activeAccount || !requestedThreadId) return null;
      const cached = threads.find(thread => thread.id === requestedThreadId);
      if (cached) return cached;
      const { data, error } = await supabase
        .from('email_threads')
        .select('*, contact:contacts(id, name, email, avatar_url, phone, company, job_title, tags)')
        .eq('gmail_account_id', activeAccount.id)
        .eq('id', requestedThreadId)
        .maybeSingle();
      if (error) throw error;
      return (data as EmailThread | null) ?? null;
    },
    enabled: !!activeAccount && !!requestedThreadId,
  });

  const { data: threadMessages = EMPTY_MESSAGES, isLoading: messagesLoading, error: messagesError, refetch: refetchMessages } = useQuery({
    queryKey: ['gmail-messages', activeAccount?.id, selectedThreadId],
    queryFn: async () => {
      if (!selectedThreadId || !activeAccount) return [];
      // R2-COM-007: uma conversa maior que o teto de linhas por resposta da API
      // voltava truncada (as mensagens recentes sumiam e o alvo de resposta caía
      // numa mensagem antiga da amostra). A lista de threads já pagina com
      // collectEmailPages; o histórico passa a paginar igual. A ordem declara o
      // desempate por `id` porque paginar por offset exige ordem estável —
      // `internal_date` sozinho empata e a página seguinte não é reprodutível.
      return collectEmailPages<EmailMessage>(async (from, to) => {
        const { data, error } = await supabase
          .from('email_messages')
          .select('*')
          .eq('gmail_account_id', activeAccount.id)
          .eq('thread_id', selectedThreadId)
          .order('internal_date', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to);
        if (error) throw error;
        return (data || []) as EmailMessage[];
      });
    },
    enabled: !!selectedThreadId && !!activeAccount,
  });

  const { data: threadAttachments = EMPTY_ATTACHMENTS } = useQuery({
    queryKey: ['gmail-attachments', activeAccount?.id, selectedThreadId, threadMessages.map(message => message.id).join(':')],
    queryFn: async () => {
      if (!activeAccount || threadMessages.length === 0) return [];
      // R2-COM-007: o conjunto de anexos da conversa também podia passar do teto
      // de linhas de uma resposta (um e-mail com vários anexos gera uma linha por
      // anexo). Cada lote de ids — o lote existe para o filtro `in` não estourar —
      // é paginado com `range`, com ordem estável pelo `id`.
      const paginas = await Promise.all(chunkEmailIds(threadMessages.map(message => message.id)).map(ids =>
        collectEmailPages<EmailAttachment>(async (from, to) => {
          const { data, error } = await supabase
            .from('email_attachments')
            .select('*')
            .in('email_message_id', ids)
            .order('id', { ascending: true })
            .range(from, to);
          if (error) throw error;
          return (data || []) as EmailAttachment[];
        }),
      ));
      return paginas.flat();
    },
    enabled: !!activeAccount && threadMessages.length > 0,
  });

  const { data: labels = [] } = useQuery({
    queryKey: gmailLabelsQueryKey(activeAccount?.id),
    queryFn: async () => {
      if (!activeAccount) return [];
      const { data, error } = await supabase.from('email_labels').select('*').eq('gmail_account_id', activeAccount.id).order('name');
      if (error) throw error;
      return (data || []) as EmailLabel[];
    },
    enabled: !!activeAccount,
  });

  // PE-94: camada de escrita dos marcadores (criar/renomear/apagar) com
  // atualização otimista sobre a MESMA consulta `gmail-labels` acima.
  const labelsManagement = useGmailLabelsManagement(activeAccount?.id);

  const syncInbox = useMutation({
    mutationFn: async (options?: { query?: string; maxResults?: number }) => {
      if (!activeAccount) throw new Error('No active Gmail account');
      return callGmailFunction('gmail-sync', { action: 'sync-inbox', account_id: activeAccount.id, ...options });
    },
    retry: 1,
    onSuccess: (data) => {
      // O gmail-sync responde HTTP 207 (`success: false`, `failed > 0`) quando a
      // sincronização é parcial. O FunctionsClient trata todo 2xx — inclusive 207 —
      // como sucesso e devolve `error: null`; o payload de domínio é a única fonte
      // da verdade. Interpretar pelo `error` do transporte fazia a tela anunciar
      // caixa completa para uma sincronização parcial (achado OTH-003 / EN-081).
      const synced = Number(data?.synced ?? 0);
      const failed = Number(data?.failed ?? 0);
      const isPartial = data?.success === false || failed > 0;

      invalidateThreadData();
      queryClient.invalidateQueries({ queryKey: ['gmail-labels'] });
      // O backend já grava sync_status/last_error na conta; sem invalidar aqui, o
      // estado de erro salvo continua escondido pelo cache do React Query.
      queryClient.invalidateQueries({ queryKey: ['gmail-accounts'] });

      if (!isPartial) { toast.success(`${synced} emails sincronizados`); return; }

      // Recuperação explícita: a retomada é do operador e só refaz o trabalho
      // pendente (o backend não avança o cursor em 207), sem toast de sucesso
      // integral e sem reenvio de e-mail. Diagnóstico sanitizado: só contagens.
      const retry = { label: 'Tentar de novo', onClick: () => syncInbox.mutate({}) };
      const description = `${synced} e-mail(s) sincronizado(s), ${failed} falharam. A retomada não reenvia e-mails.`;
      if (synced > 0) {
        toast.warning('Sincronização parcial', { description, action: retry });
      } else {
        toast.error('Falha na sincronização', { description, action: retry });
      }
    },
    onError: (error: Error) => { toast.error(`Erro ao sincronizar: ${error.message}`); },
  });

  const syncLabels = useMutation({
    mutationFn: async () => {
      if (!activeAccount) throw new Error('No active Gmail account');
      return callGmailFunction('gmail-sync', { action: 'sync-labels', account_id: activeAccount.id });
    },
    retry: 1,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['gmail-labels'] }); },
    onError: (error: Error) => notifyGmailActionError('sincronizar os marcadores', error),
  });

  const sendEmail = useMutation({
    mutationFn: async (params: { to: string | string[]; subject: string; text_body?: string; html_body?: string; cc?: string[]; bcc?: string[]; attachments?: Array<{ filename: string; mimeType: string; content: string }> }) => {
      if (!activeAccount) throw new Error('No active Gmail account');
      return callGmailFunction('gmail-send', { action: 'send', account_id: activeAccount.id, ...params });
    },
    onSuccess: () => { invalidateThreadData(); toast.success('Email enviado com sucesso!'); },
    onError: (error: Error) => { toast.error(`Erro ao enviar: ${error.message}`); },
  });

  const replyEmail = useMutation({
    mutationFn: async (params: { thread_id: string; message_id: string; to: string | string[]; subject?: string; text_body?: string; html_body?: string; cc?: string[]; bcc?: string[]; attachments?: Array<{ filename: string; mimeType: string; content: string }> }) => {
      if (!activeAccount) throw new Error('No active Gmail account');
      return callGmailFunction('gmail-send', { action: 'reply', account_id: activeAccount.id, ...params });
    },
    onSuccess: () => { invalidateThreadData(); queryClient.invalidateQueries({ queryKey: ['gmail-messages'] }); toast.success('Resposta enviada!'); },
    onError: (error: Error) => { toast.error(`Erro ao responder: ${error.message}`); },
  });

  const markAsRead = useMutation({
    mutationFn: async (messageIds: string[]) => {
      if (!activeAccount) throw new Error('No active Gmail account');
      return callGmailFunction('gmail-send', { action: 'mark-read', account_id: activeAccount.id, message_ids: messageIds });
    },
    retry: 1,
    onSuccess: (data, messageIds) => {
      invalidateThreadData();
      queryClient.invalidateQueries({ queryKey: ['gmail-messages'] });
      // O `mark-read` responde 207 com `success: false` e `failed_ids` quando o
      // Gmail aceita só parte dos ids (supabase/functions/gmail-send/index.ts:305).
      // O FunctionsClient trata 2xx — inclusive 207 — como sucesso e devolve
      // `error: null`: o payload de domínio é a única fonte da verdade, igual ao
      // 207 do sync-inbox.
      const failedIds = Array.isArray(data?.failed_ids) ? (data.failed_ids as string[]) : [];
      if (failedIds.length === 0) return;
      // A lista é reconsultada (acima), então as mensagens que o Gmail recusou
      // continuam não lidas; o aviso refaz só o que ficou pendente.
      toast.warning('Não foi possível marcar como lida', {
        description: `${failedIds.length} de ${messageIds.length} mensagem(ns) não foram marcadas como lidas.`,
        action: { label: 'Tentar de novo', onClick: () => markAsRead.mutate(failedIds) },
      });
    },
    onError: (error: Error) => notifyGmailActionError('marcar como lida', error),
  });

  const trashMessage = useMutation({
    mutationFn: async (messageId: string) => {
      if (!activeAccount) throw new Error('No active Gmail account');
      return callGmailFunction('gmail-send', { action: 'trash', account_id: activeAccount.id, message_id: messageId });
    },
    onSuccess: () => { invalidateThreadData(); toast.success('Email movido para lixeira'); },
    onError: (error: Error) => notifyGmailActionError('mover o e-mail para a lixeira', error),
  });

  const trashThread = useMutation({
    mutationFn: async (gmailThreadId: string) => {
      if (!activeAccount) throw new Error('No active Gmail account');
      return callGmailFunction('gmail-send', { action: 'trash-thread', account_id: activeAccount.id, thread_id: gmailThreadId });
    },
    onSuccess: () => { invalidateThreadData(); toast.success('Thread movida para lixeira'); },
    onError: (error: Error) => notifyGmailActionError('mover a conversa para a lixeira', error),
  });

  const modifyLabels = useMutation({
    mutationFn: async (params: { message_id: string; add_labels?: string[]; remove_labels?: string[] }) => {
      if (!activeAccount) throw new Error('No active Gmail account');
      return callGmailFunction('gmail-send', { action: 'modify-labels', account_id: activeAccount.id, ...params });
    },
    onSuccess: () => { invalidateThreadData(); queryClient.invalidateQueries({ queryKey: ['gmail-messages'] }); },
    onError: (error: Error) => notifyGmailActionError('atualizar os marcadores da mensagem', error),
  });

  const modifyThreadLabels = useMutation({
    mutationFn: async (params: { thread_id: string; add_labels?: string[]; remove_labels?: string[] }) => {
      if (!activeAccount) throw new Error('No active Gmail account');
      return callGmailFunction('gmail-send', { action: 'modify-thread-labels', account_id: activeAccount.id, ...params });
    },
    onSuccess: () => {
      invalidateThreadData();
      queryClient.invalidateQueries({ queryKey: ['gmail-messages'] });
    },
    onError: (error: Error) => toast.error(`Não foi possível atualizar a conversa: ${error.message}`),
  });

  const saveDraft = useMutation({
    mutationFn: async (params: { draft_id?: string; thread_id?: string; to?: string | string[]; subject?: string; text_body?: string; html_body?: string; cc?: string[]; bcc?: string[]; attachments?: Array<{ filename: string; mimeType: string; content: string }> }) => {
      if (!activeAccount) throw new Error('No active Gmail account');
      return callGmailFunction('gmail-send', { action: params.draft_id ? 'update-draft' : 'create-draft', account_id: activeAccount.id, ...params });
    },
    onError: (error: Error) => notifyGmailActionError('salvar o rascunho', error),
  });

  const deleteDraft = useMutation({
    mutationFn: async (draftId: string) => {
      if (!activeAccount) throw new Error('No active Gmail account');
      return callGmailFunction('gmail-send', { action: 'delete-draft', account_id: activeAccount.id, draft_id: draftId });
    },
    onError: (error: Error) => notifyGmailActionError('apagar o rascunho', error),
  });

  const getAttachmentContent = useCallback(async (attachment: EmailAttachment & { gmail_message_id: string }) => {
      if (!activeAccount) throw new Error('No active Gmail account');
      const response = await callGmailFunction('gmail-sync', {
        action: 'get-attachment', account_id: activeAccount.id,
        message_id: attachment.gmail_message_id, attachment_id: attachment.gmail_attachment_id,
      });
      return normalizeEmailBase64(response.data as string);
  }, [activeAccount]);

  const downloadAttachment = useMutation({
    mutationFn: async (attachment: EmailAttachment & { gmail_message_id: string }) => {
      // Y29 / SEC-SAIDAS_DE_INFORMACAO-01 — sem permissão o conteúdo do anexo
      // nem é buscado: o gate vem ANTES da requisição e nada é gravado.
      if (!canDownload) {
        notifyDownloadBlocked();
        return null;
      }
      const data = await getAttachmentContent(attachment);
      return { attachment, data };
    },
    onSuccess: (result) => {
      if (!result) return;
      const { attachment, data } = result;
      const binary = atob(data);
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      downloadFileWithPermission(
        new Blob([bytes], { type: attachment.mime_type || 'application/octet-stream' }),
        attachment.filename || 'anexo',
        { canDownload },
      );
    },
    onError: (error: Error) => toast.error(`Não foi possível baixar o anexo: ${error.message}`),
  });

  const subscribeToThreads = useCallback(() => {
    if (!activeAccount) return () => {};
    const channel = supabase.channel('gmail-threads-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'email_threads', filter: `gmail_account_id=eq.${activeAccount.id}` }, invalidateThreadData)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'email_messages', filter: `gmail_account_id=eq.${activeAccount.id}` }, () => { queryClient.invalidateQueries({ queryKey: ['gmail-messages'] }); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeAccount, invalidateThreadData, queryClient]);

  return {
    accounts, activeAccount, accountsLoading, accountsError, refetchAccounts, connectGmail, exchangeCode, disconnectGmail,
    // PE-06: estado de sincronização da conta ativa, sem obrigar a tela a reler a linha crua.
    syncStatus, lastError, lastSyncedAt, lastSyncLabel, needsReconnect,
    threads, threadsLoading, threadsError, requestedThread, requestedThreadLoading, requestedThreadError, selectedThreadId, setSelectedThreadId, refetchThreads,
    threadMessages, messagesLoading, messagesError, refetchMessages, threadAttachments, labels, labelsManagement,
    syncInbox, syncLabels, sendEmail, replyEmail, markAsRead, trashMessage, trashThread, modifyLabels, modifyThreadLabels, saveDraft, deleteDraft, downloadAttachment, getAttachmentContent,
    subscribeToThreads,
    threadsTotalCount: threadPage.total ?? threads.length,
    threadsPageCount: emailThreadPageCount(threadPage.total),
    unreadCount: exactThreadCounts?.unread ?? threads.filter(t => t.is_unread).length,
    starredCount: threads.filter(t => t.is_starred).length,
  };
}
