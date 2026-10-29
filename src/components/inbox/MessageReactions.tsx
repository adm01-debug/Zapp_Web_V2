import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { HOVER_REVEAL, HOVER_REVEAL_TAP } from './hoverActions';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SmilePlus, X } from 'lucide-react';
import { useMessageReactions } from '@/hooks/chat/useMessageReactions';
import type { MessageReaction } from '@/hooks/reactions/types';

const WHATSAPP_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const EXTENDED_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉', '👏', '💯', '✅', '❌'];

/**
 * Uma reação por autor por mensagem (cartão t_fa2f142f, paridade V3 → V2).
 *
 * Reagir com outro emoji enquanto já há uma reação própria TROCA: a antiga sai
 * ANTES de a nova ser gravada (senão a mensagem ficava com duas reações do mesmo
 * atendente). A tela reage na hora (sobreposição otimista) e, se a gravação falha,
 * volta ao estado anterior — inclusive devolvendo a reação antiga que já tinha saído.
 *
 * A sobreposição só vale enquanto a lista de reações do hook é a mesma de quando
 * ela nasceu: assim que o servidor/realtime entrega a lista nova, ela é a verdade.
 */
type Sobreposicao = { base: string; remover: string[]; adicionar: string | null };

const EMPTY_REACTIONS: MessageReaction[] = [];

const assinaturaDe = (reacoes: MessageReaction[]) =>
  reacoes.map((r) => `${r.user_id ?? ''}:${r.emoji}`).join('|');

interface ReacaoUnicaParams {
  reactions: MessageReaction[];
  currentProfileId?: string;
  hasReacted: (emoji: string) => boolean;
  addReaction: (emoji: string) => Promise<unknown>;
  removeReaction: (emoji: string) => Promise<unknown>;
}

function useReacaoUnica({ reactions: reacoesBrutas, currentProfileId, hasReacted, addReaction, removeReaction }: ReacaoUnicaParams) {
  // Mocks/consumidores que não expõem a lista (QuickReactionBar) seguem sem sobreposição.
  const reactions = reacoesBrutas ?? EMPTY_REACTIONS;
  const [sobreposicao, setSobreposicao] = useState<Sobreposicao | null>(null);
  const assinatura = assinaturaDe(reactions);

  const visiveis = useMemo(() => {
    if (!sobreposicao || sobreposicao.base !== assinatura || !currentProfileId) return reactions;
    const restantes = reactions.filter(
      (r) => !(r.user_id === currentProfileId && sobreposicao.remover.includes(r.emoji)),
    );
    const jaTem = restantes.some((r) => r.user_id === currentProfileId && r.emoji === sobreposicao.adicionar);
    if (!sobreposicao.adicionar || jaTem) return restantes;
    const otimista: MessageReaction = {
      id: `otimista-${sobreposicao.adicionar}`,
      message_id: reactions[0]?.message_id ?? '',
      user_id: currentProfileId,
      contact_id: null,
      emoji: sobreposicao.adicionar,
      created_at: new Date(0).toISOString(),
      user_name: 'Você',
    };
    return [...restantes, otimista];
  }, [reactions, sobreposicao, assinatura, currentProfileId]);

  const hasReactedVisivel = (emoji: string) =>
    currentProfileId
      ? visiveis.some((r) => r.user_id === currentProfileId && r.emoji === emoji)
      : hasReacted(emoji);

  /** Resolve quando gravou; rejeita (já desfeito na tela) quando a gravação falhou. */
  const reagir = async (emoji: string) => {
    const minhas = currentProfileId
      ? [...new Set(visiveis.filter((r) => r.user_id === currentProfileId).map((r) => r.emoji))]
      : [];

    if (hasReactedVisivel(emoji)) {
      setSobreposicao({ base: assinatura, remover: [emoji], adicionar: null });
      try {
        await removeReaction(emoji);
      } catch (erro) {
        setSobreposicao(null);
        throw erro;
      }
      return;
    }

    const antigas = minhas.filter((e) => e !== emoji);
    setSobreposicao({ base: assinatura, remover: antigas, adicionar: emoji });
    const removidas: string[] = [];
    try {
      for (const antiga of antigas) {
        await removeReaction(antiga);
        removidas.push(antiga);
      }
      await addReaction(emoji);
    } catch (erro) {
      setSobreposicao(null);
      // A antiga já saiu no servidor: devolve, senão o rollback da tela mentiria.
      for (const antiga of removidas) {
        try {
          await addReaction(antiga);
        } catch {
          /* o hook já avisou da falha; a lista real é refeita pelo servidor */
        }
      }
      throw erro;
    }
  };

  return { visiveis, hasReactedVisivel, reagir };
}

interface MessageReactionsProps {
  messageId: string;
  isSent?: boolean;
  showExtended?: boolean;
  instanceName?: string;
  contactJid?: string;
  externalId?: string;
  senderType?: 'contact' | 'agent';
  refreshKey?: string;
  disableRealtime?: boolean;
}

export function MessageReactions({
  messageId,
  isSent,
  showExtended = false,
  instanceName,
  contactJid,
  externalId,
  senderType,
  refreshKey,
  disableRealtime,
}: MessageReactionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const {
    reactions: reacoesDoHook,
    addReaction,
    removeReaction,
    hasReacted: hasReactedDoHook,
    isReacting,
    currentProfileId,
  } = useMessageReactions(messageId, {
    instanceName,
    contactJid,
    externalId,
    senderType,
    refreshKey,
    disableRealtime,
  });
  const { visiveis: reactions, hasReactedVisivel: hasReacted, reagir } = useReacaoUnica({
    reactions: reacoesDoHook,
    currentProfileId,
    hasReacted: hasReactedDoHook,
    addReaction,
    removeReaction,
  });

  const groupedReactions = reactions.reduce((acc, reaction) => {
    if (!acc[reaction.emoji]) {
      acc[reaction.emoji] = {
        emoji: reaction.emoji,
        count: 0,
        users: [],
        hasCurrentUser: false,
      };
    }

    acc[reaction.emoji].count++;
    acc[reaction.emoji].users.push(reaction.user_name || 'Usuário');

    if (reaction.user_id === currentProfileId) {
      acc[reaction.emoji].hasCurrentUser = true;
    }

    return acc;
  }, {} as Record<string, { emoji: string; count: number; users: string[]; hasCurrentUser: boolean }>);

  const reactionsList = Object.values(groupedReactions);
  const availableReactions = showExtended ? EXTENDED_REACTIONS : WHATSAPP_REACTIONS;

  const handleReact = async (emoji: string) => {
    try {
      await reagir(emoji);

      setIsOpen(false);
    } catch {
      // A rejeição já vira toast pt-BR no hook (`useReactionMutations`); aqui só
      // impedimos a promessa solta e o seletor fica aberto para tentar de novo.
    }
  };

  return (
    <div
      data-testid="message-reactions"
      data-pending={isReacting ? 'true' : 'false'}
      aria-busy={isReacting}
      className={cn('flex items-center gap-1 flex-wrap', isSent ? 'justify-end' : 'justify-start')}
    >
      <TooltipProvider>
        {reactionsList.map((reaction) => (
          <Tooltip key={reaction.emoji}>
            <TooltipTrigger asChild>
              <button
                data-testid="reaction-badge"
                data-emoji={reaction.emoji}
                aria-label={`Reação ${reaction.emoji}: ${reaction.count} ${reaction.count === 1 ? 'reação' : 'reações'}`}
                aria-pressed={reaction.hasCurrentUser}
                disabled={isReacting}
                onClick={() => handleReact(reaction.emoji)}
                className={cn(
                  'flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs',
                  'border transition-all cursor-pointer hover:scale-110 active:scale-90',
                  isReacting && 'opacity-50 cursor-not-allowed',
                  reaction.hasCurrentUser
                    ? 'bg-primary/10 border-primary/30 ring-1 ring-primary/20'
                    : 'bg-muted/80 hover:bg-muted border-border/50'
                )}
              >
                <span className="text-sm">{reaction.emoji}</span>
                {reaction.count > 1 && (
                  <span className={cn(
                    'text-3xs font-medium',
                    reaction.hasCurrentUser ? 'text-primary' : 'text-muted-foreground'
                  )}>
                    {reaction.count}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <div className="max-w-[150px]">
                {reaction.users.slice(0, 5).join(', ')}
                {reaction.users.length > 5 && ` +${reaction.users.length - 5}`}
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </TooltipProvider>

      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            data-testid="reaction-add-button"
            aria-label="Adicionar reação"
            disabled={isReacting}
            className={cn(
              'p-1 rounded-full transition-all hover:scale-110 active:scale-90',
              'hover:bg-muted/80 text-muted-foreground hover:text-foreground',
              isReacting && 'opacity-50 cursor-not-allowed',
              reactionsList.length === 0
                ? HOVER_REVEAL
                : 'opacity-60 hover:opacity-100'
            )}
          >
            <SmilePlus className="w-3.5 h-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          aria-label="Reações"
          className="w-auto p-2 bg-popover"
          align={isSent ? 'end' : 'start'}
          sideOffset={4}
        >
          <div role="group" aria-label="Escolha uma reação" className="flex flex-wrap items-center gap-1 max-w-[200px]">
            {availableReactions.map((emoji) => {
              const userHasReacted = hasReacted(emoji);

              return (
                <motion.button
                  key={emoji}
                  aria-label={`Reagir com ${emoji}`}
                  aria-pressed={userHasReacted}
                  whileHover={{ scale: 1.25 }}
                  whileTap={{ scale: 0.9 }}
                  disabled={isReacting}
                  onClick={() => handleReact(emoji)}
                  className={cn(
                    'p-1.5 rounded-md transition-all text-lg relative',
                    isReacting && 'opacity-50 cursor-not-allowed',
                    userHasReacted
                      ? 'bg-primary/10 ring-1 ring-primary/30'
                      : 'hover:bg-muted'
                  )}
                >
                  {emoji}
                  {userHasReacted && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-primary rounded-full flex items-center justify-center"
                    >
                      <X className="w-2 h-2 text-primary-foreground" />
                    </motion.div>
                  )}
                </motion.button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

interface QuickReactionBarProps {
  messageId: string;
  isSent?: boolean;
  instanceName?: string;
  contactJid?: string;
  externalId?: string;
  senderType?: 'contact' | 'agent';
  refreshKey?: string;
  disableRealtime?: boolean;
}

export function QuickReactionBar({
  messageId,
  isSent,
  instanceName,
  contactJid,
  externalId,
  senderType,
  refreshKey,
  disableRealtime,
}: QuickReactionBarProps) {
  const [showPicker, setShowPicker] = useState(false);
  const {
    reactions,
    addReaction,
    removeReaction,
    hasReacted: hasReactedDoHook,
    isReacting,
    currentProfileId,
  } = useMessageReactions(messageId, {
    instanceName,
    contactJid,
    externalId,
    senderType,
    refreshKey,
    disableRealtime,
  });
  const { hasReactedVisivel: hasReacted, reagir } = useReacaoUnica({
    reactions,
    currentProfileId,
    hasReacted: hasReactedDoHook,
    addReaction,
    removeReaction,
  });

  const handleReact = async (emoji: string) => {
    try {
      await reagir(emoji);
      setShowPicker(false);
    } catch {
      // A rejeição já vira toast pt-BR no hook (`useReactionMutations`); aqui só
      // impedimos a promessa solta e o seletor fica aberto para tentar de novo.
    }
  };

  return (
    <div
      data-testid="quick-reaction-bar"
      data-profile-ready={currentProfileId ? 'true' : 'false'}
      data-pending={isReacting ? 'true' : 'false'}
      aria-busy={isReacting}
      className={cn(
        `absolute -top-9 flex items-center ${HOVER_REVEAL_TAP} transition-all duration-200 z-20`,
        showPicker && 'opacity-100',
        isSent ? 'right-0' : 'left-0'
      )}
    >
      <motion.div
        initial={{ opacity: 0, y: 4, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.12 }}
        className="flex items-center gap-0.5 px-1.5 py-1 rounded-full bg-card/95 dark:bg-[hsl(var(--card)/0.95)] border border-border/40 shadow-lg backdrop-blur-sm"
      >
        {WHATSAPP_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            data-testid="quick-reaction-emoji"
            data-emoji={emoji}
            aria-label={`Reagir com ${emoji}`}
            aria-pressed={hasReacted(emoji)}
            disabled={isReacting}
            onClick={() => handleReact(emoji)}
            className={cn(
              'w-7 h-7 flex items-center justify-center rounded-full hover:bg-muted/80 hover:scale-125 transition-all text-base',
              isReacting && 'opacity-50 cursor-not-allowed',
              hasReacted(emoji) && 'bg-primary/10 ring-1 ring-primary/30'
            )}
          >
            {emoji}
          </button>
        ))}

        <Popover open={showPicker} onOpenChange={setShowPicker}>
          <PopoverTrigger asChild>
            <button
              data-testid="quick-reaction-more"
              aria-label="Mais reações"
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-muted/80 transition-all text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:min-w-[44px] [@media(pointer:coarse)]:min-h-[44px]"
            >
              <SmilePlus className="w-4 h-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            aria-label="Reações"
            className="w-auto p-2 bg-popover"
            align={isSent ? 'end' : 'start'}
            sideOffset={4}
          >
            <div role="group" aria-label="Escolha uma reação" className="flex flex-wrap items-center gap-1 max-w-[220px]">
              {EXTENDED_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  aria-label={`Reagir com ${emoji}`}
                  aria-pressed={hasReacted(emoji)}
                  onClick={() => handleReact(emoji)}
                  className={cn(
                    'w-8 h-8 flex items-center justify-center rounded-md text-lg hover:bg-muted transition-all hover:scale-110',
                    hasReacted(emoji) && 'bg-primary/10 ring-1 ring-primary/30'
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </motion.div>
    </div>
  );
}
