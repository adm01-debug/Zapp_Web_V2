import { useState, useRef, useEffect, useCallback } from 'react';
import { log } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { undoToast } from '@/lib/undoToast';
import { normalizeOperationalPriority } from '@/lib/ai-vocabulary';
import { Message, InteractiveMessage, InteractiveButton, LocationMessage } from '@/types/chat';
import { SlashCommand } from '../SlashCommands';
import { toast } from '@/hooks/ui/use-toast';
import { sendOutboundMessage } from '@/services/outbound-message.service';
import { useConversationActions } from '@/hooks/chat/useConversationActions';
import { useMyWorkItems, tomorrowAtNine } from '@/hooks/tasks/useMyWorkItems';
import { navigateToView } from '@/hooks/system/useNavigationHistory';

interface UseChatPanelHandlersOptions {
  conversationId: string;
  contactId: string;
  contactPhone: string;
  instanceName?: string;
  onSendMessage: (content: string, replyToId?: string | null) => Promise<void> | void;
  editMessageApi: (instance: string, params: { number: string; messageId: string; text: string }) => Promise<unknown>;
  applySignature: (text: string) => string;
  handleTypingStart: () => void;
  handleTypingStop: () => void;
  openDialog: (key: string) => void;
  closeDialog: (key: string) => void;
  handleSetActiveTool: (tool: 'chatSearch' | 'objections' | 'university' | 'aiAssistant' | 'summary' | null) => void;
}

/**
 * R2-INB-003 (item 82) — o construtor de mensagens interativas confirmava o envio
 * sem transporte. O transporte canônico de saída não aceita este tipo hoje:
 * `enqueue_outbound_message` (text/image/audio/video/document/sticker/location) e
 * `enqueue_rich_outbound_message` (poll/contact) rejeitam o tipo e a
 * `message-delivery` responde `unsupported_message_type`. Enquanto não existir
 * enqueue/entrega para botões e listas, o envio é declarado indisponível — a
 * composição fica preservada no formulário e nada é descartado em silêncio.
 * Fonte única: guarda no handler + apresentação no builder, via o retorno do hook.
 */
export const ENVIO_INTERATIVO_INDISPONIVEL =
  'Envio de mensagens interativas indisponível: o transporte de botões e listas ainda não está publicado. Sua composição foi mantida.';

function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

export function useChatPanelHandlers(opts: UseChatPanelHandlersOptions) {
  const {
    contactPhone, instanceName, onSendMessage, contactId,
    editMessageApi, applySignature, handleTypingStart, handleTypingStop,
    openDialog, closeDialog, handleSetActiveTool,
  } = opts;

  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Ações reais (favoritar, adiar) para os comandos de barra — mesmo hook usado em
  // RealtimeInboxView/ContactHeaderSection; múltiplas instâncias ficam em sync via _favBus.
  const { isFavorite, favoriteContact, unfavoriteContact, snoozeConversation } = useConversationActions();

  // Etapa 68 (B10): `/remind` grava uma tarefa real com alarme pelo mesmo hook do
  // módulo de Tarefas (nada de insert cru). O ref mantém o callback de comandos
  // estável, como os demais handlers de mensagem.
  const { createAndGetId } = useMyWorkItems({ contactId });
  const criarTarefaRef = useLatest(createAndGetId);

  // ── Refs for stable callbacks (avoid re-renders on every keystroke) ──
  const inputValueRef = useLatest(inputValue);
  const isSendingRef = useLatest(isSending);
  const editingMessageRef = useLatest(editingMessage);
  const replyToMessageRef = useLatest(replyToMessage);
  const forwardMessageRef = useLatest(forwardMessage);

  const EDIT_WINDOW_MINUTES = 15;

  const handleEditStart = useCallback((message: Message) => {
    const minutesAgo = (Date.now() - message.timestamp.getTime()) / 60000;
    if (minutesAgo > EDIT_WINDOW_MINUTES) {
      toast({ title: 'Tempo expirado', description: `Você só pode editar mensagens nos primeiros ${EDIT_WINDOW_MINUTES} minutos.`, variant: 'destructive' });
      return;
    }
    setEditingMessage(message);
    setInputValue(message.content);
    inputRef.current?.focus();
  }, []);

  const handleCancelEdit = useCallback(() => { setEditingMessage(null); setInputValue(''); }, []);

  // handleSend now reads from refs → deps are stable → no re-render cascade
  const handleSend = useCallback(async () => {
    const currentInput = inputValueRef.current;
    if (!currentInput.trim() || isSendingRef.current) return;

    const currentEditing = editingMessageRef.current;
    if (currentEditing) {
      const externalId = currentEditing.external_id;
      const contactJid = contactPhone ? `${contactPhone}@s.whatsapp.net` : '';
      setIsSending(true);
      try {
        if (instanceName && externalId && contactJid) {
          await editMessageApi(instanceName, { number: contactJid, messageId: externalId, text: currentInput.trim() });
        }
        await supabase.from('messages').update({ content: currentInput.trim(), updated_at: new Date().toISOString() }).eq('id', currentEditing.id);
        toast({ title: '✏️ Mensagem editada', description: 'A mensagem foi atualizada com sucesso.' });
      } catch (err) {
        log.error('Failed to edit message:', err);
        toast({ title: 'Erro ao editar', description: 'Não foi possível editar a mensagem.', variant: 'destructive' });
      } finally { setIsSending(false); }
      setEditingMessage(null); setInputValue('');
      return;
    }

    const messageContent = applySignature(currentInput.trim());
    const wasReply = replyToMessageRef.current;
    setIsSending(true); setInputValue(''); setReplyToMessage(null); handleTypingStop();
    if (wasReply) log.debug('Sending reply to:', wasReply.id);

    try {
      await onSendMessage(messageContent, wasReply?.id ?? null);
      undoToast({
        message: 'Mensagem enviada', icon: '📨', delay: 3000,
        onUndo: () => {
          setInputValue(messageContent);
          if (wasReply) setReplyToMessage(wasReply);
          toast({ title: '↩️ Mensagem restaurada', description: 'O texto foi restaurado no campo de entrada.' });
        },
      });
    } catch (err) {
      log.error('Failed to send message:', err);
      setInputValue(messageContent);
      toast({ title: 'Erro ao enviar', description: 'Tente novamente.', variant: 'destructive' });
    } finally { setIsSending(false); }
  }, [contactPhone, instanceName, editMessageApi, applySignature, onSendMessage, handleTypingStop, editingMessageRef, inputValueRef, isSendingRef, replyToMessageRef]);

  const handleReplyToMessage = useCallback((message: Message) => { setReplyToMessage(message); inputRef.current?.focus(); }, []);
  const handleCopyMessage = useCallback((content: string) => { void navigator.clipboard.writeText(content); toast({ title: 'Copiado!', description: 'Mensagem copiada para a área de transferência.' }); }, []);
  const handleForwardMessage = useCallback((message: Message) => { setForwardMessage(message); openDialog('forwardDialog'); }, [openDialog]);
  const handleForwardToTargets = useCallback((targetIds: string[], targetType: 'contact' | 'group') => { log.debug('Forwarding to:', { targetIds, targetType, message: forwardMessageRef.current }); }, [forwardMessageRef]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputValue(value);
    if (value.startsWith('/')) { openDialog('slashCommands'); closeDialog('quickReplies'); } else { closeDialog('slashCommands'); }
    if (value.length > 0) handleTypingStart(); else handleTypingStop();
  }, [openDialog, closeDialog, handleTypingStart, handleTypingStop]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, slashCommandsOpen: boolean) => {
    if (slashCommandsOpen && (e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) return;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === 'k' && e.ctrlKey) { e.preventDefault(); openDialog('globalSearch'); }
    if (e.key === 'f' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSetActiveTool('chatSearch'); }
    if (e.key === 'Escape' && slashCommandsOpen) closeDialog('slashCommands');
  }, [handleSend, openDialog, closeDialog, handleSetActiveTool]);

  const handleSlashCommand = useCallback((command: SlashCommand, subCommand?: string) => {
    closeDialog('slashCommands'); setInputValue('');
    switch (command.id) {
      case 'transfer': openDialog('transferDialog'); break;
      // Mesma dialog do header ("Encerrar Conversa" → close_conversation_atomic), igual ao /transfer.
      case 'resolve': openDialog('closeDialog'); break;
      case 'template': toast({ title: '📝 Templates', description: 'Use o botão de templates no input para selecionar.' }); break;
      case 'note': toast({ title: '📝 Nota Privada', description: 'Funcionalidade de notas será aberta.' }); break;
      case 'tag': toast({ title: subCommand === 'add' ? '🏷️ Adicionar Tag' : '🏷️ Remover Tag', description: subCommand === 'add' ? 'Selecione uma tag para adicionar.' : 'Selecione uma tag para remover.' }); break;
      case 'priority': {
        if (!subCommand) break;
        const labels: Record<string, string> = { high: 'Alta', medium: 'Média', low: 'Baixa' };
        const priorityValue = normalizeOperationalPriority(subCommand).value;
        if (!priorityValue) {
          toast({
            title: '⚠️ Prioridade inválida',
            description: `"${subCommand}" não é uma prioridade válida — use baixa, média ou alta.`,
            variant: 'destructive',
          });
          break;
        }
        void (async () => {
          const { error } = await supabase.from('contacts').update({ ai_priority: priorityValue }).eq('id', contactId);
          if (error) {
            log.error('Failed to set priority:', error);
            toast({ title: 'Erro ao definir prioridade', description: 'Não foi possível atualizar a prioridade.', variant: 'destructive' });
          } else {
            toast({ title: '⚡ Prioridade Definida', description: `Prioridade definida como ${labels[subCommand] || subCommand}.` });
          }
        })();
        break;
      }
      case 'assign': openDialog('transferDialog'); break;
      // useConversationActions.snoozeConversation já grava em conversation_snoozes e mostra o toast.
      case 'snooze': if (subCommand) snoozeConversation(contactId, subCommand); break;
      // useConversationActions já grava em favorite_contacts e mostra o toast.
      case 'star': (isFavorite(contactId) ? unfavoriteContact : favoriteContact)(contactId); break;
      case 'archive': {
        void (async () => {
          const { error } = await supabase.from('contacts').update({ assigned_to: null }).eq('id', contactId);
          if (error) {
            log.error('Failed to archive contact:', error);
            toast({ title: 'Erro ao arquivar', description: 'Não foi possível arquivar a conversa.', variant: 'destructive' });
          } else {
            toast({ title: '📦 Conversa Arquivada', description: 'A conversa foi arquivada.' });
          }
        })();
        break;
      }
      // Etapa 68 (B10): o lembrete vira tarefa real (alarme amanhã 9h) e abre a aba
      // Tarefas já no item criado, pelo deep-link `?task=<id>` da etapa 27.
      case 'remind': {
        void (async () => {
          const quando = tomorrowAtNine();
          const { data: contato } = await supabase
            .from('contacts')
            .select('name')
            .eq('id', contactId)
            .maybeSingle();
          const nome = contato?.name?.trim();
          const titulo = nome ? `Lembrete: ${nome}` : 'Lembrete';
          let novoId: string | null = null;
          try {
            novoId = await criarTarefaRef.current({ title: titulo, remindAt: quando.toISOString(), contactId, status: 'todo' });
          } catch (err) {
            log.error('Failed to create reminder task:', err);
            toast({ title: 'Erro ao criar lembrete', description: 'Não foi possível criar a tarefa.', variant: 'destructive' });
            return;
          }
          // `createAndGetId` devolve o id da tarefa criada: sem leitura extra para
          // descobrir qual linha acabou de nascer.
          if (novoId) {
            const url = new URL(window.location.href);
            url.searchParams.set('task', novoId);
            window.history.replaceState(null, '', url.pathname + url.search);
          }
          navigateToView('tasks');
          toast({
            title: '🔔 Lembrete criado',
            description: `Tarefa com alarme para ${quando.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.`,
          });
        })();
        break;
      }
      // Reaproveita o popover de respostas rápidas já ligado a dialogs.quickReplies em ChatPanel.
      case 'quick': openDialog('quickReplies'); break;
      case 'summary': handleSetActiveTool('aiAssistant'); break;
      case 'produto': openDialog('catalogDirect'); break;
      default: toast({ title: `Comando: ${command.label}`, description: command.description }); break;
    }
  }, [closeDialog, openDialog, handleSetActiveTool, contactId, isFavorite, favoriteContact, unfavoriteContact, snoozeConversation, criarTarefaRef]);

  // Contrato explícito (R2-INB-003): resolve só quando o transporte aceitou a
  // composição; rejeita quando o envio não foi confirmado. Sem transporte para
  // botões/lista, rejeita com o motivo — o builder mantém a composição.
  const handleSendInteractiveMessage = useCallback(async (interactive: InteractiveMessage) => {
    log.warn('Interactive message transport unavailable', { type: interactive.type });
    throw new Error(ENVIO_INTERATIVO_INDISPONIVEL);
  }, []);

  const handleInteractiveButtonClick = useCallback((button: InteractiveButton) => {
    toast({ title: 'Botão clicado', description: `Resposta: ${button.title}` });
  }, []);

  const handleSendLocation = useCallback(async (location: LocationMessage) => {
    try {
      await sendOutboundMessage({
        contactId,
        content: JSON.stringify({
          latitude: location.latitude,
          longitude: location.longitude,
          ...(location.name ? { name: location.name } : {}),
          ...(location.address ? { address: location.address } : {}),
        }),
        messageType: 'location',
      });
      toast({ title: 'Localização enviada!', description: location.name || 'Localização compartilhada' });
    } catch (error) {
      log.error('Failed to send location:', error);
      toast({ title: 'Erro ao enviar localização', description: 'Tente novamente.', variant: 'destructive' });
      throw error;
    }
  }, [contactId]);

  const handleAudioSend = useCallback(async (audioBlob: Blob, onSendAudio?: (blob: Blob) => Promise<void>) => {
    if (onSendAudio) {
      try { await onSendAudio(audioBlob); } catch (err) { log.error('Error sending audio:', err); toast({ title: 'Erro ao enviar áudio', description: 'Tente novamente.', variant: 'destructive' }); }
    } else { toast({ title: 'Erro', description: 'Envio de áudio não configurado.', variant: 'destructive' }); }
    setIsRecordingAudio(false);
  }, []);

  return {
    inputValue, setInputValue, isSending, isRecordingAudio, setIsRecordingAudio,
    replyToMessage, setReplyToMessage, forwardMessage, editingMessage,
    inputRef,
    handleEditStart, handleCancelEdit, handleSend,
    handleReplyToMessage, handleCopyMessage, handleForwardMessage, handleForwardToTargets,
    handleInputChange, handleKeyDown, handleSlashCommand,
    handleSendInteractiveMessage, interactiveSendUnavailableReason: ENVIO_INTERATIVO_INDISPONIVEL,
    handleInteractiveButtonClick,
    handleSendLocation, handleAudioSend,
  };
}
