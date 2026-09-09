import { useState, useRef, useCallback, useEffect } from 'react';
import { log } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { undoToast } from '@/lib/undoToast';
import { Message, InteractiveMessage, InteractiveButton, LocationMessage } from '@/types/chat';
import { SlashCommand } from '../SlashCommands';
import { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';
import { toast } from '@/hooks/ui/use-toast';

interface UseChatPanelHandlersOptions {
  conversationId: string;
  contactId: string;
  contactPhone: string;
  instanceName?: string;
  /**
   * Envia a mensagem e resolve somente depois que o transporte a confirmou.
   * O retorno síncrono continua aceito para preservar integrações legadas.
   */
  onSendMessage: (content: string) => void | Promise<void>;
  editMessageApi: (instance: string, params: { number: string; messageId: string; text: string }) => Promise<unknown>;
  applySignature: (text: string) => string;
  handleTypingStart: () => void;
  handleTypingStop: () => void;
  openDialog: (key: string) => void;
  closeDialog: (key: string) => void;
  handleSetActiveTool: (tool: 'chatSearch' | 'objections' | 'university' | 'aiAssistant' | 'summary' | null) => void;
}

export function useChatPanelHandlers(opts: UseChatPanelHandlersOptions) {
  const {
    contactPhone, instanceName, onSendMessage,
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

  // ── Refs for stable callbacks (avoid re-renders on every keystroke) ──
  const inputValueRef = useRef(inputValue);
  const isSendingRef = useRef(isSending);
  const editingMessageRef = useRef(editingMessage);
  const replyToMessageRef = useRef(replyToMessage);
  const forwardMessageRef = useRef(forwardMessage);

  useEffect(() => { inputValueRef.current = inputValue; }, [inputValue]);
  useEffect(() => { isSendingRef.current = isSending; }, [isSending]);
  useEffect(() => { editingMessageRef.current = editingMessage; }, [editingMessage]);
  useEffect(() => { replyToMessageRef.current = replyToMessage; }, [replyToMessage]);
  useEffect(() => { forwardMessageRef.current = forwardMessage; }, [forwardMessage]);

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

    // O ref fecha a janela entre dois eventos disparados antes do próximo render.
    // Confiar apenas no state permitiria duas chamadas concorrentes neste intervalo.
    isSendingRef.current = true;
    setIsSending(true);

    const currentEditing = editingMessageRef.current;
    if (currentEditing) {
      const externalId = currentEditing.external_id;
      const contactJid = contactPhone ? `${contactPhone}@s.whatsapp.net` : '';
      try {
        if (instanceName && externalId && contactJid) {
          await editMessageApi(instanceName, { number: contactJid, messageId: externalId, text: currentInput.trim() });
        }
        const { error } = await supabase.from('messages').update({ content: currentInput.trim(), updated_at: new Date().toISOString() }).eq('id', currentEditing.id);
        if (error) throw error;
        toast({ title: '✏️ Mensagem editada', description: 'A mensagem foi atualizada com sucesso.' });
        setEditingMessage(null);
        if (inputValueRef.current === currentInput) {
          inputValueRef.current = '';
          setInputValue('');
        }
      } catch (err) {
        log.error('Failed to edit message:', err);
        toast({ title: 'Erro ao editar', description: 'Não foi possível editar a mensagem.', variant: 'destructive' });
      } finally {
        isSendingRef.current = false;
        setIsSending(false);
      }
      return;
    }

    const wasReply = replyToMessageRef.current;
    if (wasReply) log.debug('Sending reply to:', wasReply.id);

    try {
      const messageContent = applySignature(currentInput.trim());
      await onSendMessage(messageContent);

      // Não apaga texto novo digitado enquanto o envio estava em andamento.
      if (inputValueRef.current === currentInput) {
        inputValueRef.current = '';
        setInputValue('');
        handleTypingStop();
      }
      setReplyToMessage(null);
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
      toast({ title: 'Erro ao enviar', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
    }
  }, [contactPhone, instanceName, editMessageApi, applySignature, onSendMessage, handleTypingStop]);

  const handleReplyToMessage = useCallback((message: Message) => { setReplyToMessage(message); inputRef.current?.focus(); }, []);
  const handleCopyMessage = useCallback((content: string) => { navigator.clipboard.writeText(content); toast({ title: 'Copiado!', description: 'Mensagem copiada para a área de transferência.' }); }, []);
  const handleForwardMessage = useCallback((message: Message) => { setForwardMessage(message); openDialog('forwardDialog'); }, [openDialog]);
  const handleForwardToTargets = useCallback((targetIds: string[], targetType: 'contact' | 'group') => { log.debug('Forwarding to:', { targetIds, targetType, message: forwardMessageRef.current }); }, []);

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
    // Ctrl/Cmd+F pertence ao listener único do ChatPanel. Tratá-lo também aqui
    // faria o mesmo evento alternar a busca duas vezes ao partir do textarea.
    if (e.key === 'Escape' && slashCommandsOpen) closeDialog('slashCommands');
  }, [handleSend, openDialog, closeDialog]);

  const handleSlashCommand = useCallback((command: SlashCommand, subCommand?: string) => {
    closeDialog('slashCommands'); setInputValue('');
    switch (command.id) {
      case 'transfer': openDialog('transferDialog'); break;
      case 'resolve': openDialog('closeDialog'); break;
      case 'template': toast({ title: '📝 Templates', description: 'Use o botão de templates no input para selecionar.' }); break;
      case 'assign': openDialog('transferDialog'); break;
      case 'note':
      case 'tag':
      case 'priority':
      case 'snooze':
      case 'star':
      case 'archive':
      case 'remind':
        toast({
          title: 'Ação não executada',
          description: 'Use a seção correspondente para confirmar esta alteração.',
          variant: 'destructive',
        });
        break;
      case 'quick': toast({ title: '⚡ Resposta Rápida', description: 'Use / seguido do atalho para respostas rápidas.' }); break;
      case 'summary': handleSetActiveTool('aiAssistant'); break;
      case 'produto': openDialog('catalogDirect'); break;
      default: toast({ title: `Comando: ${command.label}`, description: command.description }); break;
    }
  }, [closeDialog, openDialog, handleSetActiveTool]);

  const handleSendProduct = useCallback(async (product: ExternalProduct) => {
    const price = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.sale_price);
    const lines = [
      `📦 *${product.name}*`, product.brand ? `🏷️ Marca: ${product.brand}` : '', `💰 Preço: ${price}`,
      product.min_quantity ? `📋 Qtd. mínima: ${product.min_quantity} un.` : '',
      product.colors?.length ? `🎨 Cores: ${product.colors.join(', ')}` : '',
      product.dimensions_display ? `📏 Dimensões: ${product.dimensions_display}` : '',
      product.allows_personalization ? '✅ Permite personalização' : '',
      product.lead_time_days ? `⏱️ Prazo: ${product.lead_time_days} dias úteis` : '',
      product.is_stockout ? '⚠️ *Sem estoque no momento*' : `✅ Em estoque: ${product.stock_quantity} un.`,
      (product.short_description || product.description) ? `\n${(product.short_description || product.description || '').slice(0, 300)}` : '',
      product.primary_image_url ? `\n🔗 ${product.primary_image_url}` : '',
    ].filter(Boolean).join('\n');
    try {
      await onSendMessage(lines);
      toast({ title: 'Produto enviado!', description: `${product.name} - ${price}` });
    } catch (error) {
      log.error('Failed to send product:', error);
      toast({ title: 'Erro ao enviar produto', description: 'O produto não foi enviado.', variant: 'destructive' });
    }
  }, [onSendMessage]);

  const handleSendInteractiveMessage = useCallback((interactive: InteractiveMessage) => {
    log.warn('Interactive message transport is unavailable', { buttonCount: interactive.buttons?.length ?? 0 });
    toast({ title: 'Mensagem não enviada', description: 'O envio interativo ainda não está conectado ao transporte.', variant: 'destructive' });
  }, []);

  const handleInteractiveButtonClick = useCallback((button: InteractiveButton) => {
    toast({ title: 'Botão clicado', description: `Resposta: ${button.title}` });
  }, []);

  const handleSendLocation = useCallback((location: LocationMessage) => {
    log.warn('Location message transport is unavailable', { isLive: Boolean(location.isLive) });
    toast({ title: 'Localização não enviada', description: 'Este canal ainda não oferece envio de localização.', variant: 'destructive' });
  }, []);

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
    handleSendProduct, handleSendInteractiveMessage, handleInteractiveButtonClick,
    handleSendLocation, handleAudioSend,
  };
}
