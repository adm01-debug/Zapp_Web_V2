import { useState, useRef, useEffect, useCallback } from 'react';
import { log } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { undoToast } from '@/lib/undoToast';
import { normalizeOperationalPriority } from '@/lib/ai-vocabulary';
import { Message, InteractiveMessage, InteractiveButton, LocationMessage } from '@/types/chat';
import { SlashCommand } from '../SlashCommands';
import { toast } from '@/hooks/ui/use-toast';
import { sendOutboundMessage } from '@/services/outbound-message.service';
import {
  createForwardRunState,
  forwardMediaMessages,
  type ForwardMediaItem,
  type ForwardNonForwardable,
  type ForwardPairOutcome,
  type ForwardResult,
  type ForwardRunState,
} from '@/hooks/chat/useForwardMedia';
import type { ForwardCallback } from '@/hooks/chat/useForwardMessage';
import { useConversationActions } from '@/hooks/chat/useConversationActions';
import { useMyWorkItems, tomorrowAtNine } from '@/hooks/tasks/useMyWorkItems';
import { navigateToView } from '@/hooks/system/useNavigationHistory';
import { CHAR_LIMIT } from './useChatInputLogic';

/** Tipos de mensagem do chat com representação textual direta no transporte. */
const TEXTUAL_FORWARD_TYPES: ReadonlySet<Message['type']> = new Set(['text', 'interactive']);

/** Tipo do chat → tipo de mídia do encaminhamento; `null` = forma sem representação segura. */
function forwardMediaKind(type: Message['type']): ForwardMediaItem['type'] | null {
  if (type === 'file') return 'document';
  if (type === 'image' || type === 'video' || type === 'audio' || type === 'document') return type;
  return null;
}

function summarizeForward(
  pairOutcomes: ForwardPairOutcome[],
  nonForwardable: ForwardNonForwardable[],
): ForwardResult {
  const sent = pairOutcomes.filter((outcome) => outcome.ok).length;
  return {
    pairOutcomes,
    nonForwardable,
    attempted: pairOutcomes.length,
    sent,
    failed: pairOutcomes.length - sent,
  };
}

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
  // R2-INB-022: guarda de reenvio. Como o gravador passa a continuar aberto quando o envio
  // falha, o usuário pode tocar "Enviar" de novo; este ref evita disparar dois envios
  // concorrentes da mesma gravação enquanto o primeiro ainda está em voo.
  const isSendingAudioRef = useRef(false);
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

  /**
   * R2-INB-016 (item 312) — limite de caracteres do editor. O botão Enviar já era
   * desabilitado por `isOverLimit`, mas o Enter chamava `handleSend` direto: o mesmo
   * payload acima do limite anunciado saía sem resistência. A recusa (com aviso, sem
   * descartar o texto) vive aqui, no comando de envio compartilhado, para que botão,
   * Enter e edição tenham o mesmo resultado.
   */
  const recusarAcimaDoLimite = useCallback((tamanho: number) => {
    if (tamanho <= CHAR_LIMIT) return false;
    toast({
      title: 'Mensagem muito longa',
      description: `Reduza para até ${CHAR_LIMIT} caracteres para enviar.`,
      variant: 'destructive',
    });
    return true;
  }, []);

  // handleSend now reads from refs → deps are stable → no re-render cascade
  const handleSend = useCallback(async () => {
    const currentInput = inputValueRef.current;
    if (!currentInput.trim() || isSendingRef.current) return;
    // Vale para o envio E para a edição (o editor é a mesma fonte do texto).
    if (recusarAcimaDoLimite(currentInput.length)) return;

    const currentEditing = editingMessageRef.current;
    if (currentEditing) {
      const externalId = currentEditing.external_id;
      const contactJid = contactPhone ? `${contactPhone}@s.whatsapp.net` : '';
      setIsSending(true);
      try {
        if (instanceName && externalId && contactJid) {
          await editMessageApi(instanceName, { number: contactJid, messageId: externalId, text: currentInput.trim() });
        }
        // R2-INB-014: o PostgREST não lança exceção — o builder resolve em `{ error }`. Sucesso
        // só existe quando a atualização local volta sem erro; sem esta checagem a UI anunciava
        // "Mensagem editada", limpava o editor e encerrava o fluxo como êxito com a gravação
        // recusada (RLS/permission denied).
        const { error } = await supabase.from('messages').update({ content: currentInput.trim(), updated_at: new Date().toISOString() }).eq('id', currentEditing.id);
        if (error) throw error;
        toast({ title: '✏️ Mensagem editada', description: 'A mensagem foi atualizada com sucesso.' });
        // Só o sucesso sai do modo de edição — na falha o texto permanece no editor para retry.
        setEditingMessage(null); setInputValue('');
      } catch (err) {
        log.error('Failed to edit message:', err);
        toast({ title: 'Erro ao editar', description: 'Não foi possível editar a mensagem.', variant: 'destructive' });
      } finally { setIsSending(false); }
      return;
    }

    // R2-INB-007: a assinatura é aplicada só no payload enviado. O editor (e o
    // Desfazer) guardam o texto ORIGINAL — restaurar o texto assinado fazia o
    // retry prefixar de novo (assinatura duplicada) e mudava o `content`, que
    // participa da chave de idempotência do serviço de envio.
    const originalText = currentInput.trim();
    const messageContent = applySignature(originalText);
    const wasReply = replyToMessageRef.current;
    setIsSending(true); setInputValue(''); setReplyToMessage(null); handleTypingStop();
    if (wasReply) log.debug('Sending reply to:', wasReply.id);

    try {
      await onSendMessage(messageContent, wasReply?.id ?? null);
      undoToast({
        message: 'Mensagem enviada', icon: '📨', delay: 3000,
        onUndo: () => {
          setInputValue(originalText);
          if (wasReply) setReplyToMessage(wasReply);
          toast({ title: '↩️ Mensagem restaurada', description: 'O texto foi restaurado no campo de entrada.' });
        },
      });
    } catch (err) {
      log.error('Failed to send message:', err);
      setInputValue(originalText);
      toast({ title: 'Erro ao enviar', description: 'Tente novamente.', variant: 'destructive' });
    } finally { setIsSending(false); }
  }, [contactPhone, instanceName, editMessageApi, applySignature, onSendMessage, handleTypingStop, editingMessageRef, inputValueRef, isSendingRef, replyToMessageRef, recusarAcimaDoLimite]);

  const handleReplyToMessage = useCallback((message: Message) => { setReplyToMessage(message); inputRef.current?.focus(); }, []);
  const handleCopyMessage = useCallback((content: string) => { void navigator.clipboard.writeText(content); toast({ title: 'Copiado!', description: 'Mensagem copiada para a área de transferência.' }); }, []);

  // R2-INB-002: um novo encaminhamento começa com estado limpo — o retry dentro do
  // diálogo reusa o MESMO estado (pares concluídos), mas um encaminhamento novo não herda.
  const forwardRunStateRef = useRef<ForwardRunState | null>(null);

  const handleForwardMessage = useCallback((message: Message) => {
    forwardRunStateRef.current = null;
    setForwardMessage(message);
    openDialog('forwardDialog');
  }, [openDialog]);

  /**
   * R2-INB-002: transporta o encaminhamento do CHAT pelo caminho canônico e devolve o
   * resultado real por destino. Antes só existia `log.debug` e o hook anunciava sucesso
   * sem transporte. Grupo e formas sem representação segura falham explicitamente —
   * nada de sucesso fictício nem bypass.
   */
  const handleForwardToTargets = useCallback<ForwardCallback>(async (targetIds, targetType, onProgress) => {
    const message = forwardMessageRef.current;
    const pairOutcomes: ForwardPairOutcome[] = [];
    const nonForwardable: ForwardNonForwardable[] = [];

    const failEveryTarget = (reason: string) => {
      const itemId = message?.id ?? 'chat-forward';
      for (const targetId of targetIds) pairOutcomes.push({ itemId, targetId, targetType, ok: false, error: reason });
      return summarizeForward(pairOutcomes, nonForwardable);
    };

    if (!message) return failEveryTarget('Mensagem de origem indisponível para encaminhar.');

    // `enqueue_outbound_message` valida `contacts.id`: grupo não tem destino seguro.
    if (targetType === 'group') return failEveryTarget('Encaminhamento para grupos ainda não é suportado.');

    const mediaKind = forwardMediaKind(message.type);
    if (mediaKind) {
      if (!message.mediaUrl) return failEveryTarget('Mensagem sem arquivo de origem para encaminhar.');
      const state = forwardRunStateRef.current ?? createForwardRunState();
      forwardRunStateRef.current = state;
      const item: ForwardMediaItem = {
        id: message.id,
        url: message.mediaUrl,
        type: mediaKind,
        filename: message.media_filename || 'arquivo',
        caption: message.caption ?? null,
      };
      return forwardMediaMessages(
        [item],
        targetIds.map((id) => ({ id, type: 'contact' as const })),
        { state, onProgress },
      );
    }

    if (!TEXTUAL_FORWARD_TYPES.has(message.type)) {
      return failEveryTarget(`Mensagens do tipo "${message.type}" não podem ser encaminhadas.`);
    }

    // Texto/interactive textual: um envio canônico por contato, com o conteúdo original.
    const total = targetIds.length;
    onProgress?.(0, total);
    let done = 0;
    for (const targetId of targetIds) {
      try {
        await sendOutboundMessage({ contactId: targetId, content: message.content, messageType: 'text' });
        pairOutcomes.push({ itemId: message.id, targetId, targetType: 'contact', ok: true });
      } catch (error) {
        pairOutcomes.push({
          itemId: message.id,
          targetId,
          targetType: 'contact',
          ok: false,
          error: error instanceof Error && error.message ? error.message : 'Não foi possível encaminhar a mensagem.',
        });
      }
      done += 1;
      onProgress?.(done, total);
    }
    return summarizeForward(pairOutcomes, nonForwardable);
  }, [forwardMessageRef]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputValue(value);
    if (value.startsWith('/')) { openDialog('slashCommands'); closeDialog('quickReplies'); } else { closeDialog('slashCommands'); }
    if (value.length > 0) handleTypingStart(); else handleTypingStop();
  }, [openDialog, closeDialog, handleTypingStart, handleTypingStop]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, slashCommandsOpen: boolean) => {
    if (slashCommandsOpen && (e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) return;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    // R2-INB-017 (item 313): o textarea é o dono de Ctrl/Cmd+F e Ctrl+K quando o evento nasce
    // no composer. Sem consumir o evento (stopPropagation), o listener de window do ChatPanel
    // repetia o Ctrl+F — dois toggles devolviam a busca ao estado anterior — e o listener de
    // document (busca global da Inbox) abria um segundo painel no Ctrl+K. Consumido aqui, um
    // pressionamento produz uma única ação; fora do composer, os listeners globais seguem donos.
    if (e.key === 'k' && e.ctrlKey) { e.preventDefault(); e.stopPropagation(); openDialog('globalSearch'); }
    if (e.key === 'f' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); handleSetActiveTool('chatSearch'); }
    if (e.key === 'Escape' && slashCommandsOpen) closeDialog('slashCommands');
  }, [handleSend, openDialog, closeDialog, handleSetActiveTool]);

  const handleSlashCommand = useCallback((command: SlashCommand, subCommand?: string) => {
    closeDialog('slashCommands'); setInputValue('');
    switch (command.id) {
      case 'transfer': openDialog('transferDialog'); break;
      // Mesma dialog do header ("Encerrar Conversa" → close_conversation_atomic), igual ao /transfer.
      case 'resolve': openDialog('closeDialog'); break;
      case 'template': toast({ title: '📝 Templates', description: 'Use o botão de templates no input para selecionar.' }); break;
      // R2-INB-021 (item 317): os cases 'note' e 'tag' saíram daqui junto com os
      // comandos. Eles só limpavam o input e mostravam um aviso — a lista
      // anunciava "adicionar nota" e "adicionar/remover tag" sem nenhum editor
      // de nota ou seletor de tag atrás. Comando volta quando o destino existir.
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

  // R2-INB-022: só fecha o gravador quando o envio CONFIRMA. Em falha, mantém o AudioRecorder
  // montado — o blob vive no estado dele, então fechar descartaria uma gravação ainda recuperável.
  // Devolve true/false para o chamador (o ChatPanel hoje ignora; os testes pinam o contrato).
  const handleAudioSend = useCallback(async (audioBlob: Blob, onSendAudio?: (blob: Blob) => Promise<boolean>): Promise<boolean> => {
    if (!onSendAudio) {
      toast({ title: 'Erro', description: 'Envio de áudio não configurado.', variant: 'destructive' });
      return false;
    }
    if (isSendingAudioRef.current) return false;
    isSendingAudioRef.current = true;
    try {
      const enviado = await onSendAudio(audioBlob);
      // A ponte sinaliza falha com `false` (ela mesma já avisa o usuário); ausência de retorno
      // também conta como falha — o padrão seguro é NÃO descartar a gravação.
      if (enviado) {
        setIsRecordingAudio(false);
        return true;
      }
      return false;
    } catch (err) {
      log.error('Error sending audio:', err);
      toast({ title: 'Erro ao enviar áudio', description: 'Tente novamente.', variant: 'destructive' });
      return false;
    } finally {
      isSendingAudioRef.current = false;
    }
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
