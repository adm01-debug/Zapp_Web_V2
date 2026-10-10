import { useEffect } from 'react';

interface UseGlobalSearchShortcutProps {
  onOpen: () => void;
}

export function useGlobalSearchShortcut({ onOpen }: UseGlobalSearchShortcutProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K or Cmd+K to open search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        onOpen();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onOpen]);
}
