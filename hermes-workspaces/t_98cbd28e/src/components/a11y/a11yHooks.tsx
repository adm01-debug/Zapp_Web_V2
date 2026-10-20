import { useCallback, useRef, useState, useEffect, KeyboardEvent } from 'react';

// Roving Tabindex Hook
interface UseRovingTabindexOptions {
  itemCount: number;
  orientation?: 'horizontal' | 'vertical' | 'both';
  loop?: boolean;
  onSelect?: (index: number) => void;
}

export function useRovingTabindex({
  itemCount, orientation = 'vertical', loop = true, onSelect,
}: UseRovingTabindexOptions) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  const setItemRef = useCallback((index: number) => (el: HTMLElement | null) => {
    itemRefs.current[index] = el;
  }, []);

  const focusItem = useCallback((index: number) => {
    const item = itemRefs.current[index];
    if (item) { item.focus(); setFocusedIndex(index); }
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const prevKeys = orientation === 'horizontal' ? ['ArrowLeft'] : ['ArrowUp'];
    const nextKeys = orientation === 'horizontal' ? ['ArrowRight'] : ['ArrowDown'];
    if (orientation === 'both') {
      prevKeys.push('ArrowLeft', 'ArrowUp');
      nextKeys.push('ArrowRight', 'ArrowDown');
    }
    let newIndex = focusedIndex;
    if (prevKeys.includes(e.key)) { e.preventDefault(); newIndex = focusedIndex - 1; if (newIndex < 0) newIndex = loop ? itemCount - 1 : 0; }
    else if (nextKeys.includes(e.key)) { e.preventDefault(); newIndex = focusedIndex + 1; if (newIndex >= itemCount) newIndex = loop ? 0 : itemCount - 1; }
    else if (e.key === 'Home') { e.preventDefault(); newIndex = 0; }
    else if (e.key === 'End') { e.preventDefault(); newIndex = itemCount - 1; }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(focusedIndex); return; }
    if (newIndex !== focusedIndex) focusItem(newIndex);
  }, [focusedIndex, itemCount, loop, orientation, onSelect, focusItem]);

  const getItemProps = useCallback((index: number) => ({
    ref: setItemRef(index),
    tabIndex: index === focusedIndex ? 0 : -1,
    onKeyDown: handleKeyDown,
    onFocus: () => setFocusedIndex(index),
    'aria-selected': index === focusedIndex,
  }), [focusedIndex, handleKeyDown, setItemRef]);

  return { focusedIndex, setFocusedIndex, getItemProps, focusItem };
}

// Focus Visible Hook
export function useFocusVisible() {
  const [isFocusVisible, setIsFocusVisible] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const handleKeyDown = () => setIsFocusVisible(true);
    const handleMouseDown = () => setIsFocusVisible(false);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    return () => { document.removeEventListener('keydown', handleKeyDown); document.removeEventListener('mousedown', handleMouseDown); };
  }, []);

  return { isFocusVisible: isFocused && isFocusVisible, focusProps: { onFocus: () => setIsFocused(true), onBlur: () => setIsFocused(false) } };
}

// Vim-style Navigation Hook
interface UseVimNavigationOptions {
  onNavigate: (direction: 'up' | 'down' | 'left' | 'right') => void;
  onAction?: (action: 'enter' | 'escape' | 'delete') => void;
  enabled?: boolean;
}

export function useVimNavigation({ onNavigate, onAction, enabled = true }: UseVimNavigationOptions) {
  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key.toLowerCase()) {
        case 'j': onNavigate('down'); break;
        case 'k': onNavigate('up'); break;
        case 'h': onNavigate('left'); break;
        case 'l': onNavigate('right'); break;
        case 'enter': onAction?.('enter'); break;
        case 'escape': onAction?.('escape'); break;
        case 'd': if (e.shiftKey) onAction?.('delete'); break;
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onNavigate, onAction]);
}

// Screen Reader Announcer Hook
export function useAnnouncer() {
  const [message, setMessage] = useState('');
  const announce = useCallback((text: string) => {
    setMessage('');
    setTimeout(() => setMessage(text), 100);
  }, []);
  const Announcer = useCallback(() => <LiveRegion message={message} />, [message]);
  return { announce, Announcer };
}

// Focus Management Hook
export function useFocusManagement() {
  const previousFocus = useRef<HTMLElement | null>(null);
  const saveFocus = useCallback(() => { previousFocus.current = document.activeElement as HTMLElement; }, []);
  const restoreFocus = useCallback(() => { previousFocus.current?.focus(); }, []);
  const moveFocus = useCallback((element: HTMLElement | null) => { element?.focus(); }, []);
  return { saveFocus, restoreFocus, moveFocus };
}

// Inline LiveRegion for Announcer (avoids circular import)
import { cn } from '@/lib/utils';
function LiveRegion({ message }: { message: string }) {
  return <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{message}</div>;
}
