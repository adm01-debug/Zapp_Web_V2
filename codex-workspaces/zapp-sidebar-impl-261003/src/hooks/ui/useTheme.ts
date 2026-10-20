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
let systemListenerAttached = false;

const notify = () => {
  listeners.forEach((listener) => listener(themeState));
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
    };
  }, []);

  const setTheme = useCallback((nextTheme: Theme) => {
    // Add transition class for smooth theme switching
    if (document.documentElement) {
      document.documentElement.classList.add('theme-transitioning');
      updateThemeState(nextTheme);
      setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 350);
    } else {
      updateThemeState(nextTheme);
    }
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
