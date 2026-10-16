import { useEffect, useMemo, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
 */
const INBOX_EMPTY_SHORTCUT_IDS = ['prev-conversation', 'next-conversation', 'global-search'];

interface InboxEmptyChatProps {
  waitingCount?: number;
  unreadCount?: number;
  onNewConversation?: () => void;
}

export function InboxEmptyChat({ waitingCount, unreadCount, onNewConversation }: InboxEmptyChatProps) {
  const { shortcuts, formatShortcut } = useCustomShortcuts();
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

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
        <div data-testid="inbox-empty-actions" className={`flex flex-col items-center gap-4 ${reducedMotion ? '' : 'motion-safe:animate-in motion-safe:fade-in'}`}>
          {onNewConversation && <Button onClick={onNewConversation}>Nova conversa</Button>}
          {(waitingCount !== undefined || unreadCount !== undefined) && (
            <div className="flex flex-wrap justify-center gap-3 text-sm text-muted-foreground">
              {waitingCount !== undefined && <span data-testid="inbox-empty-waiting">{waitingCount} aguardando</span>}
              {unreadCount !== undefined && <span data-testid="inbox-empty-unread">{unreadCount} {unreadCount === 1 ? 'não lida' : 'não lidas'}</span>}
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
                // A busca global aceita Ctrl ou Meta; o restante mantém o
                // binding remapeado exibido pelo registry.
                const keys = formatShortcut(shortcut).map((key) =>
                  shortcut.id === 'global-search' && key === 'Ctrl' && /Mac|iPhone|iPad/.test(navigator.platform)
                    ? '⌘' : key);
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
