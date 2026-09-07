import { useEffect } from 'react';
import {
  PRESETS,
  CSS_VARS_TO_APPLY,
  STORAGE_KEY,
  STORAGE_VERSION,
  DEFAULT_PRESET_ID,
  normalizeStoredPresetId,
} from '@/components/settings/theme/presets';
import type { ThemeModeColors } from '@/components/settings/theme/presets';
import { useTheme } from '@/hooks/ui/useTheme';

import { getLogger } from '@/lib/logger';
const log = getLogger('ThemeInitializer');

type StoredThemeConfig = {
  borderRadius?: number;
  cacheMode?: 'light' | 'dark';
  cachePreset?: string;
  cssVarsCache?: Record<string, string>;
  preset?: string;
  v?: number;
};

/**
 * Global theme initializer — must be mounted at the app root.
 * Restores saved skin (preset + border-radius) on every page load
 * and re-applies when light/dark mode changes.
 * Also caches computed CSS vars in localStorage for the inline
 * flash-prevention script in index.html.
 */
export function ThemeInitializer() {
  const { resolvedTheme, theme } = useTheme();

  useEffect(() => {
    let mounted = true;
    log.info('ThemeInitializer: applying theme configuration');

    const applyTheme = () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        let presetId = DEFAULT_PRESET_ID;
        let radius = 8;
        let storedConfig: StoredThemeConfig = {};

        if (saved) {
          try {
            const parsed = JSON.parse(saved) as StoredThemeConfig;
            // Cache de vars de outra versão da paleta é descartado; preset e raio do usuário são mantidos.
            storedConfig = parsed.v === STORAGE_VERSION
              ? parsed
              : { preset: parsed.preset, borderRadius: parsed.borderRadius };
            presetId = normalizeStoredPresetId(parsed.preset);
            if (parsed.borderRadius != null) radius = parsed.borderRadius;
          } catch (e) {
            log.warn('Failed to parse saved theme config:', e);
          }
        }

        const preset = PRESETS.find((p) => p.id === presetId) || PRESETS.find((p) => p.id === DEFAULT_PRESET_ID);
        if (preset) {
          const colors: ThemeModeColors = resolvedTheme === 'dark' ? preset.dark : preset.light;
          const root = document.documentElement;
          const cssVarsCache: Record<string, string> = {};

          for (const key of CSS_VARS_TO_APPLY) {
            const value = colors[key];
            if (value) {
              root.style.setProperty(`--${key}`, value);
              cssVarsCache[key] = value;
            }
          }

          if (mounted) {
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify({
                ...storedConfig,
                borderRadius: radius,
                cacheMode: resolvedTheme,
                cachePreset: presetId,
                cssVarsCache,
                preset: presetId,
                v: STORAGE_VERSION,
              }));
            } catch (err) {
              log.error('LocalStorage write failed:', err);
            }
          }
        }

        document.documentElement.style.setProperty('--radius', `${radius / 16}rem`);
      } catch (criticalError) {
        log.error('Critical error in ThemeInitializer:', criticalError);
      }
    };

    // Use requestAnimationFrame to ensure DOM is ready but avoid blocking
    const frameId = requestAnimationFrame(applyTheme);

    return () => {
      mounted = false;
      cancelAnimationFrame(frameId);
    };
  }, [resolvedTheme, theme]);

  return null;
}
