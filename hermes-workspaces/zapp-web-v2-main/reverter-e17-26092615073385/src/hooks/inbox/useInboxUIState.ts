import { useState, useCallback } from 'react';
import { MOBILE_BREAKPOINT } from '@/hooks/ui/use-mobile';

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

  const toggleDetails = useCallback(() => setShowDetails(prev => !prev), []);
  const toggleSound = useCallback(() => setSoundOn(prev => !prev), []);
  const toggleSearch = useCallback(() => setGlobalSearchOpen(prev => !prev), []);

  return {
    selectedContactId, setSelectedContactId,
    showDetails, setShowDetails, toggleDetails,
    pipContact, setPipContact,
    pendingContactId, setPendingContactId,
    soundOn, setSoundOn, toggleSound,
    globalSearchOpen, setGlobalSearchOpen, toggleSearch,
    showNewConversation, setShowNewConversation,
  };
}
