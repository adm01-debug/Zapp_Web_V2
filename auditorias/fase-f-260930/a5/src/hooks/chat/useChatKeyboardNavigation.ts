import { useEffect, useCallback, useState } from 'react';

interface UseChatKeyboardNavigationProps {
  messagesCount: number;
  enabled?: boolean;
  onReplyToMessage?: (index: number) => void;
  onReactToMessage?: (index: number) => void;
  onSendMessage?: () => void;
  inputRef?: React.RefObject<HTMLTextAreaElement>;
}

export function useChatKeyboardNavigation({
  messagesCount,
  enabled = true,
  onReplyToMessage,
  onReactToMessage,
  onSendMessage,
  inputRef,
}: UseChatKeyboardNavigationProps) {
  const [selectedMessageIndex, setSelectedMessageIndex] = useState<number | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;
    
    const target = event.target as HTMLElement;
    const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
    
    // Cmd/Ctrl + Enter to send (works even in input)
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      onSendMessage?.();
      return;
    }

    // If typing in input, don't trigger navigation shortcuts
    if (isInputFocused && !event.ctrlKey && !event.metaKey) {
      // Escape exits input focus and enters navigation mode
      if (event.key === 'Escape') {
        event.preventDefault();
        (target as HTMLElement).blur();
        setIsNavigating(true);
        setSelectedMessageIndex(messagesCount - 1);
      }
      return;
    }

    // Navigation mode shortcuts
    switch (event.key) {
      case 'ArrowUp':
      case 'k':
        event.preventDefault();
        setIsNavigating(true);
        setSelectedMessageIndex((prev) => {
          if (prev === null) return messagesCount - 1;
          return Math.max(0, prev - 1);
        });
        break;
        
      case 'ArrowDown':
      case 'j':
        event.preventDefault();
        setIsNavigating(true);
        setSelectedMessageIndex((prev) => {
          if (prev === null) return 0;
          return Math.min(messagesCount - 1, prev + 1);
        });
        break;
        
      case 'r':
      case 'R':
        if (selectedMessageIndex !== null && isNavigating) {
          event.preventDefault();
          onReplyToMessage?.(selectedMessageIndex);
        }
        break;
        
      case 'e':
      case 'E':
        if (selectedMessageIndex !== null && isNavigating) {
          event.preventDefault();
          onReactToMessage?.(selectedMessageIndex);
        }
        break;
        
      case '/':
        // Focus input
        event.preventDefault();
        setIsNavigating(false);
        setSelectedMessageIndex(null);
        inputRef?.current?.focus();
        break;
        
      case 'Escape':
        // Exit navigation mode
        setIsNavigating(false);
        setSelectedMessageIndex(null);
        break;
        
      case 'Home':
        event.preventDefault();
        setIsNavigating(true);
        setSelectedMessageIndex(0);
        break;
        
      case 'End':
        event.preventDefault();
        setIsNavigating(true);
        setSelectedMessageIndex(messagesCount - 1);
        break;
    }
  }, [enabled, messagesCount, selectedMessageIndex, isNavigating, onReplyToMessage, onReactToMessage, onSendMessage, inputRef]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Reset selection when messages change
  useEffect(() => {
    if (selectedMessageIndex !== null && selectedMessageIndex >= messagesCount) {
      setSelectedMessageIndex(messagesCount - 1);
    }
  }, [messagesCount, selectedMessageIndex]);

  const exitNavigationMode = useCallback(() => {
    setIsNavigating(false);
    setSelectedMessageIndex(null);
  }, []);

  return {
    selectedMessageIndex,
    isNavigating,
    exitNavigationMode,
    setSelectedMessageIndex,
  };
}

export const chatKeyboardShortcuts = [
  { key: '↑/↓ or j/k', description: 'Navegar entre mensagens' },
  { key: 'R', description: 'Responder mensagem selecionada' },
  { key: 'E', description: 'Adicionar reação' },
  { key: '/', description: 'Focar no campo de mensagem' },
  { key: 'Cmd+Enter', description: 'Enviar mensagem' },
  { key: 'Esc', description: 'Sair do modo navegação' },
  { key: 'Home/End', description: 'Ir para primeira/última mensagem' },
];
