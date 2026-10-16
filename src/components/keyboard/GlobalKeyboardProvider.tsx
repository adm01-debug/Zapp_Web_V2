import React, { useEffect, useState, createContext, useContext, useCallback, useRef, Suspense } from 'react';
import { useGlobalKeyboardShortcuts } from '@/hooks/ui/useGlobalKeyboardShortcuts';
import { lazyWithRetry } from '@/lib/lazyWithRetry';

// O palette do ⌘K (com os hooks de dados de catalogo e Talk X) e carregado em
// lazy: so baixa na primeira vez que o usuario abre o ⌘K, fora do chunk de entrada.
const CommandPaletteHost = lazyWithRetry(() =>
  import('./CommandPaletteHost').then((m) => ({ default: m.CommandPaletteHost }))
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
const KeyboardShortcutsDialog = lazyWithRetry(() =>
  import('./KeyboardShortcutsDialog').then((m) => ({ default: m.KeyboardShortcutsDialog })),
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
  // Origem do foco: guardada na ABERTURA e devolvida no fechamento (R2-INF-035).
  const origemRef = useRef<HTMLElement | null>(null);
  const jaAbriuRef = useRef(false);

  const registrarOrigem = useCallback(() => {
    const ativo = document.activeElement as HTMLElement | null;
    origemRef.current = ativo && ativo !== document.body ? ativo : null;
  }, []);

  const abrirPaleta = useCallback(() => {
    registrarOrigem();
    setShowCommandPalette(true);
  }, [registrarOrigem]);

  const alternarPaleta = useCallback(() => {
    if (!showCommandPalette) registrarOrigem();
    setShowCommandPalette(!showCommandPalette);
  }, [registrarOrigem, showCommandPalette]);

  // Monta o palette lazy só na primeira abertura do ⌘K (depois fica montado para
  // preservar a animação de saída do Dialog).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- monta o lazy na 1ª abertura e o mantém montado (animação de saída do Dialog).
    if (showCommandPalette) setPaletteMounted(true);
  }, [showCommandPalette]);

  // R2-INF-035: este provider é o ÚNICO dono do estado da paleta. O registry de teclado
  // captura Ctrl/Cmd+K na fase de captura e PARA a propagação, então a ação
  // `global-search` é sobrescrita aqui para ALTERNAR (abre/fecha) a MESMA paleta — antes o
  // registry só despachava `open-global-search`, que a paleta de módulos escutava, e o
  // listener próprio deste arquivo abria uma segunda paleta (as duas nunca coincidiam).
  useGlobalKeyboardShortcuts([
    ...(customActions || []),
    {
      id: 'global-search',
      action: alternarPaleta,
    },
    {
      id: 'show-shortcuts-help',
      action: () => setShowHelp(true),
    },
    {
      id: 'open-command-palette',
      action: abrirPaleta,
    },
  ]);

  // Listen for custom events.
  // `open-global-search` é o pedido dos botões de busca (Sidebar/MobileShell): abre a
  // mesma paleta do ⌘K, sem alternar — quem clica no botão quer abrir, não fechar.
  useEffect(() => {
    const handleShowHelp = () => setShowHelp(true);
    const handleOpenPalette = () => abrirPaleta();
    
    document.addEventListener('show-shortcuts-help', handleShowHelp);
    document.addEventListener('open-command-palette', handleOpenPalette);
    document.addEventListener('open-global-search', handleOpenPalette);
    return () => {
      document.removeEventListener('show-shortcuts-help', handleShowHelp);
      document.removeEventListener('open-command-palette', handleOpenPalette);
      document.removeEventListener('open-global-search', handleOpenPalette);
    };
  }, [abrirPaleta]);

  // Fechou? devolve o foco a quem abriu (o Dialog do Radix não tem gatilho: sem isto o
  // foco cai no <body>). Roda DEPOIS do cleanup do Dialog, que é quem tira o foco.
  useEffect(() => {
    if (showCommandPalette) {
      jaAbriuRef.current = true;
      return;
    }
    if (!jaAbriuRef.current) return;
    jaAbriuRef.current = false;
    const origem = origemRef.current;
    origemRef.current = null;
    origem?.focus?.();
  }, [showCommandPalette]);

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

      // Cmd+K em plataforma sem o mapeamento do registry (macOS manda metaKey); o
      // Ctrl+K já chega aqui da ação `global-search` do registry.
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        alternarPaleta();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [alternarPaleta]);

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
    openCommandPalette: abrirPaleta,
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
