import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/auth/useAuth';

const STORAGE_KEY = 'screen-protection-enabled';

function getStoredState(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === null ? true : v === 'true';
  } catch { return true; }
}

/**
 * Anti-screenshot & data exfiltration protection system.
 * Can be toggled on/off; state persists in localStorage.
 */
export function useScreenProtection() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(getStoredState);

  const toggle = useCallback(() => {
    setEnabled(prev => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      window.dispatchEvent(new Event('screen-protection-change'));
      return next;
    });
  }, []);

  // Listen for changes from other components
  useEffect(() => {
    const handler = () => setEnabled(getStoredState());
    window.addEventListener('screen-protection-change', handler);
    return () => window.removeEventListener('screen-protection-change', handler);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // ── 1. Block screenshot & data exfiltration shortcuts ──
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        navigator.clipboard?.writeText?.('').catch(() => {});
        showWarning();
        return;
      }
      if (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key)) {
        e.preventDefault();
        showWarning();
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        showWarning();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        showWarning();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        showWarning();
        return;
      }

      const target = e.target as HTMLElement;
      const isInputElement = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && !isInputElement) {
        e.preventDefault();
        navigator.clipboard?.writeText?.('').catch(() => {});
        showWarning();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !isInputElement) {
        e.preventDefault();
        return;
      }
      if (!import.meta.env.DEV && e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        return;
      }
      if (!import.meta.env.DEV && e.key === 'F12') {
        e.preventDefault();
        return;
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (import.meta.env.DEV) return;
      e.preventDefault();
    };

    const handleCopy = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputElement = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (!isInputElement) {
        e.preventDefault();
        e.clipboardData?.setData('text/plain', '');
      }
    };

    const handleDragStart = (e: DragEvent) => {
      const target = e.target as HTMLElement;
      const isInputElement = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      if (!isInputElement) {
        e.preventDefault();
      }
    };

    let overlay: HTMLDivElement | null = null;

    const handleBlur = () => {
      if (overlay) return;
      overlay = document.createElement('div');
      overlay.id = 'screen-protection-overlay';
      overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 99999;
        background: hsl(var(--background));
        display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(20px);
        transition: opacity 0.2s ease;
      `;
      overlay.innerHTML = `
        <div style="text-align:center; color: hsl(var(--foreground)); font-family: system-ui;">
          <div style="font-size:3rem; margin-bottom:1rem;">🔒</div>
          <div style="font-size:1.25rem; font-weight:600;">Conteúdo Protegido</div>
          <div style="font-size:0.875rem; opacity:0.7; margin-top:0.5rem;">Volte à janela para continuar</div>
        </div>
      `;
      document.body.appendChild(overlay);
    };

    const handleFocus = () => {
      if (overlay) {
        overlay.remove();
        overlay = null;
      }
    };

    const style = document.createElement('style');
    style.id = 'screen-protection-css';
    style.textContent = `
      @media print { body { display: none !important; } }
      body { -webkit-user-select: none !important; user-select: none !important; }
      input, textarea, [contenteditable="true"], pre, code { -webkit-user-select: text !important; user-select: text !important; }
      img { -webkit-user-drag: none !important; user-drag: none !important; pointer-events: auto; }
    `;
    document.head.appendChild(style);

    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('copy', handleCopy, true);
    document.addEventListener('dragstart', handleDragStart, true);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('copy', handleCopy, true);
      document.removeEventListener('dragstart', handleDragStart, true);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      overlay?.remove();
      style.remove();
    };
  }, [user, enabled]);

  return { enabled, toggle };
}

function showWarning() {
  const flash = document.createElement('div');
  flash.style.cssText = `
    position: fixed; inset: 0; z-index: 99999;
    background: hsl(var(--destructive) / 0.15);
    pointer-events: none;
    animation: screenFlash 0.5s ease-out forwards;
  `;
  const keyframes = document.createElement('style');
  keyframes.textContent = `
    @keyframes screenFlash {
      0% { opacity: 1; }
      100% { opacity: 0; }
    }
  `;
  document.head.appendChild(keyframes);
  document.body.appendChild(flash);
  setTimeout(() => {
    flash.remove();
    keyframes.remove();
  }, 600);
}
