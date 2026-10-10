import { useEffect } from 'react';
import { applyThemePreset, applyRadius, loadThemeConfig, STORAGE_KEY, type ThemeConfig } from '@/components/settings/theme/presets';
import { useTheme } from '@/hooks/ui/useTheme';

import { getLogger } from '@/lib/logger';
const log = getLogger('ThemeInitializer');

/**
 * Global theme initializer — must be mounted at the app root.
 * Restora a skin salva (preset + raio) a cada load e reaplica quando o
 * Modo de Cor muda. O cache de CSS vars para o boot inline (index.html)
 * é gravado exclusivamente por `applyThemePreset` — este componente nunca
 * escreve no localStorage diretamente.
 */
export function ThemeInitializer() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const cfg = loadThemeConfig();
    applyThemePreset(cfg.preset, resolvedTheme);
    applyRadius(cfg.borderRadius);
    log.info('skin aplicada', { preset: cfg.preset, radius: cfg.borderRadius, mode: resolvedTheme });
  }, [resolvedTheme]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue) as Partial<ThemeConfig>;
        if (parsed.preset) {
          applyThemePreset(parsed.preset, resolvedTheme, { persistCache: false });
        }
        if (typeof parsed.borderRadius === 'number') {
          applyRadius(parsed.borderRadius);
        }
      } catch (err) {
        log.warn('storage event com JSON invalido', err);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [resolvedTheme]);

  return null;
}
