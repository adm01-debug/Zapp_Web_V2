/**
 * Medido em produção em 03/10: emulando `prefers-contrast: more`, o `matchMedia` casa mas
 * `--border` **não muda** — o preset escreve as cores *inline* no `<html>` e variável inline vence
 * a media query do CSS. Ou seja, a `@media (prefers-contrast: more)` é inerte por construção.
 *
 * Correção: a preferência do sistema passou a ser lida em **JS** e aplicada como a classe
 * `.high-contrast` — o mesmo caminho do toggle, que tem efeito real porque o provider reaplica a
 * skin depois de mexer na classe (limpando as vars inline que a venceriam).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

// O provider reaplica o preset ao mexer na classe; aqui isso é irrelevante e caro — mockado.
vi.mock('@/components/settings/theme/presets', () => ({
  loadThemeConfig: () => ({ preset: 'default' }),
  applyThemePreset: vi.fn(),
}));

import { HighContrastProvider, useHighContrast } from '@/components/theme/HighContrastToggle';

/** jsdom não implementa `matchMedia`: este mock é o próprio objeto de mídia, controlável. */
function mockMatchMedia(matchesInicial: boolean) {
  const ouvintes = new Set<() => void>();
  const consulta = {
    matches: matchesInicial,
    media: '(prefers-contrast: more)',
    addEventListener: (_evento: string, fn: () => void) => { ouvintes.add(fn); },
    removeEventListener: (_evento: string, fn: () => void) => { ouvintes.delete(fn); },
    notificar: () => { ouvintes.forEach((fn) => fn()); },
  };
  vi.stubGlobal('matchMedia', vi.fn(() => consulta));
  return consulta;
}

function Sonda() {
  const { toggleHighContrast } = useHighContrast();
  return <button onClick={toggleHighContrast}>alternar</button>;
}

const temClasse = () => document.documentElement.classList.contains('high-contrast');

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.className = '';
});

describe('preferência de contraste do sistema operacional', () => {
  it('sistema pede mais contraste: a classe é aplicada SEM o usuário ligar nada', () => {
    mockMatchMedia(true);
    render(<HighContrastProvider><Sonda /></HighContrastProvider>);
    expect(temClasse()).toBe(true);
  });

  it('sem preferência do sistema: nenhuma classe, comportamento de sempre', () => {
    mockMatchMedia(false);
    render(<HighContrastProvider><Sonda /></HighContrastProvider>);
    expect(temClasse()).toBe(false);
  });

  it('o sistema muda durante a sessão: a classe acompanha sem recarregar a página', () => {
    const consulta = mockMatchMedia(false);
    render(<HighContrastProvider><Sonda /></HighContrastProvider>);
    expect(temClasse()).toBe(false);

    act(() => { consulta.matches = true; consulta.notificar(); });
    expect(temClasse()).toBe(true);

    act(() => { consulta.matches = false; consulta.notificar(); });
    expect(temClasse()).toBe(false);
  });

  it('usuário desliga o toggle com o sistema pedindo contraste: a classe PERMANECE', () => {
    mockMatchMedia(true);
    render(<HighContrastProvider><Sonda /></HighContrastProvider>);
    expect(temClasse()).toBe(true);

    act(() => { screen.getByRole('button', { name: 'alternar' }).click(); });

    // O toggle marcou "usuário não quer", mas o sistema continua pedindo: o contraste segue ativo.
    expect(localStorage.getItem('highContrast')).toBe('true'); // o clique liga (estava null)
    expect(temClasse()).toBe(true);
  });

  it('sem preferência do sistema, o toggle do usuário continua mandando', () => {
    mockMatchMedia(false);
    render(<HighContrastProvider><Sonda /></HighContrastProvider>);
    expect(temClasse()).toBe(false);
    act(() => { screen.getByRole('button', { name: 'alternar' }).click(); });
    expect(temClasse()).toBe(true);
    act(() => { screen.getByRole('button', { name: 'alternar' }).click(); });
    expect(temClasse()).toBe(false);
  });
});
