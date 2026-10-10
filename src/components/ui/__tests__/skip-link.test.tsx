import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SkipLinks } from '@/components/ui/skip-link';

// O ambiente do vitest entrega `import.meta.url` como URL http e `readFileSync` recusa
// esse esquema; a leitura da fonte vai pelo diretório da cópia de trabalho.
const FONTE = readFileSync(resolve(process.cwd(), 'src/components/ui/skip-link.tsx'), 'utf8');

// SL-103C: o aviso de "Pressione Tab" era um `motion.div` do framer-motion
// (initial opacity 0 → animado por JS). Ele só ficava pronto depois de um quadro de
// animação e, em troca, arrastava o runtime de animação para o grafo inicial do app
// (`src/App.tsx` → `skip-link.tsx` → `framer-motion`). Agora é um `div` com a animação
// CSS do projeto (`motion-safe:animate-slide-down`): visível já no primeiro quadro,
// sem JS de animação e sem efeito com movimento reduzido.
//
// Os alvos `#main-content`/`#main-navigation` precisam estar no documento ANTES da
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

function aviso() {
  return screen.getByText(/para navegar/i);
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

    const el = aviso();
    // Visível no mesmo instante do Tab: sem esperar quadro de animação (com o
    // `motion.div` anterior o elemento montava com `opacity: 0` inline e só
    // aparecia quando a animação JS rodava).
    expect(el).toBeVisible();
    expect(el).toHaveTextContent('Pressione');
    expect(el).toHaveTextContent('Tab');

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
    expect(aviso()).toBeVisible();
  });

  it('o aviso nasce com a animação CSS do sistema, sob movimento reduzido liberado', () => {
    montarComAlvos();
    fireEvent.keyDown(window, { key: 'Tab' });

    const el = aviso();
    // `motion-safe:` só aplica a animação quando o usuário NÃO pediu movimento reduzido.
    expect(el.className).toContain('motion-safe:animate-slide-down');
    // Nada de estilo inline de animação: quem monta o aviso é o CSS do tema.
    expect(el.getAttribute('style')).toBeNull();
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

describe('skip-link.tsx — sem o runtime de animação no caminho inicial (SL-103C)', () => {
  it('não importa nem renderiza o runtime de animação por JS', () => {
    expect(FONTE).not.toMatch(/from ['"]framer-motion['"]/);
    expect(FONTE).not.toMatch(/\bmotion\.[a-z]/);
    expect(FONTE).not.toMatch(/\bAnimatePresence\b/);
    expect(FONTE).not.toMatch(/\b(?:initial|animate|exit|whileHover|whileTap)=/);
  });
});
