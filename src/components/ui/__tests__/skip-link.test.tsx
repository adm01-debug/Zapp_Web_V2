import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SkipLinks } from '@/components/ui/skip-link';

// SL-103: o aviso de "Pressione Tab" era um `motion.div` do framer-motion
// (initial opacity 0 → animado por JS). Ele só fica pronto depois de um quadro
// de animação e, em troca, arrasta o framer-motion para o grafo inicial. Agora é
// um `div` com a animação CSS do projeto (`animate-slide-down`): visível já no
// primeiro quadro, sem JS de animação.
//
// O alvo `#main-content`/`#main-navigation` precisa estar no documento ANTES da
// montagem: `SkipLinks` só renderiza o atalho cujo alvo existe.
function montarComAlvos() {
  const main = document.createElement('main');
  main.id = 'main-content';
  main.tabIndex = -1;
  const nav = document.createElement('nav');
  nav.id = 'main-navigation';
  nav.tabIndex = -1;
  document.body.append(main, nav);
  return render(<SkipLinks />);
}

describe('SkipLinks', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Element.prototype.scrollIntoView = vi.fn() as unknown as Element['scrollIntoView'];
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('não mostra o aviso de Tab enquanto o usuário não aperta Tab', () => {
    montarComAlvos();
    expect(screen.queryByText(/para navegar/i)).toBeNull();
  });

  it('mostra o aviso JÁ VISÍVEL ao apertar Tab e o esconde sozinho depois de 3 s', () => {
    montarComAlvos();

    fireEvent.keyDown(window, { key: 'Tab' });

    const aviso = screen.getByText(/para navegar/i);
    // Visível no mesmo instante do Tab: sem esperar quadro de animação (com o
    // `motion.div` anterior o elemento montava com opacity 0 inline e só
    // aparecia quando a animação rodava).
    expect(aviso).toBeVisible();
    expect(aviso).toHaveTextContent('Pressione');
    expect(aviso).toHaveTextContent('Tab');

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.queryByText(/para navegar/i)).toBeNull();
  });

  it('só o Tab sem shift liga o aviso', () => {
    montarComAlvos();

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(screen.queryByText(/para navegar/i)).toBeNull();

    fireEvent.keyDown(window, { key: 'Tab' });
    expect(screen.getByText(/para navegar/i)).toBeVisible();
  });

  it('renderiza o atalho só para os alvos que existem na tela', () => {
    montarComAlvos();

    expect(screen.getByRole('link', { name: /pular para conteúdo principal/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /pular para navegação/i })).toBeInTheDocument();
    // Sem `#inbox-section` nem `#search-input` no documento: nada de atalho para alvo que não existe.
    expect(screen.queryByRole('link', { name: /pular para conversas/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /pular para busca/i })).toBeNull();
  });

  it('ao clicar, leva o foco para o alvo do atalho', () => {
    montarComAlvos();

    const atalho = screen.getByRole('link', { name: /pular para conteúdo principal/i });
    const alvo = document.getElementById('main-content') as HTMLElement;

    fireEvent.click(atalho);

    expect(alvo.scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(alvo);
  });
});
