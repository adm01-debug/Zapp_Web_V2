import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import type { SearchMyCallsRow } from '@/hooks/calls/useMyCalls';
import { CallHistoryTable } from '../CallHistoryTable';

const row = {
  id: 'call-1',
  peer_name: 'Ana',
  contact_name: null,
  peer_number: '5511999999999',
  contact_phone: '5511999999999',
  contact_avatar_url: null,
  channel: 'voip',
  direction: 'outbound',
  status: 'ended',
  result: 'completed',
  started_at: '2026-10-05T14:00:00-03:00',
  answered_at: '2026-10-05T14:00:05-03:00',
  ended_at: '2026-10-05T14:01:05-03:00',
  duration_seconds: 60,
  recording_status: null,
} as unknown as SearchMyCallsRow;

describe('CallHistoryTable — acionamento por teclado', () => {
  it.each(['Enter', ' '])('não cancela %j no botão Ligar de volta', (key) => {
    const onSelecionar = vi.fn();
    const onLigarDeVolta = vi.fn();

    render(
      <CallHistoryTable
        rows={[row]}
        selecionadaId={null}
        onSelecionar={onSelecionar}
        onLigarDeVolta={onLigarDeVolta}
      />,
    );

    const callback = screen.getByRole('button', { name: /Ligar de volta para Ana/i });

    // Enter/Espaço precisam chegar ao comportamento nativo do botão. Se a linha
    // ancestral chamar preventDefault, o navegador não produz o clique de ativação.
    expect(fireEvent.keyDown(callback, { key, cancelable: true })).toBe(true);
    expect(onSelecionar).not.toHaveBeenCalled();

    fireEvent.click(callback);
    expect(onLigarDeVolta).toHaveBeenCalledOnce();
  });

  it('mantém Enter na própria linha selecionando o histórico', () => {
    const onSelecionar = vi.fn();

    render(
      <CallHistoryTable
        rows={[row]}
        selecionadaId={null}
        onSelecionar={onSelecionar}
        onLigarDeVolta={vi.fn()}
      />,
    );

    expect(fireEvent.keyDown(screen.getByTestId('tel-row'), { key: 'Enter', cancelable: true })).toBe(false);
    expect(onSelecionar).toHaveBeenCalledWith('call-1');
  });
});

describe('CallHistoryTable — acessibilidade da tabela (T76/SL-110)', () => {
  const segunda = { ...row, id: 'call-2', peer_name: 'Bruno' } as unknown as SearchMyCallsRow;

  function montar(rows: SearchMyCallsRow[]) {
    return render(
      <CallHistoryTable rows={rows} selecionadaId={null} onSelecionar={vi.fn()} onLigarDeVolta={vi.fn()} />,
    );
  }

  it('a tabela ganha nome acessível pelo caption que só o leitor de tela lê', () => {
    montar([row]);

    // Sem o caption a tabela não tem nome acessível ("table" sem nome nenhum).
    const tabela = screen.getByRole('table', { name: 'Histórico de chamadas' });
    const caption = tabela.querySelector('caption');

    expect(caption).not.toBeNull();
    expect(caption).toHaveTextContent('Histórico de chamadas');
    // sr-only = fora da tela (não vira mais uma coluna visível)
    expect(caption).toHaveClass('sr-only');
    expect(screen.queryByRole('columnheader', { name: 'Histórico de chamadas' })).not.toBeInTheDocument();
  });

  it('as setas ↑/↓ andam pelas linhas focáveis e não rolam a página', () => {
    montar([row, segunda]);

    const [primeira, ultima] = screen.getAllByTestId('tel-row');
    primeira.focus();
    expect(document.activeElement).toBe(primeira);

    // fireEvent.keyDown devolve false quando o default foi cancelado: a seta não
    // rola a página e o foco anda para a linha seguinte.
    expect(fireEvent.keyDown(primeira, { key: 'ArrowDown', cancelable: true })).toBe(false);
    expect(document.activeElement).toBe(ultima);

    expect(fireEvent.keyDown(ultima, { key: 'ArrowUp', cancelable: true })).toBe(false);
    expect(document.activeElement).toBe(primeira);

    // Na borda o foco fica onde está (sem escapar do histórico), mas o default
    // da seta continua cancelado para a página não pular.
    expect(fireEvent.keyDown(primeira, { key: 'ArrowUp', cancelable: true })).toBe(false);
    expect(document.activeElement).toBe(primeira);
  });

  it('não tem violação séria/crítica do axe', async () => {
    const { container } = montar([row, segunda]);

    expect(await axe(container)).toHaveNoViolations();
  });
});
