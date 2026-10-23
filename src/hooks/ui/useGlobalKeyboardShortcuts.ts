import { useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from '@/lib/lazyToast';
import { toggleMuteActive } from '@/hooks/communication/audioPlaybackBus';
import { useCustomShortcuts } from './useCustomShortcuts';
import { navigateToView } from '@/hooks/system/useNavigationHistory';
import { VOLUME_CONTROL_ATTRIBUTE } from '@/hooks/ui/useVolumeRocker';

// Os toasts dos atalhos saem pela fachada `@/lib/lazyToast`: ela NÃO referencia
// o sonner (o viewport lazy registra a lib no boot) e mantém a lib (~9 KB gzip)
// fora do modulepreload do index.html (bundle-budget, t_fd52bf49). Com a lib já
// registrada — o caso de qualquer atalho depois do boot —, a chamada é síncrona,
// como era com o import estático.

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

export interface AcoesGlobaisDeps {
  /** `useLocation().pathname` do shell. */
  pathname: string;
  /** `useNavigate()`. */
  navigate: (to: string) => void;
}

/**
 * Tabela de executores globais. Fica fora do hook e é exportada de propósito: é
 * dela que sai a lista de ids COM executor. `atalhosSemExecutor.test.ts` chama
 * esta função em vez de repetir a lista à mão — lista copiada não prova nada e
 * envelhece junto com o código.
 */
export function criarAcoesGlobais({ pathname, navigate }: AcoesGlobaisDeps): Record<string, (event: KeyboardEvent) => void> {
  return {
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
      if (pathname !== '/') navigate('/?view=dashboard');
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
    // Mudo do áudio EM REPRODUÇÃO (paridade com o app antigo, doc 06). Sem áudio
    // tocando a ação é inerte — melhor nem anunciar nada, como no V3.
    'audio-toggle-mute': () => {
      const resultado = toggleMuteActive();
      if (!resultado) return;
      toast.info(
        resultado.muted ? '🔇 Áudio silenciado' : `🔊 Volume em ${resultado.volume}%`,
        { duration: 1500 },
      );
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
}

export function useGlobalKeyboardShortcuts(customActions?: GlobalShortcutAction[]) {
  const navigate = useNavigate();
  const location = useLocation();
  const { shortcuts, getActiveBinding } = useCustomShortcuts();

  // Default global actions
  const defaultActions = criarAcoesGlobais({ pathname: location.pathname, navigate });

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

    // O `M` global (mudo do áudio em reprodução) cede o toque ao controle de
    // volume quando o FOCO já está nele: ali quem responde é o `useVolumeRocker`
    // (E16) — e no gatilho dos ALERTAS o `M` muda o mudo dos ALERTAS, não o das
    // mídias. Como este handler captura na janela e faz `stopPropagation`, sem
    // esta saída o atalho local ficaria inalcançável (e o das mídias mudaria o
    // mudo errado, com o foco no controle dos alertas).
    const cedeAoControleDeVolume = event.target instanceof Element
      && event.target.closest(`[${VOLUME_CONTROL_ATTRIBUTE}]`) !== null;

    for (const shortcut of shortcuts) {
      if (shortcut.scope && !shortcut.scope.includes(view)) continue;
      if (cedeAoControleDeVolume && shortcut.id === 'audio-toggle-mute') continue;

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
