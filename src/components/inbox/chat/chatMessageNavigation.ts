import { createContext, useContext } from 'react';

/**
 * Ponte entre a aba Arquivos ("Ver na conversa") e o painel do Chat.
 *
 * O Chat é montado pelo PAI como `children` do `ConversationTabContent` e fica escondido (nunca
 * desmontado), então a aba Arquivos não tem como segurar uma `ref` nele. O `ChatPanel` registra
 * aqui o próprio "rolar até a mensagem" (é ele quem conhece o `ChatMessagesArea`) e o
 * `ConversationTabContent` — que conhece a aba ativa e a lista de mensagens — troca para a aba
 * Chat e aciona a rolagem.
 *
 * Módulo-folha de propósito (só depende de `react`): assim o `ChatPanel` NÃO passa a importar a
 * árvore da aba Arquivos só por causa desta ponte, e os testes que mockam o
 * `ConversationTabContent` continuam válidos.
 */
export interface ChatMessageNavigation {
  registerScrollToMessage: (handler: ((messageId: string) => void) | null) => void;
}

export const ChatMessageNavigationContext = createContext<ChatMessageNavigation | null>(null);

/** Leitura da ponte; `null` fora do `ConversationTabContent` (ex.: ChatPanel isolado). */
export function useChatMessageNavigation(): ChatMessageNavigation | null {
  return useContext(ChatMessageNavigationContext);
}
