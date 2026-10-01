import { useState, useCallback } from 'react';
import { MOBILE_BREAKPOINT } from '@/hooks/ui/use-mobile';
import type { ConversationTab } from '@/components/inbox/chat/ConversationTabs';

/**
 * Etapa 73 — a fusão Lembretes→Tarefas removeu a aba `reminders`. Quem tinha a
 * aba Lembretes guardada (localStorage) precisa cair em Tarefas, nunca numa aba
 * que deixou de existir. Aba desconhecida cai em 'chat'.
 */
const TAB_REDIRECTS: Record<string, ConversationTab> = { reminders: 'tasks' };

const VALID_TABS: readonly ConversationTab[] =
  ['chat', 'ia', 'crm', 'orders', 'tasks', 'notes', 'files', 'history'];

export const CONVERSATION_TAB_STORAGE_KEY = 'zapp:inbox:conversation-tab';

export function normalizeConversationTab(value: unknown): ConversationTab {
  if (typeof value !== 'string') return 'chat';
  const redirecionada = TAB_REDIRECTS[value];
  if (redirecionada) return redirecionada;
  return (VALID_TABS as readonly string[]).includes(value) ? (value as ConversationTab) : 'chat';
}

function readPersistedConversationTab(): ConversationTab {
  if (typeof window === 'undefined') return 'chat';
  try {
    return normalizeConversationTab(window.localStorage.getItem(CONVERSATION_TAB_STORAGE_KEY));
  } catch {
    return 'chat';
  }
}

// No celular o painel de detalhes começa fechado: abrir sozinho ao entrar em
// qualquer conversa tampava o chat inteiro até o agente fechar manualmente.
// Checagem síncrona de largura no valor inicial (em vez de useIsMobile(), que
// só atualiza depois do primeiro efeito) evita esse primeiro render errado.
function defaultShowDetails() {
  if (typeof window === 'undefined') return true;
  return window.innerWidth >= MOBILE_BREAKPOINT;
}

export function useInboxUIState() {
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(defaultShowDetails);
  const [pipContact, setPipContact] = useState<{ name: string; avatar?: string; lastMessage?: string; contactId: string } | null>(null);
  const [pendingContactId, setPendingContactId] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [showNewConversation, setShowNewConversation] = useState(false);
  // Aba ativa persistida (etapa 73). Lida já normalizada: uma aba `reminders`
  // guardada de antes da fusão nasce como `tasks`.
  const [conversationTab, setConversationTabState] = useState<ConversationTab>(readPersistedConversationTab);

  const toggleDetails = useCallback(() => setShowDetails(prev => !prev), []);
  const toggleSound = useCallback(() => setSoundOn(prev => !prev), []);
  const toggleSearch = useCallback(() => setGlobalSearchOpen(prev => !prev), []);
  const setConversationTab = useCallback((tab: ConversationTab) => {
    setConversationTabState(tab);
    try { window.localStorage.setItem(CONVERSATION_TAB_STORAGE_KEY, tab); } catch { /* storage unavailable */ }
  }, []);

  return {
    selectedContactId, setSelectedContactId,
    showDetails, setShowDetails, toggleDetails,
    pipContact, setPipContact,
    pendingContactId, setPendingContactId,
    soundOn, setSoundOn, toggleSound,
    globalSearchOpen, setGlobalSearchOpen, toggleSearch,
    showNewConversation, setShowNewConversation,
    conversationTab, setConversationTab,
  };
}
