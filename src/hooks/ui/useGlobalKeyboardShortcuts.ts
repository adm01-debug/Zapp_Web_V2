import { useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from '@/lib/lazyToast';
import { useCustomShortcuts } from './useCustomShortcuts';
import { navigateToView } from '@/hooks/system/useNavigationHistory';

// Os toasts dos atalhos saem pela fachada `@/lib/lazyToast`: o `import('sonner')`
// do módulo mantém a lib (~9 KB gzip) fora do modulepreload do index.html
// (bundle-budget, t_fd52bf49) e, com a lib já carregada — o caso de qualquer
// atalho depois do boot —, a chamada é síncrona, como era com o import estático.

interface GlobalShortcutAction {
  id: string;
  action: (event: KeyboardEvent) => void;
}

/** Etapa 77: as ações do módulo de Tarefas vivem na tela, não aqui — o registry
 *  só recorta escopo/guarda e avisa. O `TasksModule` escuta `tasks-shortcut`. */
function avisarTarefas(id: string, key?: string) {
  document.dispatchEvent(new CustomEvent('tasks-shortcut', { detail: { id, key } }));
}

/** View corrente lida da URL canônica (`?view=`), a mesma que o app usa. */
function viewAtual(): string {
  return new URLSearchParams(window.location.search).get('view') ?? 'inbox';
}

export function useGlobalKeyboardShortcuts(customActions?: GlobalShortcutAction[]) {
  const navigate = useNavigate();
  const location = useLocation();
  const { shortcuts, getActiveBinding } = useCustomShortcuts();

  // Default global actions
  const defaultActions: Record<string, (event: KeyboardEvent) => void> = {
    'global-search': () => {
      document.dispatchEvent(new CustomEvent('open-global-search'));
    },
    'go-to-inbox': () => {
      navigate('/');
      toast.info('📥 Inbox', { duration: 1500 });
    },
    'go-to-dashboard': () => {
      // #447: só `navigate('/')` + toast anunciava Dashboard sem selecionar a
      // view. A navegação canônica é o `navigateToView` — grava `?view=dashboard`
      // e emite `zapp:navigate`, o evento que o shell e as instâncias de
      // `useNavigationHistory` escutam para trocar a tela.
      // Fora da raiz (/sla, /admin/roles) o `?view=` sozinho não levaria ao
      // shell: volta para a raiz já com a view no caminho.
      if (location.pathname !== '/') navigate('/?view=dashboard');
      navigateToView('dashboard');
      toast.info('📊 Dashboard', { duration: 1500 });
    },
    'go-to-contacts': () => {
      navigate('/');
      toast.info('👥 Contatos', { duration: 1500 });
    },
    'go-to-settings': () => {
      navigate('/');
      toast.info('⚙️ Configurações', { duration: 1500 });
    },
    'toggle-theme': () => {
      document.dispatchEvent(new CustomEvent('toggle-theme'));
    },
    'show-shortcuts-help': () => {
      document.dispatchEvent(new CustomEvent('show-shortcuts-help'));
    },
    'refresh-data': () => {
      window.location.reload();
    },
    'toggle-sidebar': () => {
      document.dispatchEvent(new CustomEvent('toggle-sidebar'));
    },
    'quick-compose': () => {
      document.dispatchEvent(new CustomEvent('quick-compose'));
    },
    'open-tasks-tab': () => {
      // Etapa 74 — o RealtimeInboxView (dono da aba ativa) escuta este evento e
      // leva o foco ao QuickAdd depois de montar a aba Tarefas (lazy).
      document.dispatchEvent(new CustomEvent('inbox-open-tasks-tab'));
    },
    'toggle-notifications': () => {
      document.dispatchEvent(new CustomEvent('toggle-notifications'));
    },
    // Etapa 77 — 7 atalhos do módulo de Tarefas (escopo em `defaultShortcuts`).
    // O registry só recorta escopo/guarda de input e avisa a tela; quem sabe o
    // que fazer com cada um é o `TasksModule`.
    'tasks-focus-quickadd': () => avisarTarefas('tasks-focus-quickadd'),
    'tasks-mode': (event) => avisarTarefas('tasks-mode', event.key),
    'tasks-search': () => avisarTarefas('tasks-search'),
    'tasks-open-sheet': () => avisarTarefas('tasks-open-sheet'),
    'tasks-complete': () => avisarTarefas('tasks-complete'),
    'tasks-cancel': () => avisarTarefas('tasks-cancel'),
    'tasks-help': () => {
      document.dispatchEvent(new CustomEvent('show-shortcuts-help'));
    },
  };

  // A tabela de acoes mistura os defaults com `customActions`, que o provider
  // recria a cada render. Guardada numa ref, ela deixa de invalidar o listener
  // global a cada render e sai das deps do useCallback (gate do lint-ratchet).
  const actionsRef = useRef<Record<string, (event: KeyboardEvent) => void>>({});
  useEffect(() => {
    const merged = { ...defaultActions };
    customActions?.forEach(({ id, action }) => {
      merged[id] = action;
    });
    actionsRef.current = merged;
  });

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs (except for specific ones)
    const target = event.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    // Allow Ctrl+K (global search) and Escape even in inputs
    const allowedInInputs = ['global-search', 'clear-selection', 'show-shortcuts-help', 'open-tasks-tab'];

    // Etapa 77: view corrente — atalho com `scope` só vale na view dele.
    const view = viewAtual();

    for (const shortcut of shortcuts) {
      if (shortcut.scope && !shortcut.scope.includes(view)) continue;

      const binding = getActiveBinding(shortcut);
      
      // Check if keys match
      if (!binding.key || !event.key) continue;
      // Etapa 77: `alternateKeys` deixa um único atalho responder a 1, 2 e 3.
      const keyMatches = [binding.key, ...(shortcut.alternateKeys ?? [])]
        .some(key => key.toLowerCase() === event.key.toLowerCase());
      const ctrlMatches = !!event.ctrlKey === !!binding.modifiers.ctrlKey;
      const shiftMatches = !!event.shiftKey === !!binding.modifiers.shiftKey;
      const altMatches = !!event.altKey === !!binding.modifiers.altKey;

      if (keyMatches && ctrlMatches && shiftMatches && altMatches) {
        // Skip if in input and not allowed
        if (isInput && !allowedInInputs.includes(shortcut.id)) {
          continue;
        }

        // Execute action if exists
        const action = actionsRef.current[shortcut.id];
        if (action) {
          event.preventDefault();
          event.stopPropagation();
          action(event);
          return;
        }
      }
    }
  }, [shortcuts, getActiveBinding]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);

  return { shortcuts };
}
