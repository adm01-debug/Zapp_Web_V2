import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { createGmailOAuthState, storeGmailOAuthReturnContext } from '@/lib/gmailOAuth';
import { callGmailFunction } from '../gmail/gmailApi';
import { RESERVED_HASHES } from '@/hooks/system/useNavigationHistory';
import { normalizeEmailBase64 } from '@/lib/emailAttachments';

// Re-export types
export type { GmailAccount, EmailThread, EmailMessage, EmailAttachment, EmailLabel } from '../gmail/gmailTypes';
import type { GmailAccount, EmailThread, EmailMessage, EmailAttachment, EmailLabel } from '../gmail/gmailTypes';

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

export function useGmail(accountId?: string, requestedThreadId?: string | null) {
  const queryClient = useQueryClient();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

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
          id: a.id, email_address: a.email_address, is_active: a.is_active,
          sync_status: a.sync_status || 'pending', last_sync_at: a.last_sync_at,
          last_error: a.last_error ?? null, created_at: a.created_at,
        })) as GmailAccount[];
      }
    },
  });

  const activeAccount = accountId ? accounts.find(a => a.id === accountId && a.is_active) : accounts.find(a => a.is_active);

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
    mutationFn: async (code: string) => callGmailFunction('gmail-oauth', { action: 'exchange-code', code }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['gmail-accounts'] }); toast.success('Gmail conectado com sucesso!'); },
    onError: (error: Error) => { toast.error(`Erro na autenticação: ${error.message}`); },
  });

  const disconnectGmail = useMutation({
    mutationFn: async (accId: string) => callGmailFunction('gmail-oauth', { action: 'disconnect', account_id: accId }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['gmail-accounts'] }); queryClient.invalidateQueries({ queryKey: ['gmail-threads'] }); toast.success('Gmail desconectado'); },
  });

  const { data: threads = [], isLoading: threadsLoading, error: threadsError, refetch: refetchThreads } = useQuery({
    queryKey: ['gmail-threads', activeAccount?.id],
    queryFn: async () => {
      if (!activeAccount) return [];
      const { data, error } = await supabase.from('email_threads').select('*, contact:contacts(id, name, email, avatar_url)').eq('gmail_account_id', activeAccount.id).order('last_message_at', { ascending: false }).order('id', { ascending: false }).range(0, 999);
      if (error) throw error;
      const rows = (data || []) as EmailThread[];
      if (rows.length === 0) return rows;
      const { data: attachmentRows, error: attachmentError } = await supabase
        .from('email_messages')
        .select('thread_id')
        .eq('gmail_account_id', activeAccount.id)
        .eq('has_attachments', true)
        .in('thread_id', rows.map(row => row.id));
      if (attachmentError) throw attachmentError;
      const withAttachments = new Set((attachmentRows || []).map(row => row.thread_id));
      return rows.map(row => ({ ...row, has_attachments: withAttachments.has(row.id) }));
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
        .select('*, contact:contacts(id, name, email, avatar_url)')
        .eq('gmail_account_id', activeAccount.id)
        .eq('id', requestedThreadId)
        .maybeSingle();
      if (error) throw error;
      return (data as EmailThread | null) ?? null;
    },
    enabled: !!activeAccount && !!requestedThreadId,
  });

  const { data: threadMessages = [], isLoading: messagesLoading, error: messagesError } = useQuery({
    queryKey: ['gmail-messages', activeAccount?.id, selectedThreadId],
    queryFn: async () => {
      if (!selectedThreadId || !activeAccount) return [];
      const { data, error } = await supabase.from('email_messages').select('*').eq('gmail_account_id', activeAccount.id).eq('thread_id', selectedThreadId).order('internal_date', { ascending: true });
      if (error) throw error;
      return (data || []) as EmailMessage[];
    },
    enabled: !!selectedThreadId && !!activeAccount,
  });

  const { data: threadAttachments = [] } = useQuery({
    queryKey: ['gmail-attachments', activeAccount?.id, selectedThreadId, threadMessages.map(message => message.id).join(':')],
    queryFn: async () => {
      if (!activeAccount || threadMessages.length === 0) return [];
      const { data, error } = await supabase.from('email_attachments').select('*').in('email_message_id', threadMessages.map(message => message.id));
      if (error) throw error;
      return (data || []) as EmailAttachment[];
    },
    enabled: !!activeAccount && threadMessages.length > 0,
  });

  const { data: labels = [] } = useQuery({
    queryKey: ['gmail-labels', activeAccount?.id],
    queryFn: async () => {
      if (!activeAccount) return [];
      const { data, error } = await supabase.from('email_labels').select('*').eq('gmail_account_id', activeAccount.id).order('name');
      if (error) throw error;
      return (data || []) as EmailLabel[];
    },
    enabled: !!activeAccount,
  });

  const syncInbox = useMutation({
    mutationFn: async (options?: { query?: string; maxResults?: number }) => {
      if (!activeAccount) throw new Error('No active Gmail account');
      return callGmailFunction('gmail-sync', { action: 'sync-inbox', account_id: activeAccount.id, ...options });
    },
    retry: 1,
    onSuccess: (data) => { queryClient.invalidateQueries({ queryKey: ['gmail-threads'] }); queryClient.invalidateQueries({ queryKey: ['gmail-labels'] }); toast.success(`${data.synced} emails sincronizados`); },
    onError: (error: Error) => { toast.error(`Erro ao sincronizar: ${error.message}`); },
  });

  const syncLabels = useMutation({
    mutationFn: async () => {
      if (!activeAccount) throw new Error('No active Gmail account');
      return callGmailFunction('gmail-sync', { action: 'sync-labels', account_id: activeAccount.id });
    },
    retry: 1,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['gmail-labels'] }); },
  });

  const sendEmail = useMutation({
    mutationFn: async (params: { to: string | string[]; subject: string; text_body?: string; html_body?: string; cc?: string[]; bcc?: string[]; attachments?: Array<{ filename: string; mimeType: string; content: string }> }) => {
      if (!activeAccount) throw new Error('No active Gmail account');
      return callGmailFunction('gmail-send', { action: 'send', account_id: activeAccount.id, ...params });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['gmail-threads'] }); toast.success('Email enviado com sucesso!'); },
    onError: (error: Error) => { toast.error(`Erro ao enviar: ${error.message}`); },
  });

  const replyEmail = useMutation({
    mutationFn: async (params: { thread_id: string; message_id: string; to: string | string[]; subject?: string; text_body?: string; html_body?: string; cc?: string[]; bcc?: string[]; attachments?: Array<{ filename: string; mimeType: string; content: string }> }) => {
      if (!activeAccount) throw new Error('No active Gmail account');
      return callGmailFunction('gmail-send', { action: 'reply', account_id: activeAccount.id, ...params });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['gmail-threads'] }); queryClient.invalidateQueries({ queryKey: ['gmail-messages'] }); toast.success('Resposta enviada!'); },
    onError: (error: Error) => { toast.error(`Erro ao responder: ${error.message}`); },
  });

  const markAsRead = useMutation({
    mutationFn: async (messageIds: string[]) => {
      if (!activeAccount) throw new Error('No active Gmail account');
      return callGmailFunction('gmail-send', { action: 'mark-read', account_id: activeAccount.id, message_ids: messageIds });
    },
    retry: 1,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['gmail-threads'] }); queryClient.invalidateQueries({ queryKey: ['gmail-messages'] }); },
  });

  const trashMessage = useMutation({
    mutationFn: async (messageId: string) => {
      if (!activeAccount) throw new Error('No active Gmail account');
      return callGmailFunction('gmail-send', { action: 'trash', account_id: activeAccount.id, message_id: messageId });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['gmail-threads'] }); toast.success('Email movido para lixeira'); },
  });

  const trashThread = useMutation({
    mutationFn: async (gmailThreadId: string) => {
      if (!activeAccount) throw new Error('No active Gmail account');
      return callGmailFunction('gmail-send', { action: 'trash-thread', account_id: activeAccount.id, thread_id: gmailThreadId });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['gmail-threads'] }); toast.success('Thread movida para lixeira'); },
  });

  const modifyLabels = useMutation({
    mutationFn: async (params: { message_id: string; add_labels?: string[]; remove_labels?: string[] }) => {
      if (!activeAccount) throw new Error('No active Gmail account');
      return callGmailFunction('gmail-send', { action: 'modify-labels', account_id: activeAccount.id, ...params });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['gmail-threads'] }); queryClient.invalidateQueries({ queryKey: ['gmail-messages'] }); },
  });

  const modifyThreadLabels = useMutation({
    mutationFn: async (params: { thread_id: string; add_labels?: string[]; remove_labels?: string[] }) => {
      if (!activeAccount) throw new Error('No active Gmail account');
      return callGmailFunction('gmail-send', { action: 'modify-thread-labels', account_id: activeAccount.id, ...params });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gmail-threads'] });
      queryClient.invalidateQueries({ queryKey: ['gmail-messages'] });
    },
    onError: (error: Error) => toast.error(`Não foi possível atualizar a conversa: ${error.message}`),
  });

  const saveDraft = useMutation({
    mutationFn: async (params: { draft_id?: string; thread_id?: string; to?: string | string[]; subject?: string; text_body?: string; html_body?: string; cc?: string[]; bcc?: string[]; attachments?: Array<{ filename: string; mimeType: string; content: string }> }) => {
      if (!activeAccount) throw new Error('No active Gmail account');
      return callGmailFunction('gmail-send', { action: params.draft_id ? 'update-draft' : 'create-draft', account_id: activeAccount.id, ...params });
    },
  });

  const deleteDraft = useMutation({
    mutationFn: async (draftId: string) => {
      if (!activeAccount) throw new Error('No active Gmail account');
      return callGmailFunction('gmail-send', { action: 'delete-draft', account_id: activeAccount.id, draft_id: draftId });
    },
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
      const data = await getAttachmentContent(attachment);
      return { attachment, data };
    },
    onSuccess: ({ attachment, data }) => {
      const binary = atob(data);
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: attachment.mime_type || 'application/octet-stream' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.filename || 'anexo';
      link.click();
      URL.revokeObjectURL(url);
    },
    onError: (error: Error) => toast.error(`Não foi possível baixar o anexo: ${error.message}`),
  });

  const subscribeToThreads = useCallback(() => {
    if (!activeAccount) return () => {};
    const channel = supabase.channel('gmail-threads-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'email_threads', filter: `gmail_account_id=eq.${activeAccount.id}` }, () => { queryClient.invalidateQueries({ queryKey: ['gmail-threads'] }); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'email_messages', filter: `gmail_account_id=eq.${activeAccount.id}` }, () => { queryClient.invalidateQueries({ queryKey: ['gmail-messages'] }); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeAccount, queryClient]);

  return {
    accounts, activeAccount, accountsLoading, accountsError, refetchAccounts, connectGmail, exchangeCode, disconnectGmail,
    threads, threadsLoading, threadsError, requestedThread, requestedThreadLoading, requestedThreadError, selectedThreadId, setSelectedThreadId, refetchThreads,
    threadMessages, messagesLoading, messagesError, threadAttachments, labels,
    syncInbox, syncLabels, sendEmail, replyEmail, markAsRead, trashMessage, trashThread, modifyLabels, modifyThreadLabels, saveDraft, deleteDraft, downloadAttachment, getAttachmentContent,
    subscribeToThreads,
    unreadCount: threads.filter(t => t.is_unread).length,
    starredCount: threads.filter(t => t.is_starred).length,
  };
}
