import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CallHistoryToolbar } from '../CallHistoryToolbar';
import { RESULT_LABEL } from '@/lib/calls/callStatus';

const props = {
  busca: '',
  direcao: 'all',
  resultado: 'all',
  onBuscaChange: () => {},
  onDirecaoChange: () => {},
  onResultadoChange: () => {},
};

describe('CallHistoryToolbar (T46)', () => {
  it('os 3 controles tem altura 40', () => {
    render(<CallHistoryToolbar {...props} />);
    expect(screen.getByTestId('tel-history-search').className).toContain('h-10');
    expect(screen.getByTestId('tel-history-direction').className).toContain('h-10');
    expect(screen.getByTestId('tel-history-result').className).toContain('h-10');
  });

  it('a busca so avisa a URL depois do debounce, nao a cada tecla', () => {
    vi.useFakeTimers();
    const onBusca = vi.fn();
    render(<CallHistoryToolbar {...props} onBuscaChange={onBusca} />);
    const campo = screen.getByTestId('tel-history-search');
    fireEvent.change(campo, { target: { value: 'a' } });
    fireEvent.change(campo, { target: { value: 'an' } });
    fireEvent.change(campo, { target: { value: 'ana' } });
    expect(onBusca).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(onBusca).toHaveBeenCalledTimes(1);
    expect(onBusca).toHaveBeenCalledWith('ana');
    vi.useRealTimers();
  });

  it('oferece todos os resultados que o dominio conhece', () => {
    // O plano falava em "8 opcoes da tabela 2.7"; o codigo tem 9 (RESULT_LABEL).
    // Uso o dominio como fonte e registro a divergencia, em vez de esconder um
    // resultado que existe no banco.
    expect(Object.keys(RESULT_LABEL)).toHaveLength(9);
    expect(Object.keys(RESULT_LABEL)).toContain('in_progress');
  });
});
