
import { useEffect, useMemo, useState } from 'react';
import { MessageSquare, MessageSquarePlus } from 'lucide-react';

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
 */
const INBOX_EMPTY_SHORTCUT_IDS = ['prev-conversation', 'next-conversation', 'global-search'];


/**
 * Plataforma do sistema. `userAgentData` é o caminho novo (Chromium);
 * `navigator.platform` cobre o resto.
 */
function plataformaDoSistema(): string {
  if (typeof navigator === 'undefined') return '';
  const dados = navigator as Navigator & { userAgentData?: { platform?: string } };
  return dados.userAgentData?.platform ?? navigator.platform ?? '';
}

/**
 * No Mac o modificador se escreve ⌘ — e a tecla é a mesma: o handler da busca
 * global (`useGlobalSearchShortcut`) aceita `ctrlKey` OU `metaKey`. Sem isso a
 * dica mandaria procurar a tecla "Ctrl" num teclado que só tem ⌘.
 */
function rotuloDaTecla(tecla: string, plataforma: string): string {
  if (tecla !== 'Ctrl') return tecla;
  return /mac|iphone|ipad|ipod/i.test(plataforma) ? '⌘' : 'Ctrl';
}

/**
 * Preferência do sistema por menos movimento — mesma semântica do
 * `useReducedMotion` do framer-motion, mas sem importar aquele módulo: ele é
 * mockado apenas com `AnimatePresence` no teste compartilhado do
 * `ConversationEmptyState` (arquivo de outro cartão) e importar o hook de lá
 * quebraria aquela suíte. O valor inicial já sai correto no primeiro render
 * (o jsdom responde pelo stub de `src/test/setup.ts`), então o efeito só escuta
 * a mudança de preferência com a aba aberta.
 */
function useMovimentoReduzido(): boolean {
  const [reduzido, setReduzido] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const consulta = window.matchMedia('(prefers-reduced-motion: reduce)');
    const aoMudar = () => setReduzido(consulta.matches);
    consulta.addEventListener('change', aoMudar);
    return () => consulta.removeEventListener('change', aoMudar);
  }, []);

  return reduzido;
}

/** Contagem em pt-BR: "1 não lida" / "3 não lidas". "aguardando" é invariável. */
function rotuloNaoLidas(total: number): string {
  return `${total} ${total === 1 ? 'não lida' : 'não lidas'}`;
}

export interface InboxEmptyChatProps {
  /** Conversas aguardando atendimento — o MESMO número do chip da lista. */
  waitingCount?: number;
  /** Conversas com mensagem não lida — o MESMO número do chip da lista. */
  unreadCount?: number;
  /** Abre o `NewConversationModal`, que é montado pela `RealtimeInboxView`. */
  onNewConversation?: () => void;
}

export function InboxEmptyChat({
  waitingCount = 0,
  unreadCount = 0,
  onNewConversation,
}: InboxEmptyChatProps) {
  const { shortcuts, formatShortcut } = useCustomShortcuts();
  const movimentoReduzido = useMovimentoReduzido();
  const plataforma = plataformaDoSistema();


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
            'flex w-full flex-col items-center gap-5',
            // Entrada discreta e só para quem não pediu menos movimento: a classe
            // `motion-safe:` já embute o `prefers-reduced-motion` no CSS e o
            // estado abaixo evita montar a classe quando a preferência é "reduce".
            !movimentoReduzido &&
              'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200',
          )}
        >
          {onNewConversation && (
            <Button type="button" size="sm" onClick={onNewConversation}>
              <MessageSquarePlus aria-hidden="true" />
              Nova conversa
            </Button>
          )}

          <p
            data-testid="inbox-empty-counters"
            className="flex items-center gap-2 text-xs text-muted-foreground"

          >
            <span data-testid="inbox-empty-waiting">{waitingCount} aguardando</span>
            <span aria-hidden="true">·</span>
            <span data-testid="inbox-empty-unread">{rotuloNaoLidas(unreadCount)}</span>
          </p>

          {atalhos.length > 0 && (
            <div data-testid="inbox-empty-shortcuts" className="flex flex-col items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Atalhos do teclado</span>
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
                {atalhos.map((shortcut) => {
                  const keys = formatShortcut(shortcut).map((key) =>
                    rotuloDaTecla(key, plataforma),
                  );
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
