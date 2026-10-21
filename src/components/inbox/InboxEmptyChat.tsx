
import { useMemo } from 'react';
import { motion, MotionConfig, useReducedMotion } from 'framer-motion';
import { MessageSquare } from 'lucide-react';

import { ConversationEmptyState } from '@/components/shared/ConversationEmptyState';
import { Button } from '@/components/ui/button';
import { useCustomShortcuts } from '@/hooks/ui/useCustomShortcuts';
import { listarAtalhosEditaveis } from '@/hooks/shortcuts/defaultShortcuts';
import { cn } from '@/lib/utils';


/**
 * Atalhos que fazem sentido para quem ainda não escolheu uma conversa: abrir a
 * busca global (e, quando tiverem executor, navegar pela lista com Alt+↑/↓).
 * Os rótulos e as teclas vêm do `useCustomShortcuts`, então refletem o
 * remapeamento feito em Configurações → Atalhos (nada de `kbd` fixo que mente
 * depois).
 *
 * `listarAtalhosEditaveis` (t_3d996237) corta o que não tem executor: hoje
 * `prev-conversation`/`next-conversation` (Alt+↑/↓) não são executados por
 * ninguém, então a barra mostra só o que a pessoa pode apertar de verdade.
 *
 * As dicas entram pelo slot `action` do `ConversationEmptyState` de propósito:
 * o componente compartilhado (decisão t_fced78b2) continua sem atalhos — quem
 * tem contexto do Inbox é que os monta.
 *
 * Movimento (fa2): a entrada do cartão e os três pontos orbitais são
 * framer-motion de verdade com gating explícito em `useReducedMotion` — o
 * `reducedMotion` do framer-motion NÃO corta laços de opacidade, por isso os
 * laços (pontos com `repeat: Infinity`) só são montados sem a preferência.
 * Com `prefers-reduced-motion: reduce` o cartão nasce no estado final
 * (`initial={false}`) e os pontos viram `div`s estáticas, sem estilo inline
 * de animação. O `MotionConfig reducedMotion="user"` cobre o resto.
 */
const INBOX_EMPTY_SHORTCUT_IDS = ['prev-conversation', 'next-conversation', 'global-search'];


export interface InboxEmptyChatProps {
  /** Abre o modal de nova conversa (a `RealtimeInboxView` liga ao `setShowNewConversation`). */
  onNewConversation?: () => void;
  /** Aguardando (mesmo número dos chips da lista — a tela vazia não recalcula). */
  waitingCount?: number;
  /** Não lidas (mesmo número dos chips da lista, com flexão de singular). */
  unreadCount?: number;
}

export function InboxEmptyChat({ onNewConversation, waitingCount, unreadCount }: InboxEmptyChatProps = {}) {
  const { shortcuts, formatShortcut } = useCustomShortcuts();
  // O hook do framer-motion congela a preferência no primeiro mount do módulo
  // (cache interno) — a leitura direta cobre stubs tardios de `matchMedia` e
  // garante o gating mesmo quando o hook ainda enxerga o valor antigo. Em
  // divergência transitória, erra para o lado de reduzir (o lado seguro).
  const reduzidoHook = useReducedMotion() ?? false;
  const reduzidoMatchMedia =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  const reduzido = reduzidoHook || reduzidoMatchMedia;
  const ehMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform ?? '');


  const atalhos = useMemo(
    () => listarAtalhosEditaveis(shortcuts).filter((shortcut) => INBOX_EMPTY_SHORTCUT_IDS.includes(shortcut.id)),
    [shortcuts],
  );

  return (

    <MotionConfig reducedMotion="user">
      <motion.div
        className="text-center"
        initial={reduzido ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduzido ? 0 : 0.4 }}
      >
        {/* Pontos orbitais decorativos: laço infinito só sem a preferência. */}
        <div className="w-28 relative mx-auto h-8" aria-hidden="true">
          {reduzido ? (
            <>
              <div className="absolute left-0 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary/40" />
              <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/60" />
              <div className="absolute right-0 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary/40" />
            </>
          ) : (
            <>
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className={
                    i === 0
                      ? 'absolute left-0 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary/40'
                      : i === 1
                        ? 'absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/60'
                        : 'absolute right-0 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary/40'
                  }
                  animate={{ opacity: [0.25, 1, 0.25], scale: [0.8, 1.2, 0.8] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.2 }}
                />
              ))}
            </>
          )}
        </div>

        <ConversationEmptyState
          icon={MessageSquare}
          title="Selecione uma conversa"
          description="Escolha uma conversa na lista ao lado para visualizar e responder mensagens"
          className="bg-inbox-panel overflow-hidden"
          action={
            <div
              data-testid="inbox-empty-actions"
              className={
                reduzido
                  ? 'flex flex-col items-center gap-3'
                  : 'flex flex-col items-center gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300'
              }
            >
              {onNewConversation && (
                <Button onClick={onNewConversation}>Nova conversa</Button>
              )}
              {(waitingCount !== undefined || unreadCount !== undefined) && (
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {waitingCount !== undefined && (
                    <span data-testid="inbox-empty-waiting">{waitingCount} aguardando</span>
                  )}
                  {unreadCount !== undefined && (
                    <span data-testid="inbox-empty-unread">
                      {unreadCount} não lida{unreadCount === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
              )}
              {atalhos.length > 0 ? (
                <div
                  data-testid="inbox-empty-shortcuts"
                  className="flex flex-col items-center gap-2"
                >
                  <span className="text-xs font-medium text-muted-foreground">Atalhos do teclado</span>
                  <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
                    {atalhos.map((shortcut) => {
                      const keys = formatShortcut(shortcut);
                      return (
                        <div key={shortcut.id} className="flex items-center gap-1.5">
                          {keys.map((key, index) => (
                            <span key={`${shortcut.id}-${index}`} className="flex items-center gap-1">
                              <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-foreground shadow-sm">
                                {key === 'Ctrl' && ehMac ? '⌘' : key}
                              </kbd>
                              {index < keys.length - 1 && (
                                <span className="text-[10px] text-muted-foreground">+</span>
                              )}
                            </span>
                          ))}
                          <span className="text-xs text-muted-foreground">{shortcut.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : undefined}
            </div>
          }
        />
      </motion.div>
    </MotionConfig>

  );
}
