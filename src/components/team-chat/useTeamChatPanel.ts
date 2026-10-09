import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { getLogger } from '@/lib/logger';
import { useAuth } from '@/hooks/auth/useAuth';
import { useTextToSpeech } from '@/hooks/communication/useTextToSpeech';
import { useUserSettings } from '@/hooks/system/useUserSettings';
import { useSendTeamMessage, useDeleteTeamMessage, useEditTeamMessage, useToggleMuteConversation, TeamMessage, TeamConversation } from '@/hooks/chat/useTeamChat';
import { useRenameConversation, useRemoveConversationMember, useLeaveConversation, useDeleteConversation } from '@/hooks/team-chat/useTeamChatMutations';
import { useTeamMessages } from '@/hooks/team-chat/useTeamMessages';
import { useTeamMessageReactions } from '@/hooks/team-chat/useTeamMessageReactions';
// eslint-disable-next-line no-restricted-imports
import { supabase } from '@/integrations/supabase/client';
import { uploadTeamMedia, TEAM_CHAT_FILES_BUCKET } from '@/hooks/team-chat/uploadTeamMedia';
import { toast } from 'sonner';

const log = getLogger('TeamChatPanel');

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useTeamChatPanel(conversation: TeamConversation) {
  const { profile } = useAuth();
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<TeamMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [showGroupManagement, setShowGroupManagement] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [olderMessages, setOlderMessages] = useState<TeamMessage[]>([]);
  const [oldestCursor, setOldestCursor] = useState<{ createdAt: string; id: string } | null>(null);
  const [hasOlderMessages, setHasOlderMessages] = useState(true);
  const [isFetchingOlder, setIsFetchingOlder] = useState(false);

  // Rascunho e resposta são da conversa: o painel não remonta ao trocar de
  // conversa, então o reset acontece no render (mesmo padrão de
  // useFilesViewState). Sem isso o texto de uma conversa aparece na outra e o
  // autosave do rascunho grava na chave errada — idem para o reply_to.
  const [conversationScopeId, setConversationScopeId] = useState(conversation.id);
  if (conversationScopeId !== conversation.id) {
    setConversationScopeId(conversation.id);
    setText('');
    setReplyTo(null);
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isNearBottomRef = useRef(true);
  const savedScrollFromBottomRef = useRef<number | null>(null);

  const { messages: newestMessages, isLoading } = useTeamMessages(conversation.id);
  const sendMutation = useSendTeamMessage();
  const deleteMutation = useDeleteTeamMessage();
  const editMutation = useEditTeamMessage();
  const muteMutation = useToggleMuteConversation();
  const renameConvMutation = useRenameConversation();
  const removeMemberMutation = useRemoveConversationMember();
  const leaveMutation = useLeaveConversation();
  const deleteConvMutation = useDeleteConversation();
  const reactions = useTeamMessageReactions(conversation.id);

  const { settings, isLoading: settingsLoading } = useUserSettings();
  // TC-007: a fonte única do mute é a membership (`team_conversation_members.is_muted`) —
  // exatamente onde `useToggleMuteConversation` grava. Antes a leitura vinha de
  // `user_settings.muted_conversations`, então o estado exibido não refletia o banco.
  const isMuted = useMemo(() => {
    const me = conversation.members?.find(m => m.profile_id === profile?.id);
    return !!me?.is_muted;
  }, [conversation.members, profile?.id]);

  const canTransfer = useMemo(() => {
    const r = (profile as { role?: string } | null)?.role;
    return r === 'admin' || r === 'supervisor';
  }, [profile]);

  const isGroupCreator = useMemo(() => {
    return !!(profile?.id && conversation.created_by === profile.id);
  }, [profile, conversation.created_by]);

  const ttsOptions = useMemo(() => ({
    initialVoiceId: settingsLoading ? undefined : settings.tts_voice_id,
    initialSpeed: settingsLoading ? undefined : settings.tts_speed,
  }), [settingsLoading, settings.tts_voice_id, settings.tts_speed]);

  const tts = useTextToSpeech(ttsOptions);

  const handleVoiceChange = useCallback((newVoiceId: string) => {
    tts.setVoiceId(newVoiceId);
    if (!profile?.id) return;
    void supabase.from('user_settings').upsert(
      { user_id: profile.id, tts_voice_id: newVoiceId },
      { onConflict: 'user_id' },
    );
  }, [tts, profile]);

  const handleSpeedChange = useCallback((newSpeed: number) => {
    tts.setSpeed(newSpeed);
    if (!profile?.id) return;
    void supabase.from('user_settings').upsert(
      { user_id: profile.id, tts_speed: newSpeed },
      { onConflict: 'user_id' },
    );
  }, [tts, profile]);

  const messages = useMemo(() => {
    const ids = new Set<string>();
    const combined: TeamMessage[] = [];
    for (const m of [...olderMessages, ...newestMessages]) {
      if (!ids.has(m.id)) { ids.add(m.id); combined.push(m); }
    }
    return combined;
  }, [olderMessages, newestMessages]);

  // TC-006 — o reset por conversa roda ANTES do init do cursor: se rodasse
  // depois (como estava), o `setOldestCursor(null)` do reset apagava o cursor
  // que o efeito de init tinha acabado de gravar (ambos disparam no mesmo
  // commit de montagem/troca), e a paginação nunca começava — as mensagens
  // antigas ficavam inalcançáveis.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOlderMessages([]);
    setOldestCursor(null);
    setHasOlderMessages(true);
    setShowStats(false);
    setShowTransferDialog(false);
    setShowGroupManagement(false);
  }, [conversation.id]);

  useEffect(() => {
    if (newestMessages.length > 0 && oldestCursor === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOldestCursor({ createdAt: newestMessages[0].created_at, id: newestMessages[0].id });
    }
  }, [newestMessages, oldestCursor]);


  useEffect(() => {
    if (savedScrollFromBottomRef.current === null) return;
    const delta = savedScrollFromBottomRef.current;
    savedScrollFromBottomRef.current = null;
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight - delta;
    });
  }, [olderMessages.length]);

  const fetchOlderMessages = useCallback(async () => {
    if (isFetchingOlder || !hasOlderMessages || !oldestCursor) return;
    const el = scrollRef.current;
    if (el) savedScrollFromBottomRef.current = el.scrollHeight - el.scrollTop;
    setIsFetchingOlder(true);
    try {
      // TC-006 — keyset composto `(created_at, id)`. Só `created_at` pulava as
      // mensagens que empatam no mesmo instante: o lote seguinte trazia
      // `created_at < cursor` e as empatadas com o instante do cursor ficavam
      // de fora. O `id` desempata de forma estável e casa com o
      // `order by created_at desc, id desc` das consultas. As aspas no
      // timestamptz são obrigatórias (o valor serializado traz ':' e '+', que o
      // parser de filtro do PostgREST leria como separadores) — mesmo padrão de
      // `useCSAT`.
      const ts = `"${oldestCursor.createdAt}"`;
      const { data, error } = await supabase
        .from('team_messages')
        .select('*, sender:profiles!team_messages_sender_id_fkey(id, name, avatar_url), media_bucket, media_path, status')
        .eq('conversation_id', conversation.id)
        .or(`created_at.lt.${ts},and(created_at.eq.${ts},id.lt.${oldestCursor.id})`)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(60);
      if (error) throw error;
      const older = ((data || []) as TeamMessage[]).reverse();
      if (older.length === 0) {
        setHasOlderMessages(false);
      } else {
        setOldestCursor({ createdAt: older[0].created_at, id: older[0].id });
        setOlderMessages(prev => {
          const ids = new Set(prev.map(m => m.id));
          return [...older.filter(m => !ids.has(m.id)), ...prev];
        });
      }
    } catch (err) {
      log.error('Erro ao carregar mensagens anteriores', err);
    } finally {
      setIsFetchingOlder(false);
    }
  }, [isFetchingOlder, hasOlderMessages, oldestCursor, conversation.id]);

  const debouncedSearchQuery = useDebounce(searchQuery, 400);

  // SL-082 (F69) — a busca filtrava SÓ o que já estava carregado (as mensagens
  // mais novas + as páginas abertas): um termo que existia numa mensagem antiga
  // nunca era achado, e o contador contava só o subconjunto local. Agora o termo
  // vai ao servidor pela RPC `search_team_messages` (que varre a conversa
  // inteira) e a lista exibida durante a busca é o resultado dela.
  const searchTerm = debouncedSearchQuery.trim();
  // O recorte salvo carrega a CONVERSA a que pertence, não só o termo: o painel é
  // o MESMO componente quando o atendente troca de conversa (não tem `key`) e o
  // termo digitado continua, então um registro só vale para a tela se a conversa
  // e o termo atuais forem os que o produziram.
  const [serverSearch, setServerSearch] = useState<{ conversationId: string; term: string; results: TeamMessage[] } | null>(null);
  // SL-082 (refazer) — a falha da RPC ficava guardada como `results: []`, ou seja,
  // o mesmo estado de "a busca não achou nada": a tela anunciava "Nenhuma
  // mensagem encontrada" quando na verdade o servidor falhou. O erro é um estado
  // SEPARADO (e preso ao termo que o produziu), para a tela poder dizer a verdade.
  // A falha também é presa à conversa que a produziu: com o mesmo termo digitado,
  // a falha da conversa A não pode aparecer na conversa B enquanto a busca de B
  // ainda está em voo.
  const [serverSearchError, setServerSearchError] = useState<{ conversationId: string; term: string; message: string } | null>(null);

  useEffect(() => {
    if (!searchTerm) return;
    // A conversa da requisição é lida aqui, ao disparar: é ela, junto com o termo,
    // que diz se a resposta ainda interessa ao que está na tela.
    const conversationId = conversation.id;
    let cancelado = false;
    void (async () => {
      const { data, error } = await supabase.rpc('search_team_messages', {
        p_conversation_id: conversationId,
        p_query: searchTerm,
        p_limit: 50,
      });
      if (cancelado) return;
      if (error) {
        log.error('Erro ao buscar mensagens no servidor', error);
        // Nada de `results: []` aqui: lista vazia é resultado de busca legítimo,
        // falha do servidor não. Limpar o resultado anterior evita que ele seja
        // exibido como se fosse a resposta deste termo.
        setServerSearch(null);
        setServerSearchError({ conversationId, term: searchTerm, message: 'Não foi possível buscar as mensagens. Tente novamente.' });
        return;
      }
      // Busca que deu certo limpa o erro anterior: o painel é o MESMO componente
      // quando o atendente troca de conversa (o termo digitado continua), então o
      // aviso de falha não pode ficar na tela por cima do resultado que chegou.
      setServerSearchError(null);
      // A RPC devolve o recorte de busca (id, remetente, conteúdo, data): o
      // TeamMessageItem compõe a linha a partir daqui, sem mídia/recibo — a
      // mensagem de resultado é texto puro.
      const rows = (data ?? []) as {
        id: string; sender_id: string; content: string; created_at: string; sender_name: string | null;
      }[];
      setServerSearch({
        conversationId,
        term: searchTerm,
        results: rows.map(row => ({
          id: row.id,
          conversation_id: conversationId,
          sender_id: row.sender_id,
          content: row.content,
          message_type: 'text',
          media_url: null,
          media_type: null,
          reply_to_id: null,
          is_edited: false,
          status: null,
          created_at: row.created_at,
          updated_at: row.created_at,
          sender: { id: row.sender_id, name: row.sender_name ?? 'Usuário', avatar_url: null },
        })),
      });
    })();
    return () => { cancelado = true; };
  }, [searchTerm, conversation.id]);

  const searchActive = searchTerm.length > 0;
  // `isSearching` separa "buscando" de "nada encontrado" na tela: mostrar
  // "Nenhuma mensagem encontrada" enquanto a resposta ainda está em voo é
  // anunciar um resultado que ainda não existe.
  // A falha do servidor tem precedência: com erro não se está mais "buscando" (a
  // resposta chegou) e o que a tela mostra é a falha, não um resultado.
  // Registro de OUTRA conversa (ou de outro termo) não vale para o que está na
  // tela: com o mesmo termo digitado, o aviso e os resultados que a busca da
  // conversa anterior deixou não podem aparecer na conversa atual enquanto a
  // busca dela ainda está pendente.
  const serverSearchMatches = serverSearch?.conversationId === conversation.id
    && serverSearch?.term === searchTerm;
  const searchError = searchActive
    && serverSearchError?.conversationId === conversation.id
    && serverSearchError.term === searchTerm
    ? serverSearchError.message
    : null;
  const isSearching = searchActive && !searchError && !serverSearchMatches;

  const filteredMessages = useMemo(() => {
    if (!searchActive) return messages;
    if (!serverSearchMatches || !serverSearch) return [];
    return serverSearch.results;
  }, [messages, searchActive, serverSearchMatches, serverSearch]);

  const checkNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    isNearBottomRef.current = nearBottom;
    setShowScrollDown(!nearBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setShowScrollDown(false);
    }
  }, []);

  const handleSend = useCallback(async () => {
    const content = text.trim();
    if (!content || !profile?.id) return;
    setText('');
    const reply = replyTo;
    setReplyTo(null);
    try {
      await sendMutation.mutateAsync({
        conversationId: conversation.id,
        content,
        replyToId: reply?.id,
      });
    } catch (err) {
      log.error('Erro ao enviar mensagem', err);
      toast.error('Erro ao enviar mensagem');
      // TC-010: o campo era limpo ANTES do await e nada voltava no erro — uma
      // falha de rede/RLS apagava o rascunho e a resposta sem recuperação.
      // Devolve o que foi enviado, mas nunca sobrescreve o que o usuário já
      // digitou enquanto o envio estava em voo (só restaura se ainda vazio).
      setText(prev => (prev.length === 0 ? content : prev));
      setReplyTo(prev => (prev === null ? reply : prev));
    }
  }, [text, profile, replyTo, conversation.id, sendMutation]);

  const handleDelete = useCallback(async (messageId: string) => {
    try {
      await deleteMutation.mutateAsync({ messageId, conversationId: conversation.id });
    } catch (err) {
      log.error('Erro ao excluir mensagem', err);
      toast.error('Erro ao excluir');
    }
  }, [deleteMutation, conversation.id]);

  const handleStartEdit = useCallback((msg: TeamMessage) => {
    setEditingId(msg.id);
    setEditText(msg.content ?? '');
  }, []);

  const handleSaveEdit = useCallback(async () => {
    const trimmed = editText.trim();
    if (!editingId || !trimmed) return;
    try {
      await editMutation.mutateAsync({ messageId: editingId, content: trimmed, conversationId: conversation.id });
      setEditingId(null);
      setEditText('');
    } catch (err) {
      log.error('Erro ao editar mensagem', err);
      toast.error('Erro ao editar');
    }
  }, [editingId, editText, editMutation, conversation.id]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditText('');
  }, []);

  const handleCopyMessage = useCallback((content: string) => {
    void navigator.clipboard.writeText(content).then(() => toast.success('Copiado!'));
  }, []);

  // SL-082 (F71) — o `GroupManagementDialog` existia pronto com as mutações
  // (renomear/remover membro/sair/excluir) criadas no hook, mas NENHUM chamador:
  // o fluxo de gerenciar grupo era inalcançável pela tela. Estes handlers são o
  // que o Dialog chama. O sucesso/erro já é anunciado pela própria mutação
  // (`onSuccess`/`onError`), então aqui só registramos a falha no log — nada de
  // "sucesso" antes da confirmação.
  const handleRenameGroup = useCallback(async (name: string) => {
    try {
      await renameConvMutation.mutateAsync({ conversationId: conversation.id, name });
    } catch (err) {
      log.error('Erro ao renomear grupo', err);
    }
  }, [renameConvMutation, conversation.id]);

  const handleRemoveMember = useCallback(async (profileId: string) => {
    try {
      await removeMemberMutation.mutateAsync({ conversationId: conversation.id, profileId });
    } catch (err) {
      log.error('Erro ao remover membro do grupo', err);
    }
  }, [removeMemberMutation, conversation.id]);

  const handleLeaveGroup = useCallback(async () => {
    try {
      await leaveMutation.mutateAsync({ conversationId: conversation.id });
    } catch (err) {
      log.error('Erro ao sair do grupo', err);
    }
  }, [leaveMutation, conversation.id]);

  const handleDeleteGroup = useCallback(async () => {
    try {
      await deleteConvMutation.mutateAsync({ conversationId: conversation.id });
    } catch (err) {
      log.error('Erro ao excluir grupo', err);
    }
  }, [deleteConvMutation, conversation.id]);

  // R2-INB-058 (#350-B): o chamador precisa saber se o áudio foi enviado.
  // `undefined` era lido como sucesso pelo TextToAudioButton, que descartava a
  // prévia. Agora todo caminho devolve boolean: true SÓ após a mutação confirmar.
  const handleAudioSend = useCallback(async (blob: Blob): Promise<boolean> => {
    if (!profile?.id) return false;
    try {
      const locator = await uploadTeamMedia({
        profileId: profile.id,
        conversationId: conversation.id,
        file: blob,
        extension: 'webm',
        contentType: 'audio/webm',
        upsert: false,
      });
      if (!locator) return false;
      await sendMutation.mutateAsync({
        conversationId: conversation.id,
        content: '🎤 Mensagem de áudio',
        mediaPath: locator.mediaPath,
        mediaBucket: locator.mediaBucket,
        mediaType: 'audio',
      });
      return true;
    } catch (err) {
      log.error('Erro ao enviar áudio', err);
      toast.error('Erro ao enviar áudio');
      return false;
    }
  }, [profile, conversation.id, sendMutation]);

  const handleFileSent = useCallback(async (mediaPath: string, mediaType: string, fileName: string) => {
    if (!profile?.id) return;
    await sendMutation.mutateAsync({
      conversationId: conversation.id,
      content: fileName,
      mediaBucket: TEAM_CHAT_FILES_BUCKET,
      mediaPath,
      mediaType: (mediaType as TeamMessage['media_type']) ?? undefined,
    });
  }, [profile, conversation.id, sendMutation]);

  const handleSendSticker = useCallback(async (url: string) => {
    if (!profile?.id) return;
    await sendMutation.mutateAsync({
      conversationId: conversation.id,
      content: '🎨 Figurinha',
      mediaUrl: url,
      mediaType: 'sticker',
    });
  }, [profile, conversation.id, sendMutation]);

  const handleSendAudioMeme = useCallback(async (url: string) => {
    if (!profile?.id) return;
    await sendMutation.mutateAsync({
      conversationId: conversation.id,
      content: '🎵 Áudio meme',
      mediaUrl: url,
      mediaType: 'audio_meme',
    });
  }, [profile, conversation.id, sendMutation]);

  const handleSendCustomEmoji = useCallback(async (url: string) => {
    if (!profile?.id) return;
    await sendMutation.mutateAsync({
      conversationId: conversation.id,
      content: '😀 Emoji',
      mediaUrl: url,
      mediaType: 'emoji',
    });
  }, [profile, conversation.id, sendMutation]);

  return {
    profile,
    messages,
    filteredMessages,
    isSearching,
    searchError,
    isLoading,
    isMuted,
    canTransfer,
    isGroupCreator,
    isFetchingOlder,
    hasOlderMessages,
    fetchOlderMessages,
    showStats,
    setShowStats,
    showTransferDialog,
    setShowTransferDialog,
    showGroupManagement,
    setShowGroupManagement,
    text,
    setText,
    replyTo,
    setReplyTo,
    editingId,
    editText,
    setEditText,
    showSearch,
    setShowSearch,
    searchQuery,
    setSearchQuery,
    showAddMembers,
    setShowAddMembers,
    isRecordingAudio,
    setIsRecordingAudio,
    showScrollDown,
    scrollRef,
    searchInputRef,
    isNearBottomRef,
    checkNearBottom,
    scrollToBottom,
    handleSend,
    handleDelete,
    handleStartEdit,
    handleSaveEdit,
    handleCancelEdit,
    handleCopyMessage,
    handleRenameGroup,
    handleRemoveMember,
    handleLeaveGroup,
    handleDeleteGroup,
    handleAudioSend,
    handleFileSent,
    handleSendSticker,
    handleSendAudioMeme,
    handleSendCustomEmoji,
    handleVoiceChange,
    handleSpeedChange,
    sendMutation,
    muteMutation,
    renameConvMutation,
    removeMemberMutation,
    leaveMutation,
    deleteConvMutation,
    tts,
    reactions,
  };
}
