import { useEffect } from 'react';

// e.code (não e.key) — Alt+letra no macOS compõe caracteres especiais em e.key
// (ex: Option+C → "ç"), mas o código físico da tecla continua estável.
const SHORTCUT_TO_VIEW: Record<string, string> = {
  KeyC: 'inbox',
  KeyM: 'team-chat',
  KeyL: 'email-chat',
  KeyO: 'contacts',
  KeyR: 'dashboard',
  KeyP: 'pipeline',
  KeyN: 'talkx',
  KeyG: 'settings',
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
