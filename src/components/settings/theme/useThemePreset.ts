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
import { useUiPreferences } from '@/hooks/ui/useUiPreferences';

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
  const { serverPrefs, ready: prefsProntas, setPreference } = useUiPreferences();
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

  /**
   * R2-PREF-001: o tema também vive no servidor (`user_ui_preferences.theme`).
   * NESTA ABA ele só é adotado se o usuário ainda não mexeu no tema — a resposta
   * do servidor que chega depois não pode desfazer a escolha dele. Antes de
   * mexer, o servidor vence o `localStorage` (a skin acompanha a conta, não o
   * navegador).
   */
  const temaTocadoRef = useRef(false);
  const temaDoServidor = serverPrefs?.theme as ThemeConfig | undefined;

  useEffect(() => {
    if (!prefsProntas || temaTocadoRef.current || !temaDoServidor) return;
    if (JSON.stringify(temaDoServidor) === JSON.stringify(configRef.current)) return;
    const persistiu = saveThemeConfig(temaDoServidor);
    commitConfig(temaDoServidor);
    setSavedConfig(prev => (!persistiu || JSON.stringify(prev) === JSON.stringify(temaDoServidor) ? prev : temaDoServidor));
  }, [prefsProntas, temaDoServidor, commitConfig]);

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
      temaTocadoRef.current = true;
      if (!autoSave) return true;
      const ok = saveThemeConfig(next);
      if (ok) setSavedConfig(next);
      // R2-PREF-001: espelha no servidor (agrupado pelo debounce do hook central).
      // A política do SK01 continua valendo para o `savedConfig` local.
      setPreference('theme', next);
      return ok;
    },
    [commitConfig, setPreference],
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
    temaTocadoRef.current = true;
    if (saveThemeConfig(atual)) {
      setSavedConfig(atual);
      const preset = getPresetById(atual.preset);
      toast.success('Tema salvo com sucesso!', {
        description: `Skin "${preset?.name ?? atual.preset}" aplicada.`,
      });
    } else {
      notificarFalhaDePersistencia();
    }
    // R2-PREF-001: grave ou não no localStorage, a conta recebe o tema.
    setPreference('theme', atual);
  }, [setPreference]);

  const handleReset = useCallback(() => {
    clearThemeOverrides();
    const def = getDefaultConfig();
    commitConfig(def);
    temaTocadoRef.current = true;
    // Mesma política do autosave: sucesso confirma o estado salvo; falha
    // mantém a pendência e não promete restauração.
    const ok = saveThemeConfig(def);
    if (ok) setSavedConfig(def);
    applyThemePreset(def.preset, resolvedTheme);
    applyRadius(def.borderRadius);
    setPreference('theme', def);
    if (ok) {
      toast.success('Tema restaurado ao padrão');
    } else {
      notificarFalhaDePersistencia();
    }
  }, [commitConfig, resolvedTheme, setPreference]);

  return {
    config,
    hasUnsavedChanges,
    updateConfig,
    applyPreset,
    handleSave,
    handleReset,
  };
}
