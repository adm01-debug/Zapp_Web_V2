import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SummaryResult } from '../SummaryResult';

/**
 * R2-A11Y — "botões de voz do resumo sem nome acessível e sem alvo confortável".
 *
 * Os botões só traziam ícone (sem texto visível), então o nome acessível era
 * vazio: quem usa leitor de tela não sabia o que cada botão fazia nem quando a
 * leitura estava em andamento. O alvo também era 24x24px (h-6 w-6).
 *
 * O teste renderiza o componente REAL e lê o papel/nome acessível que o leitor
 * de tela enxerga — não inspeciona props nem mock interno.
 */

const SUMMARY = {
  summary: 'Cliente pediu orçamento de 500 canecas.',
  keyPoints: ['Prazo até sexta', 'Fechamento por Pix'],
  nextSteps: ['Enviar catálogo', 'Confirmar prazo'],
};

function props(overrides: Partial<Parameters<typeof SummaryResult>[0]> = {}) {
  return {
    summary: SUMMARY,
    isTtsPlaying: false,
    isTtsLoading: false,
    lastTtsText: null as string | null,
    onPlayTts: vi.fn(),
    buildFullNarrationText: () => 'narração completa',
    ...overrides,
  };
}

describe('SummaryResult · nomes acessíveis dos botões de voz', () => {
  it('cada botão de voz tem nome acessível próprio (não só o ícone)', () => {
    render(<SummaryResult {...props()} />);

    expect(screen.getByRole('button', { name: 'Ouvir o resumo em voz alta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ouvir os pontos-chave em voz alta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ouvir os próximos passos em voz alta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ouvir Tudo — ouvir o resumo completo em voz alta' })).toBeInTheDocument();
  });

  it('o nome acessível do "Ouvir Tudo" começa com o texto visível (WCAG 2.5.3)', () => {
    render(<SummaryResult {...props()} />);

    const botao = screen.getByRole('button', { name: /^Ouvir Tudo/ });
    expect(botao).toHaveTextContent('Ouvir Tudo');
  });

  it('o nome acessível acompanha o estado: quem está tocando vira "Pausar"/"Parar"', () => {
    const { rerender } = render(<SummaryResult {...props()} />);

    rerender(<SummaryResult {...props({ isTtsPlaying: true, lastTtsText: SUMMARY.summary })} />);

    // Só o trecho que está tocando troca de nome; os demais continuam "Ouvir...".
    expect(screen.getByRole('button', { name: 'Pausar a leitura do resumo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Parar — interromper a leitura do resumo completo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ouvir os pontos-chave em voz alta' })).toBeInTheDocument();
  });

  it('o estado de carregamento usa o rótulo dedicado (sem derivar do rótulo de reprodução)', () => {
    render(<SummaryResult {...props({ isTtsLoading: true, lastTtsText: SUMMARY.summary })} />);

    // O botão do trecho que carrega anuncia o carregamento; os demais seguem "Ouvir...".
    expect(screen.getByRole('button', { name: 'Carregando a leitura do resumo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ouvir os pontos-chave em voz alta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ouvir Tudo — carregando a leitura do resumo completo' })).toBeInTheDocument();
  });

  it('o botão de voz tem alvo maior que 24px (h-8 w-8)', () => {
    render(<SummaryResult {...props()} />);

    const botaoResumo = screen.getByRole('button', { name: 'Ouvir o resumo em voz alta' });
    expect(botaoResumo.className).toContain('h-8');
    expect(botaoResumo.className).toContain('w-8');
  });
});
