import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActiveCallPanel } from '../ActiveCallPanel';
import { POS_CHAMADA_MS } from '../PostCallSummary';

/**
 * R2-AUTH-051 (#275): o resumo pos-chamada fecha sozinho em `POS_CHAMADA_MS` e
 * leva embora a anotacao que o agente ainda esta digitando.
 *
 * O teste percorre o caminho real da tela: `ActiveCallPanel` em `ended` monta o
 * `PostCallSummary` (o mesmo que `TelefoniaView` renderiza no slot da chamada),
 * e o fechamento e observado pelo `dispatch({ type: 'RESET' })` que o painel de
 * verdade usa para voltar a `idle` — e desmontar o resumo.
 *
 * Os fakes ficam em `vi.hoisted` porque os factories de `vi.mock` sobem acima
 * dos imports do modulo.
 */
const fakes = vi.hoisted(() => ({
  dispatch: vi.fn(),
  addCallNotes: vi.fn(),
  sessao: {
    status: 'ended',
    channel: 'voip' as const,
    phone: '+551****8888',
    name: 'Ana Paula',
  },
}));

vi.mock('@/providers/CallSessionProvider', () => ({
  useCallSession: () => ({
    session: fakes.sessao,
    sessionId: 'sessao-1',
    currentCallId: 'chamada-1',
    currentNumber: fakes.sessao.phone,
    isMuted: false,
    dispatch: fakes.dispatch,
  }),
}));

vi.mock('@/hooks/communication/useCalls', () => ({
  useCalls: () => ({ addCallNotes: fakes.addCallNotes }),
}));

vi.mock('@/hooks/calls/useCallChannels', () => ({
  useCallChannels: () => ({
    voip: { canDial: true, reason: null, canReject: true },
    whatsapp: { canDial: true, reason: null },
  }),
}));

function renderResumo() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ActiveCallPanel segundos={42} />
    </QueryClientProvider>,
  );
}

describe('PostCallSummary — anotacao em edicao x fechamento automatico', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fakes.dispatch.mockClear();
    fakes.addCallNotes.mockReset();
    fakes.addCallNotes.mockResolvedValue(true);
    fakes.sessao.status = 'ended';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('nao fecha o resumo enquanto a anotacao esta em edicao', () => {
    renderResumo();
    const campo = screen.getByTestId('tel-post-call-notes') as HTMLTextAreaElement;

    fireEvent.change(campo, { target: { value: 'Cliente pediu retorno amanha' } });
    act(() => {
      vi.advanceTimersByTime(POS_CHAMADA_MS + 1000);
    });

    expect(fakes.dispatch).not.toHaveBeenCalledWith({ type: 'RESET' });
    expect(campo).toHaveValue('Cliente pediu retorno amanha');
  });

  it('mantem o fechamento automatico quando nao ha anotacao em edicao', () => {
    renderResumo();

    act(() => {
      vi.advanceTimersByTime(POS_CHAMADA_MS);
    });

    expect(fakes.dispatch).toHaveBeenCalledWith({ type: 'RESET' });
  });

  it('volta a contar o fechamento depois que a anotacao e salva', async () => {
    renderResumo();
    fireEvent.change(screen.getByTestId('tel-post-call-notes'), {
      target: { value: 'Retornar as 15h' },
    });
    act(() => {
      vi.advanceTimersByTime(POS_CHAMADA_MS + 1000);
    });
    expect(fakes.dispatch).not.toHaveBeenCalledWith({ type: 'RESET' });

    await act(async () => {
      fireEvent.click(screen.getByTestId('tel-post-call-save'));
    });
    expect(fakes.addCallNotes).toHaveBeenCalledWith('chamada-1', 'Retornar as 15h');

    act(() => {
      vi.advanceTimersByTime(POS_CHAMADA_MS);
    });
    expect(fakes.dispatch).toHaveBeenCalledWith({ type: 'RESET' });
  });
});
