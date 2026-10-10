import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { HighContrastProvider, useHighContrast } from '@/components/theme/HighContrastToggle';
import { applyThemePreset } from '@/components/settings/theme/presets';

/**
 * Ordem/origem das variáveis de tema: o alto contraste manda nas CORES.
 *
 * O alto contraste define os tokens dele por CLASSE (`.high-contrast`, em
 * `src/styles/accessibility.css`) e o preset escreve os dele INLINE no mesmo `<html>` —
 * e estilo inline vence classe. A invariante que esses testes prendem é essa: com o alto
 * contraste ligado, cor de preset não pode ficar inline (nem sobreviver a um toggle em
 * sessão). O efeito visual é provado em navegador real, em
 * `e2e/theme-alto-contraste.spec.ts` — aqui o que se prova é a origem das variáveis.
 */

const VARS_DE_COR = ['--primary', '--background', '--muted-foreground', '--border'];

function BotaoDeAlternar() {
  const { isHighContrast, toggleHighContrast } = useHighContrast();
  return (
    <button type="button" onClick={toggleHighContrast}>
      {isHighContrast ? 'ligado' : 'desligado'}
    </button>
  );
}

function montar() {
  return render(
    <HighContrastProvider>
      <BotaoDeAlternar />
    </HighContrastProvider>,
  );
}

describe('alto contraste × preset — ordem das variáveis', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('style');
    document.documentElement.className = '';
  });

  it('com o alto contraste ligado o preset não deixa cor inline', () => {
    document.documentElement.classList.add('high-contrast');

    applyThemePreset('corporate', 'light', { persistCache: false });

    for (const variavel of VARS_DE_COR) {
      expect(
        document.documentElement.style.getPropertyValue(variavel),
        `${variavel} inline venceria a classe .high-contrast`,
      ).toBe('');
    }
  });

  it('sem alto contraste o preset escreve a cor inline (o comportamento normal segue)', () => {
    applyThemePreset('corporate', 'light', { persistCache: false });

    expect(document.documentElement.style.getPropertyValue('--primary')).not.toBe('');
  });

  it('ligar no meio da sessão limpa as vars inline que o preset já tinha escrito', () => {
    applyThemePreset('corporate', 'light', { persistCache: false });
    expect(document.documentElement.style.getPropertyValue('--primary')).not.toBe('');

    montar();
    act(() => {
      screen.getByRole('button').click();
    });

    expect(document.documentElement.classList.contains('high-contrast')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('');
  });

  it('desligar devolve as vars inline do preset', () => {
    window.localStorage.setItem('highContrast', 'true');
    document.documentElement.classList.add('high-contrast');
    applyThemePreset('corporate', 'light', { persistCache: false });

    montar();
    act(() => {
      screen.getByRole('button').click();
    });

    expect(document.documentElement.classList.contains('high-contrast')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--primary')).not.toBe('');
  });
});
