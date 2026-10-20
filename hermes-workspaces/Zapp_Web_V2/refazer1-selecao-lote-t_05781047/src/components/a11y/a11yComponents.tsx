import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useFocusVisible, useRovingTabindex } from './a11yHooks';

// Skip Links Component
interface SkipLinksProps {
  links?: Array<{ id: string; label: string }>;
}

export function SkipLinks({ links = [
  { id: 'main-content', label: 'Ir para conteúdo principal' },
  { id: 'main-navigation', label: 'Ir para navegação' },
  { id: 'search', label: 'Ir para busca' },
] }: SkipLinksProps) {
  return (
    <div className="sr-only focus-within:not-sr-only focus-within:fixed focus-within:top-0 focus-within:left-0 focus-within:z-[100] focus-within:p-4 focus-within:bg-background">
      <div className="flex gap-2">
        {links.map((link) => (
          <a key={link.id} href={`#${link.id}`}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
            {link.label}
          </a>
        ))}
      </div>
    </div>
  );
}

// Live Region for Dynamic Content
interface LiveRegionProps {
  message: string;
  assertive?: boolean;
  className?: string;
}

export function LiveRegion({ message, assertive = false, className }: LiveRegionProps) {
  return (
    <div role="status" aria-live={assertive ? 'assertive' : 'polite'} aria-atomic="true" className={cn("sr-only", className)}>
      {message}
    </div>
  );
}

// Focus Ring Component
interface FocusRingProps {
  children: ReactNode;
  className?: string;
  offset?: number;
}

export function FocusRing({ children, className, offset = 2 }: FocusRingProps) {
  const { isFocusVisible, focusProps } = useFocusVisible();
  return (
    <div {...focusProps} className={cn("relative inline-block", className)}>
      {children}
      {isFocusVisible && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className={cn("absolute inset-0 rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-background pointer-events-none", `-m-[${offset}px]`)} />
      )}
    </div>
  );
}

// Keyboard Shortcut Display
interface KeyboardShortcutProps {
  keys: string[];
  description: string;
  className?: string;
}

export function KeyboardShortcut({ keys, description, className }: KeyboardShortcutProps) {
  const formatKey = (key: string) => {
    const keyMap: Record<string, string> = {
      'Mod': navigator.platform.includes('Mac') ? '⌘' : 'Ctrl', 'Alt': navigator.platform.includes('Mac') ? '⌥' : 'Alt',
      'Shift': '⇧', 'Enter': '↵', 'Escape': 'Esc', 'ArrowUp': '↑', 'ArrowDown': '↓',
      'ArrowLeft': '←', 'ArrowRight': '→', 'Backspace': '⌫', 'Delete': '⌦', 'Tab': '⇥', 'Space': '␣',
    };
    return keyMap[key] || key.toUpperCase();
  };
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex items-center gap-1">
        {keys.map((key, i) => (
          <span key={i}>
            <kbd className="px-2 py-1 text-xs font-mono bg-muted border border-border rounded shadow-sm">{formatKey(key)}</kbd>
            {i < keys.length - 1 && <span className="mx-0.5 text-muted-foreground">+</span>}
          </span>
        ))}
      </div>
      <span className="text-sm text-muted-foreground">{description}</span>
    </div>
  );
}

// Accessible List with Keyboard Navigation
interface AccessibleListProps<T> {
  items: T[];
  renderItem: (item: T, index: number, props: Record<string, unknown>) => ReactNode;
  onSelect?: (item: T, index: number) => void;
  orientation?: 'horizontal' | 'vertical';
  label: string;
  className?: string;
}

export function AccessibleList<T>({ items, renderItem, onSelect, orientation = 'vertical', label, className }: AccessibleListProps<T>) {
  const { getItemProps, focusedIndex } = useRovingTabindex({
    itemCount: items.length, orientation, onSelect: (index) => onSelect?.(items[index], index),
  });
  return (
    <ul role="listbox" aria-label={label} aria-orientation={orientation}
      className={cn("focus:outline-none", orientation === 'horizontal' ? "flex gap-2" : "flex flex-col", className)}>
      {items.map((item, index) => (
        <li key={index} role="option"
          className={cn("cursor-pointer rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2", focusedIndex === index && "bg-accent")}
          {...getItemProps(index)}>
          {renderItem(item, index, getItemProps(index))}
        </li>
      ))}
    </ul>
  );
}

// Focus Trap
import { useRef, useEffect, KeyboardEvent } from 'react';
import { useFocusManagement } from './a11yHooks';

interface FocusTrapProps {
  children: ReactNode;
  active?: boolean;
  returnFocusOnDeactivate?: boolean;
}

export function FocusTrap({ children, active = true, returnFocusOnDeactivate = true }: FocusTrapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { saveFocus, restoreFocus } = useFocusManagement();

  useEffect(() => {
    if (!active) return;
    saveFocus();
    const focusableElements = containerRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusableElements?.[0]?.focus();
    return () => { if (returnFocusOnDeactivate) restoreFocus(); };
  }, [active, returnFocusOnDeactivate, saveFocus, restoreFocus]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !active) return;
    const focusableElements = containerRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusableElements || focusableElements.length === 0) return;
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    if (e.shiftKey && document.activeElement === firstElement) { e.preventDefault(); lastElement.focus(); }
    else if (!e.shiftKey && document.activeElement === lastElement) { e.preventDefault(); firstElement.focus(); }
  };

  return <div ref={containerRef} onKeyDown={handleKeyDown}>{children}</div>;
}
