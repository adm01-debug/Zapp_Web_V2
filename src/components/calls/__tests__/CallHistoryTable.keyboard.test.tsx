import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
