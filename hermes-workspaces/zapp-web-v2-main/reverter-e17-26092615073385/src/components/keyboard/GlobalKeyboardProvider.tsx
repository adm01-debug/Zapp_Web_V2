import React, { useEffect, useState, createContext, useContext, useCallback, useRef } from 'react';
import { useGlobalKeyboardShortcuts } from '@/hooks/ui/useGlobalKeyboardShortcuts';
import { useCatalogQuickSearch } from '@/hooks/integrations/useCatalogQuickSearch';
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog';
import { CommandPalette } from '@/components/ui/command-palette';

interface GlobalKeyboardContextType {
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  registerNavigationHandler: (handler: (view: string) => void) => void;
  unregisterNavigationHandler: () => void;
}

const GlobalKeyboardContext = createContext<GlobalKeyboardContextType | null>(null);

export const useGlobalKeyboard = () => {
  const context = useContext(GlobalKeyboardContext);
  if (!context) {
    // Return a no-op version when outside provider
    return {
      openCommandPalette: () => {},
      closeCommandPalette: () => {},
      registerNavigationHandler: () => {},
      unregisterNavigationHandler: () => {},
    };
  }
  return context;
};

interface GlobalKeyboardProviderProps {
  children: React.ReactNode;
  customActions?: { id: string; action: () => void }[];
}

export function GlobalKeyboardProvider({ children, customActions }: GlobalKeyboardProviderProps) {
  const searchCatalogProducts = useCatalogQuickSearch();
  const [showHelp, setShowHelp] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const navigationHandlerRef = useRef<((view: string) => void) | null>(null);

  // Initialize global shortcuts
  useGlobalKeyboardShortcuts([
    ...(customActions || []),
    {
      id: 'show-shortcuts-help',
      action: () => setShowHelp(true),
    },
    {
      id: 'open-command-palette',
      action: () => setShowCommandPalette(true),
    },
  ]);

  // Listen for custom events
  useEffect(() => {
    const handleShowHelp = () => setShowHelp(true);
    const handleOpenPalette = () => setShowCommandPalette(true);
    
    document.addEventListener('show-shortcuts-help', handleShowHelp);
    document.addEventListener('open-command-palette', handleOpenPalette);
    return () => {
      document.removeEventListener('show-shortcuts-help', handleShowHelp);
      document.removeEventListener('open-command-palette', handleOpenPalette);
    };
  }, []);

  // Add keyboard shortcuts: ? for help, Cmd+K for command palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // ? for help (only when not in input)
      if (e.key === '?' && e.shiftKey && !isInput) {
        e.preventDefault();
        setShowHelp(true);
        return;
      }

      // Cmd/Ctrl + K for command palette (works everywhere)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleNavigate = useCallback((view: string) => {
    if (navigationHandlerRef.current) {
      navigationHandlerRef.current(view);
    }
    setShowCommandPalette(false);
  }, []);

  const registerNavigationHandler = useCallback((handler: (view: string) => void) => {
    navigationHandlerRef.current = handler;
  }, []);

  const unregisterNavigationHandler = useCallback(() => {
    navigationHandlerRef.current = null;
  }, []);

  const contextValue: GlobalKeyboardContextType = {
    openCommandPalette: () => setShowCommandPalette(true),
    closeCommandPalette: () => setShowCommandPalette(false),
    registerNavigationHandler,
    unregisterNavigationHandler,
  };

  return (
    <GlobalKeyboardContext.Provider value={contextValue}>
      {children}
      <KeyboardShortcutsDialog open={showHelp} onOpenChange={setShowHelp} />
      <CommandPalette
        open={showCommandPalette}
        onOpenChange={setShowCommandPalette}
        onNavigate={handleNavigate}
        onSearch={searchCatalogProducts}
        placeholder="Buscar ou digitar comando... (⌘K)"
      />
    </GlobalKeyboardContext.Provider>
  );
}
