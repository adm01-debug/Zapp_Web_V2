import { useEffect } from 'react';

// e.code (não e.key) — Alt+letra no macOS compõe caracteres especiais em e.key
// (ex: Option+C → "ç"), mas o código físico da tecla continua estável.
const SHORTCUT_TO_VIEW: Record<string, string> = {
  KeyC: 'inbox',
  KeyM: 'team-chat',
  KeyL: 'email-chat',
  KeyO: 'contacts',
  KeyR: 'dashboard',
  // E08 (fusão Quadro→Tarefas): `KeyP: 'pipeline'` saiu daqui — a entrada
  // "Quadro" do menu era a mesma tela de Tarefas com o modo Quadro forçado, e o
  // atalho era uma segunda porta para ela. Alt+P fica inerte; a visão Quadro
  // continua sendo um dos modos de Tarefas (Alt+K + teclas 1/2/3).
  // E.5/atalhos: a sidebar anuncia "Alt+K" no item Tarefas (`NavigationService`
  // carrega `shortcut: 'Alt+K'`) mas o mapa nao tinha `KeyK` — o atalho nao fazia
  // nada. FASE 5 do design system Promo Gifts: mesma lacuna fechada em
  // Alt+A/Catálogo e Alt+Q/Conquistas (o `kbd` da sidebar anunciava os dois e a
  // tecla nao navegava). Alt+T/Telefonia continua FORA: `NavigationService`
  // anuncia Alt+T, mas a tecla ja e do binding global 'open-tasks-tab'
  // (`defaultShortcuts.ts`), consumido em fase de captura por
  // `useGlobalKeyboardShortcuts` — quem fica com Alt+T e decisao de outro cartao.
  KeyK: 'tasks',
  KeyN: 'talkx',
  KeyG: 'settings',
  // FASE 5 — teclas que a sidebar anuncia e o mapa nao tinha (ver comentario acima)
  KeyA: 'catalog',
  KeyQ: 'achievements',
};

export function useNavShortcuts(onNavigate: (viewId: string) => void) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

      const viewId = SHORTCUT_TO_VIEW[event.code];
      if (!viewId) return;

      event.preventDefault();
      onNavigate(viewId);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNavigate]);
}
