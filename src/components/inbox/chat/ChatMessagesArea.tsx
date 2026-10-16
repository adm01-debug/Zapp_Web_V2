import { useRef, forwardRef, useImperativeHandle, useCallback, useMemo, memo, useEffect, useLayoutEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronUp, Loader2 } from 'lucide-react';
import { getLogger } from '@/lib/logger';

const log = getLogger('ChatMessagesArea');
import { ChatService } from '@/services/chat.service';
import { RealtimeService } from '@/services/realtime.service';
import { cn } from '@/lib/utils';
import { Message, InteractiveButton } from '@/types/chat';
import { motion } from '@/components/ui/motion';
import { TypingIndicator } from '../TypingIndicator';
import { isSameDay } from 'date-fns';
import { formatDateSeparator } from './messageUtils';
import { MessageBubble } from './MessageBubble';

interface ChatMessagesAreaProps {
  messages: Message[];
  isContactTyping: boolean;
  /**
   * R2-INB-026: colega (agente) digitando na mesma conversa. Indicador separado do
   * contato — quem digita é do time, não o usuário final; o rótulo exibido vem de
   * `typingUserName`, nunca do nome do contato.
   */
  isColleagueTyping?: boolean;
  typingUserName: string;
  ttsLoading: boolean;
  ttsPlaying: boolean;
  ttsMessageId: string | null;
  instanceName?: string;
  /** Id da conversa (contato). Ancora estavel do canal de reactions. */
  conversationId?: string;
  contactJid?: string;
  contactAvatar?: string;
  onSpeak: (messageId: string, text: string) => void;
  onStop: () => void;
  onReply: (message: Message) => void;
  onForward: (message: Message) => void;
  onCopy: (content: string) => void;
  onScrollToMessage: (messageId: string) => void;
  onInteractiveButtonClick: (button: InteractiveButton) => void;
  onEditStart?: (message: Message) => void;
  highlightedMessageIds?: Set<string>;
  activeHighlightId?: string | null;
  searchQuery?: string;
  /**
   * R2-INB-004: existe historico anterior ainda nao carregado? Quando `true`, a
   * superficie de rolagem mostra o controle "Carregar mensagens anteriores";
   * quando `false`, anuncia o inicio do historico. Omitido (`undefined`) =
   * consumidor antigo: nenhum controle e renderizado.
   */
  hasOlderMessages?: boolean;
  /** Carga do historico anterior em andamento (sinal externo, do hook). */
  loadingOlderMessages?: boolean;
  /**
   * Dispara a busca do lote anterior. O fetch vive no hook de mensagens; aqui
   * apenas consumimos o contrato — nenhuma consulta e feita neste componente.
   */
  onLoadOlderMessages?: () => void | Promise<void>;
}

export interface ChatMessagesAreaRef {
  /**
   * Rola ate o fim. P2 #320 (R2-INB-025): so quando o usuario esta acompanhando
   * a conversa — quem rolou para ler o historico nao e arrastado de volta por
   * mensagem nova nem pelo indicador de digitacao. A posicao e a do ultimo
   * evento de rolagem, entao "chegou mensagem e eu estava no fim" continua
   * rolando (a leitura acontece antes de a mensagem entrar no DOM).
   */
  scrollToBottom: () => void;
  registerMessageRef: (messageId: string, el: HTMLDivElement | null) => void;
  scrollToMessage: (messageId: string) => void;
}

/** Bloco do topo da lista. As duas variantes (carregar / inicio) tem a MESMA
 *  altura minima para que a troca de uma pela outra nao empurre as mensagens. */
const OLDER_ROW_CLASS = 'flex min-h-[2.75rem] items-center justify-center py-1';

/** P2 #320 (R2-INB-025): distancia do fim (px) que ainda conta como "seguindo a
 *  conversa". Dentro dela a lista acompanha o fim; acima dela o usuario esta
 *  lendo e nada pode mover o scroll. Mesmo limite do painel de equipe. */
const BOTTOM_FOLLOW_THRESHOLD_PX = 100;

function isNearBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_FOLLOW_THRESHOLD_PX;
}

export const ChatMessagesArea = memo(forwardRef<ChatMessagesAreaRef, ChatMessagesAreaProps>(({ 
  messages, isContactTyping, isColleagueTyping = false, typingUserName, ttsLoading, ttsPlaying, ttsMessageId,
  instanceName, conversationId, contactJid, contactAvatar, onSpeak, onStop, onReply, onForward, onCopy,
  onScrollToMessage, onInteractiveButtonClick, onEditStart, highlightedMessageIds, activeHighlightId, searchQuery,
  hasOlderMessages, loadingOlderMessages, onLoadOlderMessages,
}, ref) => {
  const queryClient = useQueryClient();
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Bloco de itens virtualizados: e a origem das coordenadas de `virtualizer.*`.
  const listRef = useRef<HTMLDivElement>(null);

  // P2 #320 (R2-INB-025): posicao em que o usuario parou, atualizada no evento de
  // rolagem. A leitura e feita no evento (e nao no efeito que acompanha mensagem
  // nova) porque quando o efeito roda a mensagem nova ja entrou no DOM e ja
  // empurrou o fim para longe — o usuario que estava no fim apareceria como
  // "lendo o historico" e a lista deixaria de acompanhar a conversa.
  const isNearBottomRef = useRef(true);
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    isNearBottomRef.current = isNearBottom(el);
  }, []);

  const handleMessageDeleted = useCallback(async (messageId: string) => {
    try {
      await ChatService.deleteMessage(messageId);
    } catch {
      log.error('Failed to mark message as deleted in DB');
    }
  }, []);

  // Opções estáveis: `getItemKey` entra nas deps do memo interno do
  // virtualizer (getMeasurementOptions) — uma função nova a cada render
  // invalida o cache e recalcula todas as medições em cada passe.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const getScrollElement = useCallback(() => scrollContainerRef.current, []);
  const estimateSize = useCallback(() => 100, []);
  const getItemKey = useCallback((index: number) => messagesRef.current[index]?.id ?? index, []);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement,
    estimateSize,
    overscan: 10,
    getItemKey,
  });

  // --- Historico anterior (R2-INB-004) --------------------------------------
  // O fetch vive no hook; aqui so cuidamos do que e responsabilidade da
  // superficie de rolagem: disparar uma vez so e nao deixar a lista pular
  // quando o lote antigo entra por cima.
  const [loadingOlderLocal, setLoadingOlderLocal] = useState(false);
  // A prop `loadingOlderMessages` so chega depois do re-render do pai; um
  // segundo clique antes disso passaria pela guarda da prop. O ref fecha a
  // janela sincrona entre o clique e o primeiro re-render.
  const loadingOlderRef = useRef(false);
  const isLoadingOlder = loadingOlderLocal || Boolean(loadingOlderMessages);

  /**
   * Ancora visual do prepend: o item que estava no topo do viewport e a
   * distancia dele ate a borda (`start - scrollTop`). `firstId` marca se algo
   * realmente entrou acima da lista — sem prepend nao ha o que reancorar.
   */
  const olderAnchorRef = useRef<{ key: string; offset: number; lastTarget?: number; firstId?: string } | null>(null);

  const handleLoadOlderMessages = useCallback(async () => {
    if (!onLoadOlderMessages || !hasOlderMessages) return;
    if (loadingOlderRef.current || loadingOlderMessages) return;

    const el = scrollContainerRef.current;
    const anchorItem = virtualizer.getVirtualItems()[0];
    if (el && anchorItem) {
      olderAnchorRef.current = {
        key: String(anchorItem.key),
        offset: (listRef.current?.offsetTop ?? 0) + anchorItem.start - el.scrollTop,
        firstId: messagesRef.current[0]?.id,
      };
    } else {
      olderAnchorRef.current = null;
    }

    loadingOlderRef.current = true;
    setLoadingOlderLocal(true);
    try {
      await onLoadOlderMessages();
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlderLocal(false);
      // O lote voltou vazio (ou nada entrou acima): sem prepend, descarta a
      // ancora para nao reposicionar o scroll num render futuro.
      const anchor = olderAnchorRef.current;
      if (anchor && messagesRef.current[0]?.id === anchor.firstId) {
        olderAnchorRef.current = null;
      }
    }
  }, [onLoadOlderMessages, hasOlderMessages, loadingOlderMessages, virtualizer]);

  // Reaplica a ancora a cada render enquanto ela estiver pendente: as alturas
  // reais dos itens novos so chegam depois, pelo ResizeObserver, e cada
  // correcao de medida muda o `start` do item-ancora. So assenta (e limpa a
  // ancora) quando o alvo medido para de mudar ou o scroll ja esta nele — dai
  // em diante nenhum render mexe no scroll.
  useLayoutEffect(() => {
    const anchor = olderAnchorRef.current;
    if (!anchor) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    // Nada entrou acima ainda (o lote pode estar em voo): nao tocar no scroll.
    if (messages[0]?.id === anchor.firstId) return;

    const index = messages.findIndex((message) => String(message?.id ?? '') === anchor.key);
    if (index === -1) {
      // A conversa trocou / a mensagem-ancora saiu da lista: nada a preservar.
      olderAnchorRef.current = null;
      return;
    }

    // Medição do item-ancora direto do virtualizer. `getOffsetForIndex` nao
    // serve aqui: ele devolve o offset ja limitado pela area rolavel
    // (scrollHeight - clientHeight), e num ambiente sem layout essa conta
    // colapsa para 0. A measurementsCache traz o `start` medido do item, que e
    // o mesmo numero usado no transform de cada linha. Ancora por item (key do
    // virtualizer), nunca por timestamp: mensagens com timestamp igual nao
    // confundem o alvo.
    const anchorItem = virtualizer.measurementsCache[index];
    if (!anchorItem) return;

    const nextScrollTop = Math.max(
      0,
      (listRef.current?.offsetTop ?? 0) + anchorItem.start - anchor.offset,
    );
    // Assentou: as medidas reais dos itens novos ja chegaram e o alvo parou de
    // mudar (ou o scroll ja esta nele). Dai em diante nenhum render mexe mais
    // no scroll — inclusive quando o navegador limita o scrollTop no fim.
    const assentou =
      Math.abs(el.scrollTop - nextScrollTop) < 1 ||
      (anchor.lastTarget !== undefined && Math.abs(anchor.lastTarget - nextScrollTop) < 1);
    if (assentou) {
      olderAnchorRef.current = null;
      return;
    }
    olderAnchorRef.current = { ...anchor, lastTarget: nextScrollTop };
    el.scrollTop = nextScrollTop;
  });

  useImperativeHandle(ref, () => ({
    scrollToBottom: () => {
      if (!scrollContainerRef.current || messages.length === 0) return;
      // P2 #320 (R2-INB-025): mensagem nova e indicador de digitacao so levam a
      // lista ao fim se o usuario ja estava nele. Quem rolou para ler o
      // historico fica onde esta.
      if (!isNearBottomRef.current) return;
      // behavior:'smooth' nao existe na API do @tanstack/react-virtual v3.x
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
    },
    registerMessageRef: (messageId: string, el: HTMLDivElement | null) => {
      messageRefs.current[messageId] = el;
    },
    scrollToMessage: (messageId: string) => {
      const index = messages.findIndex(m => m.id === messageId);
      if (index !== -1) {
        virtualizer.scrollToIndex(index, { align: 'center' });
      }
    },
  }), [messages, virtualizer]);

  // conversationId é o id do contato: estável por toda a vida da conversa e
  // presente mesmo sem telefone. contactJid vem depois só por compatibilidade;
  // messages[0]?.id é último recurso porque muda em prepend e causa churn.
  const subscriptionKey = conversationId || contactJid || messages[0]?.id;
  const messageIdsSetRef = useRef<Set<string>>(new Set());
  messageIdsSetRef.current = useMemo(
    () => new Set(messages.map((message) => message.id).filter(Boolean)),
    [messages],
  );

  // O canal é por conversa (ancorado em contactJid). O filtro de ids fica em
  // ref para que cada mensagem nova não derrube e recrie a subscription.
  useEffect(() => {
    if (!subscriptionKey) return;

    const channel = RealtimeService.subscribeToReactions(subscriptionKey, (payload) => {
      const nextMessageId = (payload.new as { message_id?: string } | null)?.message_id;
      const prevMessageId = (payload.old as { message_id?: string } | null)?.message_id;
      const reactionMessageId = nextMessageId ?? prevMessageId;

      if (!reactionMessageId || !messageIdsSetRef.current.has(reactionMessageId)) return;

      queryClient.invalidateQueries({ queryKey: ['message-reactions', reactionMessageId] });
    });

    return () => { void RealtimeService.removeChannel(channel); };
  }, [subscriptionKey, queryClient]);

  const showLoadOlder = typeof onLoadOlderMessages === 'function' && hasOlderMessages === true && messages.length > 0;
  const showHistoryStart = hasOlderMessages === false && messages.length > 0;

  return (
    <div ref={scrollContainerRef} onScroll={handleScroll} role="log" aria-label="Mensagens da conversa" aria-live="polite" className="flex-1 min-h-0 min-w-0 overflow-y-auto px-4 py-6 md:px-8 scrollbar-thin bg-transparent relative">
      {showLoadOlder && (
        <div className={cn(OLDER_ROW_CLASS, 'sticky top-0 z-10')} data-testid="older-messages-control">
          <button
            type="button"
            data-testid="load-older-button"
            onClick={() => { void handleLoadOlderMessages(); }}
            disabled={isLoadingOlder}
            aria-busy={isLoadingOlder || undefined}
            className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-muted/40 px-4 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoadingOlder
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              : <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />}
            Carregar mensagens anteriores
          </button>
          {/* Estado de carregamento exposto tambem para leitores de tela. */}
          <span className="sr-only" aria-live="polite" data-testid="older-loading-status">
            {isLoadingOlder ? 'Carregando mensagens anteriores' : ''}
          </span>
        </div>
      )}
      {showHistoryStart && (
        <div className={cn(OLDER_ROW_CLASS, 'sticky top-0 z-10')}>
          <p role="status" data-testid="history-start" className="text-2xs uppercase tracking-wider font-semibold text-muted-foreground/80 bg-muted/50 backdrop-blur-sm px-3 py-1 rounded-full border border-border/30">
            Início do histórico da conversa
          </p>
        </div>
      )}
      <div
        ref={listRef}
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const message = messages[virtualRow.index];
          const prevMsg = messages[virtualRow.index - 1];
          const nextMsg = messages[virtualRow.index + 1];

          const showDateSeparator = !prevMsg || !isSameDay(message.timestamp, prevMsg.timestamp);
          const isFirstInGroup = !prevMsg || prevMsg.sender !== message.sender || showDateSeparator;
          const isLastInGroup = !nextMsg || nextMsg.sender !== message.sender || !isSameDay(message.timestamp, nextMsg.timestamp);

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="py-1"
            >
              {showDateSeparator && (
                <div className="flex justify-center my-5">
                  <motion.span initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-2xs uppercase tracking-wider font-semibold text-muted-foreground/80 bg-muted/50 backdrop-blur-sm px-4 py-1 rounded-full border border-border/30 shadow-sm">
                    {formatDateSeparator(message.timestamp)}
                  </motion.span>
                </div>
              )}

              <MessageBubble
                message={message}
                isFirstInGroup={isFirstInGroup}
                isLastInGroup={isLastInGroup}
                contactAvatar={contactAvatar}
                instanceName={instanceName}
                contactJid={contactJid}
                ttsLoading={ttsLoading}
                ttsPlaying={ttsPlaying}
                ttsMessageId={ttsMessageId}
                highlightedMessageIds={highlightedMessageIds}
                activeHighlightId={activeHighlightId}
                searchQuery={searchQuery}
                onSpeak={onSpeak}
                onStop={onStop}
                onReply={onReply}
                onForward={onForward}
                onCopy={onCopy}
                onScrollToMessage={onScrollToMessage}
                onInteractiveButtonClick={onInteractiveButtonClick}
                onEditStart={onEditStart}
                onMessageDeleted={handleMessageDeleted}
                registerRef={(el) => { messageRefs.current[message.id] = el; }}
              />
            </div>
          );
        })}
      </div>

      <div className="flex justify-start pl-10 mt-4">
        <TypingIndicator isVisible={isContactTyping || isColleagueTyping} userName={typingUserName} />
      </div>
    </div>
  );
}));

ChatMessagesArea.displayName = 'ChatMessagesArea';
