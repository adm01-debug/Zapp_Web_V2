import { useState, useEffect, useCallback } from 'react';
import { log } from '@/lib/logger';
import { DEFAULT_SHORTCUTS } from '@/hooks/shortcuts/defaultShortcuts';

export interface ShortcutBinding {
  id: string;
  name: string;
  description: string;
  defaultKey: string;
  defaultModifiers: {
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
  };
  customKey?: string;
  customModifiers?: {
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
  };
  category: 'chat' | 'navigation' | 'actions' | 'selection';
}

const STORAGE_KEY = 'custom-keyboard-shortcuts';

export function useCustomShortcuts() {
  const [shortcuts, setShortcuts] = useState<ShortcutBinding[]>(DEFAULT_SHORTCUTS);
  const [isRecording, setIsRecording] = useState<string | null>(null);
  const [pendingShortcut, setPendingShortcut] = useState<{ key: string; modifiers: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean } } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const customBindings = JSON.parse(stored) as Record<string, { key: string; modifiers: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean } }>;
        setShortcuts(prev => prev.map(shortcut => {
          const custom = customBindings[shortcut.id];
          if (custom) {
            return { ...shortcut, customKey: custom.key, customModifiers: custom.modifiers };
          }
          return shortcut;
        }));
      } catch (e) {
        log.error('Failed to parse stored shortcuts:', e);
      }
    }
  }, []);

  const saveShortcuts = useCallback((updatedShortcuts: ShortcutBinding[]) => {
    const customBindings: Record<string, { key: string; modifiers: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean } }> = {};
    updatedShortcuts.forEach(shortcut => {
      if (shortcut.customKey) {
        customBindings[shortcut.id] = { key: shortcut.customKey, modifiers: shortcut.customModifiers || {} };
      }
    });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(customBindings)); } catch { /* storage unavailable */ }
  }, []);

  const updateShortcut = useCallback((id: string, key: string, modifiers: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean }) => {
    setShortcuts(prev => {
      const updated = prev.map(shortcut => shortcut.id === id ? { ...shortcut, customKey: key, customModifiers: modifiers } : shortcut);
      saveShortcuts(updated);
      return updated;
    });
  }, [saveShortcuts]);

  const resetShortcut = useCallback((id: string) => {
    setShortcuts(prev => {
      const updated = prev.map(shortcut => shortcut.id === id ? { ...shortcut, customKey: undefined, customModifiers: undefined } : shortcut);
      saveShortcuts(updated);
      return updated;
    });
  }, [saveShortcuts]);

  const resetAllShortcuts = useCallback(() => {
    setShortcuts(DEFAULT_SHORTCUTS);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const getActiveBinding = useCallback((shortcut: ShortcutBinding) => ({
    key: shortcut.customKey || shortcut.defaultKey,
    modifiers: shortcut.customModifiers || shortcut.defaultModifiers,
  }), []);

  const getShortcutById = useCallback((id: string) => shortcuts.find(s => s.id === id), [shortcuts]);

  const formatShortcut = useCallback((shortcut: ShortcutBinding) => {
    const binding = getActiveBinding(shortcut);
    const parts: string[] = [];
    if (binding.modifiers.ctrlKey) parts.push('Ctrl');
    if (binding.modifiers.shiftKey) parts.push('Shift');
    if (binding.modifiers.altKey) parts.push('Alt');
    parts.push(binding.key === ' ' ? 'Space' : binding.key);
    return parts;
  }, [getActiveBinding]);

  const startRecording = useCallback((id: string) => { setIsRecording(id); setPendingShortcut(null); }, []);
  const stopRecording = useCallback(() => {
    if (isRecording && pendingShortcut) updateShortcut(isRecording, pendingShortcut.key, pendingShortcut.modifiers);
    setIsRecording(null); setPendingShortcut(null);
  }, [isRecording, pendingShortcut, updateShortcut]);
  const cancelRecording = useCallback(() => { setIsRecording(null); setPendingShortcut(null); }, []);

  const recordKeyPress = useCallback((event: KeyboardEvent) => {
    if (!isRecording) return;
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return;
    event.preventDefault();
    setPendingShortcut({ key: event.key, modifiers: { ctrlKey: event.ctrlKey || undefined, shiftKey: event.shiftKey || undefined, altKey: event.altKey || undefined } });
  }, [isRecording]);

  useEffect(() => {
    if (isRecording) {
      window.addEventListener('keydown', recordKeyPress);
      return () => window.removeEventListener('keydown', recordKeyPress);
    }
  }, [isRecording, recordKeyPress]);

  const checkConflict = useCallback((id: string, key: string, modifiers: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean }) => {
    return shortcuts.find(s => {
      if (s.id === id) return false;
      const binding = getActiveBinding(s);
      return binding.key.toLowerCase() === key.toLowerCase() && !!binding.modifiers.ctrlKey === !!modifiers.ctrlKey && !!binding.modifiers.shiftKey === !!modifiers.shiftKey && !!binding.modifiers.altKey === !!modifiers.altKey;
    });
  }, [shortcuts, getActiveBinding]);

  return {
    shortcuts, isRecording, pendingShortcut,
    updateShortcut, resetShortcut, resetAllShortcuts,
    getActiveBinding, getShortcutById, formatShortcut,
    startRecording, stopRecording, cancelRecording, checkConflict,
  };
}
