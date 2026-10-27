import { useEffect, useMemo, useState } from 'react';
import { MessageSquare, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ConversationEmptyState } from '@/components/shared/ConversationEmptyState';
import { useCustomShortcuts } from '@/hooks/ui/useCustomShortcuts';
import { listarAtalhosEditaveis } from '@/hooks/shortcuts/defaultShortcuts';

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
 * t_16e19364 — a tela vazia também ganha:
 *  - a ação "Nova conversa" (`onNewConversation`; o modal mora na view, o vazio só
 *    pede para abrir — sem o callback não existe botão morto);
 *  - os contadores REAIS recebidos (`waitingCount`/`unreadCount`, os mesmos
 *    `chipCounts` da lista; zero continua aparecendo, nada é recalculado aqui);
 *  - a tecla certa por sistema (⌘ no Mac, Ctrl nos demais);
 *  - entrada discreta só quando o sistema permite movimento.
 */
const INBOX_EMPTY_SHORTCUT_IDS = ['prev-conversation', 'next-conversation', 'global-search'];

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Preferência de movimento do sistema, acompanhando mudanças em tempo de execução. */
function usePrefersReducedMotion(): boolean {
  const [reduzido, setReduzido] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(REDUCED_MOTION_QUERY)?.matches,
  );
  useEffect(() => {
    const consulta = window.matchMedia?.(REDUCED_MOTION_QUERY);
    if (!consulta) return;
    const aoMudar = (evento: MediaQueryListEvent) => setReduzido(evento.matches);
    consulta.addEventListener?.('change', aoMudar);
    return () => consulta.removeEventListener?.('change', aoMudar);
  }, []);
  return reduzido;
}

/** Mac/iOS usam ⌘ onde as demais plataformas usam Ctrl (a busca global aceita as duas). */
function isApplePlatform(): boolean {
  return typeof navigator !== 'undefined' && /mac|iphone|ipad|ipod/i.test(navigator.platform ?? '');
}

interface InboxEmptyChatProps {
  /** Conversas aguardando (o `chipCounts.waiting` da lista). */
  waitingCount?: number;
  /** Conversas não lidas (o `chipCounts.unread` da lista). */
  unreadCount?: number;
  /** Abre o modal de nova conversa (mora na `RealtimeInboxView`). */
  onNewConversation?: () => void;
}

export function InboxEmptyChat({ waitingCount, unreadCount, onNewConversation }: InboxEmptyChatProps = {}) {
  const { shortcuts, formatShortcut } = useCustomShortcuts();
  const reduzido = usePrefersReducedMotion();
  const apple = isApplePlatform();

  const atalhos = useMemo(
    () => listarAtalhosEditaveis(shortcuts).filter((shortcut) => INBOX_EMPTY_SHORTCUT_IDS.includes(shortcut.id)),
    [shortcuts],
  );

  return (
    <ConversationEmptyState
      icon={MessageSquare}
      title="Selecione uma conversa"
      description="Escolha uma conversa na lista ao lado para visualizar e responder mensagens"
      className="bg-inbox-panel overflow-hidden"
      action={
        <div
          data-testid="inbox-empty-actions"
          className={cn(
            'flex flex-col items-center gap-4',
            !reduzido && 'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500',
          )}
        >
          {onNewConversation && (
            <Button type="button" onClick={onNewConversation} className="gap-2">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nova conversa
            </Button>
          )}
          {(waitingCount !== undefined || unreadCount !== undefined) && (
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {waitingCount !== undefined && (
                <span data-testid="inbox-empty-waiting">{waitingCount} aguardando</span>
              )}
              {unreadCount !== undefined && (
                <span data-testid="inbox-empty-unread">
                  {unreadCount} {unreadCount === 1 ? 'não lida' : 'não lidas'}
                </span>
              )}
            </div>
          )}
          {atalhos.length > 0 && (
            <div
              data-testid="inbox-empty-shortcuts"
              className="flex flex-col items-center gap-2"
            >
              <span className="text-xs font-medium text-muted-foreground">Atalhos do teclado</span>
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
                {atalhos.map((shortcut) => {
                  const keys = formatShortcut(shortcut).map((tecla) => (apple && tecla === 'Ctrl' ? '⌘' : tecla));
                  return (
                    <div key={shortcut.id} className="flex items-center gap-1.5">
                      {keys.map((key, index) => (
                        <span key={`${shortcut.id}-${index}`} className="flex items-center gap-1">
                          <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-foreground shadow-sm">
                            {key}
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
          )}
        </div>
      }
    />
  );
}
