import React, { useEffect, useState, createContext, useContext, useCallback, useRef, Suspense } from 'react';
import { useGlobalKeyboardShortcuts } from '@/hooks/ui/useGlobalKeyboardShortcuts';
import { lazyWithRetry } from '@/lib/lazyWithRetry';

// O palette do ⌘K (com os hooks de dados de catalogo e Talk X) e carregado em
// lazy: so baixa na primeira vez que o usuario abre o ⌘K, fora do chunk de entrada.
const CommandPaletteHost = lazyWithRetry(() =>
  import('./CommandPaletteHost').then((m) => ({ default: m.CommandPaletteHost }))
);

// Etapa 84: o painel de ajuda tambem sai do chunk de entrada — e junto dele vao os
// rotulos dos 7 atalhos de Tarefas (`taskShortcutLabels`).
const KeyboardShortcutsDialog = lazyWithRetry(() =>
  import('./KeyboardShortcutsDialog').then((m) => ({ default: m.KeyboardShortcutsDialog }))
);

/**
 * Etapa 84: o painel de ajuda saiu do grafo de entrada.
 *
 * Ele só existe quando o usuário pede (`?`, Ctrl+/ ou o atalho "Ajuda de
 * atalhos" das Tarefas) e é junto dele que chegam os rótulos dos 7 atalhos de
 * Tarefas (`taskShortcutLabels`) — manter tudo isso no chunk de entrada
 * estourava o budget `initial-js` de 340 KB. O registry de teclado continua
 * eager: só a UI do painel virou chunk sob demanda.
 */
const KeyboardShortcutsDialog = lazy(() =>
  import('./KeyboardShortcutsDialog').then((mod) => ({ default: mod.KeyboardShortcutsDialog })),
);

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
  const [showHelp, setShowHelp] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [paletteMounted, setPaletteMounted] = useState(false);
  const navigationHandlerRef = useRef<((view: string) => void) | null>(null);

  // Monta o palette lazy só na primeira abertura do ⌘K (depois fica montado para
  // preservar a animação de saída do Dialog).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- monta o lazy na 1ª abertura e o mantém montado (animação de saída do Dialog).
    if (showCommandPalette) setPaletteMounted(true);
  }, [showCommandPalette]);

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
      {showHelp && (
        <Suspense fallback={null}>
          <KeyboardShortcutsDialog open={showHelp} onOpenChange={setShowHelp} />
        </Suspense>
      )}
      {paletteMounted && (
        <Suspense fallback={null}>
          <CommandPaletteHost
            open={showCommandPalette}
            onOpenChange={setShowCommandPalette}
            onNavigate={handleNavigate}
          />
        </Suspense>
      )}
    </GlobalKeyboardContext.Provider>
  );
}
