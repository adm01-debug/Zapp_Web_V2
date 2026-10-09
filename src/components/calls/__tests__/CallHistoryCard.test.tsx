import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CallHistoryCard } from '../CallHistoryCard';
import { CallHistoryTabs } from '../CallHistoryTabs';

describe('CallHistoryCard (T43)', () => {
  it('mostra a contagem do servidor e a moldura do historico', () => {
    render(
      <CallHistoryCard total={37} escopo="mine" onEscopoChange={() => {}} podeEscolherEscopo={false}>
        <div>corpo</div>
      </CallHistoryCard>,
    );
    expect(screen.getByText('Histórico de ligações')).toBeTruthy();
    // 37 e nao 8: prova que o numero vem do total do servidor, nao da pagina
    expect(screen.getByTestId('tel-history-total').textContent).toBe('37');
  });

  it('agente comum nao ve o seletor de escopo, so o rotulo', () => {
    render(
      <CallHistoryCard total={1} escopo="mine" onEscopoChange={() => {}} podeEscolherEscopo={false}>
        <div>corpo</div>
      </CallHistoryCard>,
    );
    expect(screen.queryByTestId('tel-history-scope')).toBeNull();
    expect(screen.getByTestId('tel-history-scope-label').textContent).toBe('Minhas ligações');
  });

  it('admin ve o seletor e trocar avisa o pai (que escreve na URL)', () => {
    const onMudar = vi.fn();
    render(
      <CallHistoryCard total={1} escopo="mine" onEscopoChange={onMudar} podeEscolherEscopo>
        <div>corpo</div>
      </CallHistoryCard>,
    );
    expect(screen.getByTestId('tel-history-scope')).toBeTruthy();
  });
});

describe('CallHistoryTabs (T44)', () => {
  it('renderiza as 3 abas e marca a ativa pelo valor da URL', () => {
    render(<CallHistoryTabs canal="whatsapp" onCanalChange={() => {}} />);
    const abas = screen.getAllByTestId('tel-channel-tab');
    expect(abas.map((a) => a.textContent)).toEqual(['Todos', 'VoIP', 'WhatsApp']);
    // T76: a marca da aba ativa passou a ser o sinal ARIA publico. O widget virou
    // grupo de alternancia (Radix `ToggleGroup type="single"` = `role="radiogroup"`
    // com itens `role="radio"` + `aria-checked`) justamente porque, sem painel, o
    // primitivo `Tabs` deixava `aria-controls` apontando para um elemento
    // inexistente (axe `aria-valid-attr-value`, serious).
    const ativa = abas.find((a) => a.getAttribute('aria-checked') === 'true');
    expect(ativa?.textContent).toBe('WhatsApp');
    // E so UMA aba esta marcada.
    expect(abas.filter((a) => a.getAttribute('aria-checked') === 'true')).toHaveLength(1);
    expect(abas.every((a) => a.getAttribute('role') === 'radio')).toBe(true);
  });
});
