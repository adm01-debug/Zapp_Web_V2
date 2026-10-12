import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';

/**
 * TL-054A (X050) — hook/controlador ÚNICO do ciclo de vida de campanha do Talk X.
 *
 * O teste é a trava anti-regressão do contrato que as telas vão consumir:
 *   request({ kind, target })  → abre o diálogo único (não dispara ainda)
 *   confirm()                  → executa a ação pelas operações de `useTalkX`
 *   isPending                  → enquanto true, não aceita nova ação nem fecha
 *   error                      → mantém o diálogo aberto para a tela tratar
 *
 * O hook é mockado via `useTalkX` para que a prova seja do controlador, sem
 * tocar em rede (a guarda de rede da suíte recusaria o Supabase real).
 */

const talkx = vi.hoisted(() => ({
  startCampaign: vi.fn(),
  pauseCampaign: vi.fn(),
  cancelCampaign: vi.fn(),
  updateCampaign: { mutateAsync: vi.fn() },
}));

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => talkx,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import {
  useTalkXLifecycle,
  talkXLifecycleCopy,
  TalkXLifecycleDialog,
} from '../useTalkXLifecycle';
import type {
  TalkXLifecycleController,
  TalkXLifecycleKind,
} from '../useTalkXLifecycle';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const TARGET = { id: 'c1', name: 'Campanha X' };

describe('useTalkXLifecycle — controlador único (X050)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    talkx.startCampaign.mockResolvedValue(true);
    talkx.pauseCampaign.mockResolvedValue(undefined);
    talkx.cancelCampaign.mockResolvedValue(undefined);
    talkx.updateCampaign.mutateAsync.mockResolvedValue({});
  });

  it('pausa com motivo usando a operação existente `pauseCampaign`', async () => {
    const { result } = renderHook(() => useTalkXLifecycle());

    act(() => {
      result.current.request({ kind: 'pause', target: TARGET });
    });
    act(() => {
      result.current.setReason('janela de envio encerrada');
    });
    await act(async () => {
      await result.current.confirm();
    });

    expect(talkx.pauseCampaign).toHaveBeenCalledWith('c1', 'janela de envio encerrada');
    expect(result.current.intent).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('pausa sem motivo envia `undefined` em vez de string vazia', async () => {
    const { result } = renderHook(() => useTalkXLifecycle());

    act(() => {
      result.current.request({ kind: 'pause', target: TARGET });
    });
    await act(async () => {
      await result.current.confirm();
    });

    expect(talkx.pauseCampaign).toHaveBeenCalledWith('c1', undefined);
  });

  it.each(['start', 'resume'] as const)('`%s` dispara pela `startCampaign`', async (kind) => {
    const { result } = renderHook(() => useTalkXLifecycle());

    act(() => {
      result.current.request({ kind, target: TARGET });
    });
    await act(async () => {
      await result.current.confirm();
    });

    expect(talkx.startCampaign).toHaveBeenCalledWith('c1');
    expect(result.current.intent).toBeNull();
  });

  it('cancela pela `cancelCampaign`', async () => {
    const { result } = renderHook(() => useTalkXLifecycle());

    act(() => {
      result.current.request({ kind: 'cancel', target: TARGET });
    });
    await act(async () => {
      await result.current.confirm();
    });

    expect(talkx.cancelCampaign).toHaveBeenCalledWith('c1');
    expect(result.current.intent).toBeNull();
  });

  it('agenda pela `updateCampaign` com status `scheduled`', async () => {
    const { result } = renderHook(() => useTalkXLifecycle());
    const scheduledAt = '2026-10-10T15:00:00.000Z';

    act(() => {
      result.current.request({ kind: 'schedule', target: TARGET, scheduledAt });
    });
    await act(async () => {
      await result.current.confirm();
    });

    expect(talkx.updateCampaign.mutateAsync).toHaveBeenCalledWith({
      id: 'c1',
      status: 'scheduled',
      scheduled_at: scheduledAt,
    });
    expect(result.current.intent).toBeNull();
  });

  // Recusa literal do [refazer 1]: `scheduled_at: current.scheduledAt ?? null`
  // gravava `status: 'scheduled'` com data nula quando a tela não passava a data.
  const AGENDAMENTO_SEM_DATA: Array<[string, string | null | undefined]> = [
    ['ausente', undefined],
    ['nulo', null],
    ['vazio', ''],
    ['só espaços', '   '],
    ['inválido', 'não é data'],
  ];

  it.each(AGENDAMENTO_SEM_DATA)(
    'agendar com data %s não chama a mutação e mantém o erro com a intenção aberta',
    async (_rotulo, scheduledAt) => {
      const { result } = renderHook(() => useTalkXLifecycle());

      act(() => {
        result.current.request({
          kind: 'schedule',
          target: TARGET,
          scheduledAt: scheduledAt as string,
        });
      });
      await act(async () => {
        await result.current.confirm();
      });

      expect(talkx.updateCampaign.mutateAsync).not.toHaveBeenCalled();
      expect(result.current.error).toBe('Escolha a data e hora do agendamento.');
      expect(result.current.intent?.kind).toBe('schedule');
      expect(result.current.isPending).toBe(false);
    },
  );

  it('enquanto a ação está pendente não aceita nova ação nem fecha', async () => {
    const pending = deferred<boolean>();
    talkx.startCampaign.mockReturnValue(pending.promise);

    const { result } = renderHook(() => useTalkXLifecycle());
    act(() => {
      result.current.request({ kind: 'start', target: TARGET });
    });

    let confirmPromise: Promise<void> = Promise.resolve();
    act(() => {
      confirmPromise = result.current.confirm();
    });
    expect(result.current.isPending).toBe(true);

    let secondRequest = true;
    let closed = true;
    act(() => {
      secondRequest = result.current.request({ kind: 'cancel', target: TARGET });
      closed = result.current.close();
    });

    expect(secondRequest).toBe(false);
    expect(closed).toBe(false);
    expect(result.current.intent?.kind).toBe('start');

    await act(async () => {
      pending.resolve(true);
      await confirmPromise;
    });

    expect(result.current.isPending).toBe(false);
    expect(result.current.intent).toBeNull();
  });

  it('erro mantém a intenção aberta (modal/estado) para a tela tratar e permite tentar de novo', async () => {
    talkx.pauseCampaign.mockRejectedValueOnce(new Error('A campanha já foi encerrada.'));

    const { result } = renderHook(() => useTalkXLifecycle());
    act(() => {
      result.current.request({ kind: 'pause', target: TARGET });
    });
    await act(async () => {
      await result.current.confirm();
    });

    expect(result.current.error).toBe('A campanha já foi encerrada.');
    expect(result.current.intent).not.toBeNull();
    expect(result.current.isPending).toBe(false);

    // A tela pode tentar de novo sem reabrir: o sucesso limpa o erro e fecha.
    await act(async () => {
      await result.current.confirm();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.intent).toBeNull();
  });

  it('disparo recusado (`startCampaign` devolve false) vira erro em vez de fechar em silêncio', async () => {
    talkx.startCampaign.mockResolvedValue(false);

    const { result } = renderHook(() => useTalkXLifecycle());
    act(() => {
      result.current.request({ kind: 'start', target: TARGET });
    });
    await act(async () => {
      await result.current.confirm();
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.intent).not.toBeNull();
  });

  it('start sem `run` mantém o caminho atual da `startCampaign` (compatibilidade)', async () => {
    const { result } = renderHook(() => useTalkXLifecycle());

    act(() => {
      result.current.request({ kind: 'start', target: { ...TARGET, total_recipients: 120 } });
    });
    await act(async () => {
      await result.current.confirm();
    });

    expect(talkx.startCampaign).toHaveBeenCalledWith('c1');
    expect(result.current.intent).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('start com `run` usa o executor próprio da tela em vez da `startCampaign`', async () => {
    const run = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useTalkXLifecycle());

    act(() => {
      result.current.request({ kind: 'start', target: TARGET, run });
    });
    await act(async () => {
      await result.current.confirm();
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(talkx.startCampaign).not.toHaveBeenCalled();
    expect(result.current.intent).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('`run` síncrono devolvendo `true` também é aceito', async () => {
    const run = vi.fn(() => true);
    const { result } = renderHook(() => useTalkXLifecycle());

    act(() => {
      result.current.request({ kind: 'start', target: TARGET, run });
    });
    await act(async () => {
      await result.current.confirm();
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(result.current.intent).toBeNull();
  });

  it('`run` devolvendo `false` NÃO é sucesso: erro e diálogo aberto', async () => {
    const run = vi.fn().mockResolvedValue(false);
    const { result } = renderHook(() => useTalkXLifecycle());

    act(() => {
      result.current.request({ kind: 'start', target: TARGET, run });
    });
    await act(async () => {
      await result.current.confirm();
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.intent).not.toBeNull();
    expect(result.current.isPending).toBe(false);
    expect(talkx.startCampaign).not.toHaveBeenCalled();
  });

  it('`run` que lança mantém o diálogo aberto com o erro lançado', async () => {
    const run = vi.fn().mockRejectedValue(new Error('Falha ao salvar o rascunho.'));
    const { result } = renderHook(() => useTalkXLifecycle());

    act(() => {
      result.current.request({ kind: 'start', target: TARGET, run });
    });
    await act(async () => {
      await result.current.confirm();
    });

    expect(result.current.error).toBe('Falha ao salvar o rascunho.');
    expect(result.current.intent).not.toBeNull();
    expect(talkx.startCampaign).not.toHaveBeenCalled();
  });
});

describe('TalkXLifecycleDialog — diálogo único ligado ao controlador', () => {
  let live: TalkXLifecycleController | null = null;

  function Harness({
    kind = 'start',
    scheduledAt,
    details,
  }: {
    kind?: TalkXLifecycleKind;
    scheduledAt?: string;
    details?: { label: string; value: string }[];
  }) {
    const lifecycle = useTalkXLifecycle();
    live = lifecycle;
    return (
      <>
        <button
          type="button"
          onClick={() => lifecycle.request({ kind, target: TARGET, scheduledAt, details })}
        >
          abrir
        </button>
        <TalkXLifecycleDialog controller={lifecycle} />
      </>
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    live = null;
    talkx.startCampaign.mockResolvedValue(true);
    talkx.pauseCampaign.mockResolvedValue(undefined);
  });

  it('mostra o texto do ciclo e envia o motivo digitado na pausa', async () => {
    render(<Harness kind="pause" />);

    fireEvent.click(screen.getByRole('button', { name: 'abrir' }));
    expect(await screen.findByText(talkXLifecycleCopy.pause.title)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Motivo da pausa (opcional)'), {
      target: { value: 'fora da janela' },
    });
    fireEvent.click(screen.getByRole('button', { name: talkXLifecycleCopy.pause.confirmLabel }));

    await waitFor(() => {
      expect(talkx.pauseCampaign).toHaveBeenCalledWith('c1', 'fora da janela');
    });
    await waitFor(() => {
      expect(screen.queryByText(talkXLifecycleCopy.pause.title)).not.toBeInTheDocument();
    });
  });

  it('não fecha enquanto a ação está em andamento', async () => {
    const pending = deferred<boolean>();
    talkx.startCampaign.mockReturnValue(pending.promise);
    render(<Harness kind="start" />);

    fireEvent.click(screen.getByRole('button', { name: 'abrir' }));
    fireEvent.click(await screen.findByRole('button', { name: talkXLifecycleCopy.start.confirmLabel }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: talkXLifecycleCopy.start.pendingLabel })).toBeDisabled();
    });

    expect(live?.close()).toBe(false);
    expect(screen.getByText(talkXLifecycleCopy.start.title)).toBeInTheDocument();

    await act(async () => {
      pending.resolve(true);
    });
    await waitFor(() => {
      expect(screen.queryByText(talkXLifecycleCopy.start.title)).not.toBeInTheDocument();
    });
  });

  it('mantém o diálogo aberto com o erro visível para a tela tratar', async () => {
    talkx.pauseCampaign.mockRejectedValueOnce(new Error('A campanha já foi encerrada.'));
    render(<Harness kind="pause" />);

    fireEvent.click(screen.getByRole('button', { name: 'abrir' }));
    fireEvent.click(await screen.findByRole('button', { name: talkXLifecycleCopy.pause.confirmLabel }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('A campanha já foi encerrada.');
    expect(screen.getByText(talkXLifecycleCopy.pause.title)).toBeInTheDocument();
  });

  it('agendar sem data mantém o diálogo aberto com o aviso e sem chamar a mutação', async () => {
    render(<Harness kind="schedule" />);

    fireEvent.click(screen.getByRole('button', { name: 'abrir' }));
    fireEvent.click(
      await screen.findByRole('button', { name: talkXLifecycleCopy.schedule.confirmLabel }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Escolha a data e hora do agendamento.');
    expect(screen.getByText(talkXLifecycleCopy.schedule.title)).toBeInTheDocument();
    expect(talkx.updateCampaign.mutateAsync).not.toHaveBeenCalled();
  });

  it('cada ação do ciclo tem rótulo próprio no diálogo único', () => {
    const kinds: TalkXLifecycleKind[] = ['start', 'pause', 'resume', 'cancel', 'schedule'];
    const titles = kinds.map((kind) => talkXLifecycleCopy[kind].title);
    expect(new Set(titles).size).toBe(kinds.length);
    for (const kind of kinds) {
      expect(talkXLifecycleCopy[kind].confirmLabel).toBeTruthy();
      expect(talkXLifecycleCopy[kind].cancelLabel).toBeTruthy();
    }
  });

  it('renderiza as linhas de `details` do pedido no diálogo único', async () => {
    render(
      <Harness
        kind="start"
        details={[
          { label: 'Segmento', value: 'Contatos ZAPP' },
          { label: 'Destinatários', value: '120 contatos' },
          { label: 'Envio', value: 'Imediato' },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'abrir' }));

    expect(await screen.findByText('Segmento')).toBeInTheDocument();
    expect(screen.getByText('Contatos ZAPP')).toBeInTheDocument();
    expect(screen.getByText('Destinatários')).toBeInTheDocument();
    expect(screen.getByText('120 contatos')).toBeInTheDocument();
    expect(screen.getByText('Envio')).toBeInTheDocument();
    expect(screen.getByText('Imediato')).toBeInTheDocument();
  });

  it('sem `details` preserva título e descrição do texto único', async () => {
    render(<Harness kind="start" />);

    fireEvent.click(screen.getByRole('button', { name: 'abrir' }));

    expect(await screen.findByText(talkXLifecycleCopy.start.title)).toBeInTheDocument();
    expect(screen.getByText(talkXLifecycleCopy.start.description)).toBeInTheDocument();
  });
});
