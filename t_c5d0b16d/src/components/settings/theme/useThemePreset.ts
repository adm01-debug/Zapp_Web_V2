import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import {
  applyThemePreset,
  applyRadius,
  loadThemeConfig,
  saveThemeConfig,
  clearThemeOverrides,
  getDefaultConfig,
  getPresetById,
  type ThemeConfig,
} from './presets';
import { useTheme } from '@/hooks/ui/useTheme';

/**
 * Hook fino da página de Skins: mantém `config` (o que está aplicado) e
 * `savedConfig` (o que está gravado), com auto-save a cada seleção de skin
 * e snap de raio ao entrar/sair de uma skin GX.
 */
export function useThemePreset() {
  const { resolvedTheme } = useTheme();
  const [config, setConfig] = useState<ThemeConfig>(loadThemeConfig);
  const [savedConfig, setSavedConfig] = useState<ThemeConfig>(config);

  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(config) !== JSON.stringify(savedConfig),
    [config, savedConfig],
  );

  useEffect(() => {
    applyThemePreset(config.preset, resolvedTheme);
    applyRadius(config.borderRadius);
  }, [config, resolvedTheme]);

  const updateConfig = useCallback((partial: Partial<ThemeConfig>, autoSave = true) => {
    setConfig((prev) => {
      let next = { ...prev, ...partial };
      if (partial.preset && partial.preset !== prev.preset) {
        const prevPreset = getPresetById(prev.preset);
        const nextPreset = getPresetById(partial.preset);
        if (nextPreset?.borderRadius !== undefined) {
          next = { ...next, borderRadius: nextPreset.borderRadius };
        } else if (prevPreset?.borderRadius !== undefined) {
          next = { ...next, borderRadius: getDefaultConfig().borderRadius };
        }
      }
      if (autoSave) {
        saveThemeConfig(next);
        setSavedConfig(next);
      }
      return next;
    });
  }, []);

  const applyPreset = useCallback((id: string) => {
    const preset = getPresetById(id);
    if (!preset) return;
    updateConfig({ preset: id });
    toast.success(`Tema "${preset.name}" aplicado!`);
  }, [updateConfig]);

  const handleSave = useCallback(() => {
    const ok = saveThemeConfig(config);
    if (ok) {
      setSavedConfig(config);
      const preset = getPresetById(config.preset);
      toast.success('Tema salvo com sucesso!', {
        description: `Skin "${preset?.name ?? config.preset}" aplicada.`,
      });
    } else {
      toast.error('Não foi possível salvar o tema', {
        description: 'O armazenamento local está indisponível ou cheio. Tente em uma janela normal.',
      });
    }
  }, [config]);

  const handleReset = useCallback(() => {
    clearThemeOverrides();
    const def = getDefaultConfig();
    setConfig(def);
    setSavedConfig(def);
    saveThemeConfig(def);
    applyThemePreset(def.preset, resolvedTheme);
    applyRadius(def.borderRadius);
    toast.success('Tema restaurado ao padrão');
  }, [resolvedTheme]);

  return {
    config,
    hasUnsavedChanges,
    updateConfig,
    applyPreset,
    handleSave,
    handleReset,
  };
}
