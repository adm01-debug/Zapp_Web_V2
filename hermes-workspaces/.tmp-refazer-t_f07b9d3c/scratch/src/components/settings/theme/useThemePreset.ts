import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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

/** Erro único de persistência (autosave, Salvar e reset) — mesma mensagem. */
function notificarFalhaDePersistencia() {
  toast.error('Não foi possível salvar o tema', {
    description: 'O armazenamento local está indisponível ou cheio. Tente em uma janela normal.',
  });
}

/**
 * Aplica `partial` sobre `prev` e faz o snap de raio ao entrar/sair de uma GX.
 * Pura de propósito: quem persiste é o caller, fora do updater do React.
 */
function mergeConfig(prev: ThemeConfig, partial: Partial<ThemeConfig>): ThemeConfig {
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
  return next;
}

/**
 * Hook fino da página de Skins: mantém `config` (o que está aplicado) e
 * `savedConfig` (o que está gravado), com auto-save a cada seleção de skin
 * e snap de raio ao entrar/sair de uma skin GX.
 *
 * Regra de persistência (SK01): a mudança entra em memória/tela na hora, mas
 * `savedConfig` só avança quando `saveThemeConfig` confirma (`true`). Em falha
 * (quota cheia, modo restrito) a alteração fica PENDENTE e o usuário vê erro —
 * nunca sucesso —, para não perdê-la silenciosamente ao recarregar.
 */
export function useThemePreset() {
  const { resolvedTheme } = useTheme();
  const [config, setConfig] = useState<ThemeConfig>(loadThemeConfig);
  const [savedConfig, setSavedConfig] = useState<ThemeConfig>(config);

  // Espelho síncrono do que está aplicado: permite calcular o próximo estado e
  // persistir fora do updater (que precisa ser puro) sem perder mudanças em
  // sequência rápida (arrastar do slider dispara vários `onChange`).
  const configRef = useRef(config);

  const commitConfig = useCallback((next: ThemeConfig) => {
    configRef.current = next;
    setConfig(next);
  }, []);

  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(config) !== JSON.stringify(savedConfig),
    [config, savedConfig],
  );

  useEffect(() => {
    applyThemePreset(config.preset, resolvedTheme);
    applyRadius(config.borderRadius);
  }, [config, resolvedTheme]);

  /** Aplica `partial` em memória e devolve se a persistência confirmou. */
  const updateConfig = useCallback(
    (partial: Partial<ThemeConfig>, autoSave = true): boolean => {
      const next = mergeConfig(configRef.current, partial);
      commitConfig(next);
      if (!autoSave) return true;
      const ok = saveThemeConfig(next);
      if (ok) setSavedConfig(next);
      return ok;
    },
    [commitConfig],
  );

  const applyPreset = useCallback(
    (id: string) => {
      const preset = getPresetById(id);
      if (!preset) return;
      // Só declara sucesso quando a gravação confirmou; em falha a skin segue
      // aplicada e a pendência continua visível.
      if (updateConfig({ preset: id })) {
        toast.success(`Tema "${preset.name}" aplicado!`);
      } else {
        notificarFalhaDePersistencia();
      }
    },
    [updateConfig],
  );

  const handleSave = useCallback(() => {
    const atual = configRef.current;
    if (saveThemeConfig(atual)) {
      setSavedConfig(atual);
      const preset = getPresetById(atual.preset);
      toast.success('Tema salvo com sucesso!', {
        description: `Skin "${preset?.name ?? atual.preset}" aplicada.`,
      });
    } else {
      notificarFalhaDePersistencia();
    }
  }, []);

  const handleReset = useCallback(() => {
    clearThemeOverrides();
    const def = getDefaultConfig();
    commitConfig(def);
    // Mesma política do autosave: sucesso confirma o estado salvo; falha
    // mantém a pendência e não promete restauração.
    const ok = saveThemeConfig(def);
    if (ok) setSavedConfig(def);
    applyThemePreset(def.preset, resolvedTheme);
    applyRadius(def.borderRadius);
    if (ok) {
      toast.success('Tema restaurado ao padrão');
    } else {
      notificarFalhaDePersistencia();
    }
  }, [commitConfig, resolvedTheme]);

  return {
    config,
    hasUnsavedChanges,
    updateConfig,
    applyPreset,
    handleSave,
    handleReset,
  };
}
