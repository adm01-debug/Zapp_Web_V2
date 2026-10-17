/**
 * CV-041–050 — Testes do componente LiveSuggestions.
 * CV-043 — Caminhos estratégicos (avançar, descobrir, relacionar).
 * CV-047 — Split de mensagem.
 * CV-049 — Tone chips.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LiveSuggestions } from '../LiveSuggestions';
import { getRelevantPlays } from '@/data/copilot/winning-plays';
import type { LiveSuggestion } from '@/hooks/copilot/useLiveSuggestions';

const mockSuggestions: LiveSuggestion[] = [
  {
    id: '1',
    path: 'avancar',
    text: 'Ótimo! Posso gerar um mockup com o logo de vocês?',
    play_name: 'Fechamento pelo próximo passo',
    sources: [{ text: 'Cliente sinalizou interesse em fechar', letter: 'I' }],
    created_at: '2026-10-16T21:00:00Z',
  },
  {
    id: '2',
    path: 'descobrir',
    text: 'Vocês já têm uma faixa de investimento por peça em mente?',
    play_name: 'Descoberta de verba',
    sources: [{ text: 'Orçamento não foi mencionado', letter: 'B' }],
    created_at: '2026-10-16T21:00:01Z',
  },
  {
    id: '3',
    path: 'relacionar',
    text: 'Na SIPAT do ano passado vocês levaram as garrafas, certo?',
    sources: [],
    split_messages: ['Lembro que na SIPAT do ano passado vocês levaram as garrafas.', 'Esse ano querem manter ou explorar outra opção?'],
    created_at: '2026-10-16T21:00:02Z',
  },
];

describe('LiveSuggestions CV-041', () => {
  it('renderiza 3 cartões de sugestão', () => {
    render(<LiveSuggestions suggestions={mockSuggestions} loading={false} onUse={() => {}} />);
    const useButtons = screen.getAllByText('Usar');
    expect(useButtons).toHaveLength(3);
  });

  it('exibe labels de caminho corretos', () => {
    render(<LiveSuggestions suggestions={mockSuggestions} loading={false} onUse={() => {}} />);
    expect(screen.getByText('Avançar')).toBeTruthy();
    expect(screen.getByText('Descobrir')).toBeTruthy();
    expect(screen.getByText('Relacionar')).toBeTruthy();
  });

  it('chama onUse com o texto correto ao clicar em Usar', async () => {
    const handler = vi.fn();
    render(<LiveSuggestions suggestions={[mockSuggestions[0]]} loading={false} onUse={handler} />);
    await userEvent.click(screen.getByText('Usar'));
    expect(handler).toHaveBeenCalledWith(mockSuggestions[0].text);
  });

  it('exibe play_name quando presente', () => {
    render(<LiveSuggestions suggestions={[mockSuggestions[0]]} loading={false} onUse={() => {}} />);
    expect(screen.getByText('Fechamento pelo próximo passo')).toBeTruthy();
  });

  it('exibe estado de carregamento quando loading=true e sem sugestões', () => {
    render(<LiveSuggestions suggestions={[]} loading={true} onUse={() => {}} />);
    expect(screen.getByText(/RADAR analisando/i)).toBeTruthy();
  });

  it('exibe estado vazio quando sem sugestões', () => {
    render(<LiveSuggestions suggestions={[]} loading={false} onUse={() => {}} />);
    expect(screen.getByText(/Aguardando momento-chave/i)).toBeTruthy();
  });
});

describe('LiveSuggestions CV-049 tone chips', () => {
  it('renderiza os 5 tone chips', () => {
    render(<LiveSuggestions suggestions={[]} loading={false} onUse={() => {}} />);
    expect(screen.getByText('Formal')).toBeTruthy();
    expect(screen.getByText('Casual')).toBeTruthy();
    expect(screen.getByText('Curta')).toBeTruthy();
    expect(screen.getByText('Confiante')).toBeTruthy();
    expect(screen.getByText('Urgente')).toBeTruthy();
  });

  it('alterna chip ativo ao clicar duas vezes', async () => {
    render(<LiveSuggestions suggestions={[]} loading={false} onUse={() => {}} />);
    const formalBtn = screen.getByText('Formal');
    await userEvent.click(formalBtn);
    await userEvent.click(formalBtn);
  });
});

describe('LiveSuggestions CV-047 split', () => {
  it('mostra botão de split para sugestão com split_messages', () => {
    render(
      <LiveSuggestions
        suggestions={[mockSuggestions[2]]}
        loading={false}
        onUse={() => {}}
        onUseSplit={() => {}}
      />,
    );
    expect(screen.getByText(/Enviar em partes/i)).toBeTruthy();
  });

  it('chama onUseSplit ao clicar "Usar todas as partes"', async () => {
    const splitHandler = vi.fn();
    render(
      <LiveSuggestions
        suggestions={[mockSuggestions[2]]}
        loading={false}
        onUse={() => {}}
        onUseSplit={splitHandler}
      />,
    );
    await userEvent.click(screen.getByText(/Enviar em partes/i));
    await userEvent.click(screen.getByText(/Usar todas as partes/i));
    expect(splitHandler).toHaveBeenCalledWith(mockSuggestions[2].split_messages);
  });
});

describe('getRelevantPlays CV-042', () => {
  it('filtra por etapa', () => {
    const plays = getRelevantPlays('E5', []);
    expect(plays.every((p) => p.stages.includes('E5'))).toBe(true);
  });

  it('inclui plays sem brindeLetter independente das letras faltando', () => {
    const plays = getRelevantPlays('E3', []);
    const withoutLetter = plays.filter((p) => !p.brindeLetter);
    expect(withoutLetter.length).toBeGreaterThan(0);
  });

  it('retorna no máximo 5 plays', () => {
    const plays = getRelevantPlays('E2', ['B', 'R', 'I', 'N', 'D', 'E']);
    expect(plays.length).toBeLessThanOrEqual(5);
  });
});
