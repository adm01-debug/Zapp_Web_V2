import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface UseThemeReturn {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  cycleTheme: () => void;
  isDark: boolean;
  isLight: boolean;
  isSystem: boolean;
}

const THEME_STORAGE_KEY = 'theme';
const MEDIA_QUERY = '(prefers-color-scheme: dark)';

type ThemeSnapshot = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
};

const getStoredTheme = (): Theme => {
  if (typeof window === 'undefined') return 'system';

  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
};

const getSystemTheme = (): ResolvedTheme => {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia(MEDIA_QUERY).matches ? 'dark' : 'light';
};

const resolveTheme = (theme: Theme): ResolvedTheme => {
  return theme === 'system' ? getSystemTheme() : theme;
};

let themeState: ThemeSnapshot = {
  theme: getStoredTheme(),
  resolvedTheme: resolveTheme(getStoredTheme()),
};

const listeners = new Set<(snapshot: ThemeSnapshot) => void>();
let transitionTimeout: number | null = null;
let rootTransitionTimeout: number | null = null;
let systemListenerAttached = false;

const notify = () => {
  listeners.forEach((listener) => listener(themeState));
};

// Cancela os timers de transição pendentes. O `setTimeout` que só mexe no DOM
// precisa morrer junto com os hooks: sem isso ele dispara depois do teardown
// (jsdom) e vira `ReferenceError: document is not defined` — unhandled error que
// derruba a suíte inteira mesmo com 0 teste falhando.
const clearPendingTransitions = () => {
  if (typeof window === 'undefined') return;

  if (transitionTimeout !== null) {
    window.clearTimeout(transitionTimeout);
    transitionTimeout = null;
  }

  if (rootTransitionTimeout !== null) {
    window.clearTimeout(rootTransitionTimeout);
    rootTransitionTimeout = null;
  }
};

const applyThemeToDocument = (resolvedTheme: ResolvedTheme, animate = true) => {
  if (typeof window === 'undefined') return;

  const root = window.document.documentElement;
  const body = window.document.body;

  if (animate) {
    root.style.setProperty('--theme-transition', '0.3s');
    body.classList.add('theme-transitioning');
  }

  root.classList.remove('light', 'dark');
  root.classList.add(resolvedTheme);
  root.style.colorScheme = resolvedTheme;

  if (animate) {
    if (transitionTimeout) {
      window.clearTimeout(transitionTimeout);
    }

    transitionTimeout = window.setTimeout(() => {
      root.style.removeProperty('--theme-transition');
      body.classList.remove('theme-transitioning');
      transitionTimeout = null;
    }, 300);
  }
};

const updateThemeState = (nextTheme: Theme, animate = true) => {
  themeState = {
    theme: nextTheme,
    resolvedTheme: resolveTheme(nextTheme),
  };

  if (typeof window !== 'undefined') {
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  }

  applyThemeToDocument(themeState.resolvedTheme, animate);
  notify();
};

const handleSystemThemeChange = () => {
  if (themeState.theme !== 'system') return;

  themeState = {
    theme: 'system',
    resolvedTheme: getSystemTheme(),
  };

  applyThemeToDocument(themeState.resolvedTheme, false);
  notify();
};

const ensureSystemListener = () => {
  if (typeof window === 'undefined' || systemListenerAttached) return;

  window.matchMedia(MEDIA_QUERY).addEventListener('change', handleSystemThemeChange);
  systemListenerAttached = true;
};

const initializeTheme = () => {
  if (typeof window === 'undefined') return;

  ensureSystemListener();
  themeState = {
    theme: getStoredTheme(),
    resolvedTheme: resolveTheme(getStoredTheme()),
  };
  applyThemeToDocument(themeState.resolvedTheme, false);
};

export function ThemeSync() {
  useEffect(() => {
    initializeTheme();
  }, []);

  return null;
}

export function useTheme(): UseThemeReturn {
  const [snapshot, setSnapshot] = useState<ThemeSnapshot>(() => {
    if (typeof window !== 'undefined') {
      initializeTheme();
      return themeState;
    }

    return {
      theme: 'system',
      resolvedTheme: 'dark',
    };
  });

  useEffect(() => {
    initializeTheme();

    const listener = (nextSnapshot: ThemeSnapshot) => {
      setSnapshot(nextSnapshot);
    };

    listeners.add(listener);
    listener(themeState);

    return () => {
      listeners.delete(listener);

      // Último hook desmontado: não deixa nenhum timer de transição para trás
      // (ele tocaria o `document` já destruído no teardown do jsdom).
      if (listeners.size === 0) {
        clearPendingTransitions();
      }
    };
  }, []);

  const setTheme = useCallback((nextTheme: Theme) => {
    // Transição suave, só quando existe DOM: em SSR/teardown `document` não existe.
    if (typeof document !== 'undefined' && document.documentElement) {
      const root = document.documentElement;

      root.classList.add('theme-transitioning');

      if (rootTransitionTimeout !== null) {
        window.clearTimeout(rootTransitionTimeout);
      }

      // O callback usa o nó capturado (não `document`): se o timer sobreviver ao
      // teardown, ele não estoura `ReferenceError`.
      rootTransitionTimeout = window.setTimeout(() => {
        root.classList.remove('theme-transitioning');
        rootTransitionTimeout = null;
      }, 350);
    }

    updateThemeState(nextTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    updateThemeState(themeState.resolvedTheme === 'dark' ? 'light' : 'dark');
  }, []);

  const cycleTheme = useCallback(() => {
    const nextTheme =
      themeState.theme === 'light'
        ? 'dark'
        : themeState.theme === 'dark'
          ? 'system'
          : 'light';

    updateThemeState(nextTheme);
  }, []);

  return {
    theme: snapshot.theme,
    resolvedTheme: snapshot.resolvedTheme,
    setTheme,
    toggleTheme,
    cycleTheme,
    isDark: snapshot.resolvedTheme === 'dark',
    isLight: snapshot.resolvedTheme === 'light',
    isSystem: snapshot.theme === 'system',
  };
}
