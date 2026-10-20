import type { ConversationTab } from '@/components/inbox/chat/ConversationTabs';

/**
 * Estado da aba central da inbox.
 *
 * `restaurada` marca o valor que veio do `localStorage` e que o usuário **ainda
 * não escolheu** nesta sessão. É a diferença entre "preferência recuperada do
 * reload" e "aba que eu escolhi agora".
 */
export interface TabState {
  contactId: string | null;
  tab: ConversationTab;
  restaurada: boolean;
}

/**
 * Deriva a aba ativa a partir do estado e do contato selecionado.
 *
 * Regra (medida em produção em 03/10, item 6 do S41):
 * - **`restaurada`**: a preferência do `localStorage` vale como padrão da sessão,
 *   inclusive na primeira conversa aberta depois do reload. Antes, ela era ancorada
 *   em `contactId: null` e morria no instante em que o usuário abria qualquer
 *   conversa — a preferência era descartada exatamente quando importava.
 * - **escolha do usuário**: a aba fica ancorada no contato que a escolheu; ao trocar
 *   de conversa o id deixa de bater e o valor volta a `chat`. Esse comportamento é
 *   deliberado (manter "Notas" aberto noutro contato desorienta) e permanece.
 */
export function resolverAbaAtiva(
  tabState: TabState,
  selectedContactId: string | null,
): ConversationTab {
  if (tabState.restaurada) return tabState.tab;
  return tabState.contactId === selectedContactId ? tabState.tab : 'chat';
}
