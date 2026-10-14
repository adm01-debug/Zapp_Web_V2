/**
 * DL1 — `useInitialHighlight` no modelo por tempo (contrato do cartão):
 * procura a cada 250 ms por id ou `external_id`, até 20 tentativas; na 5ª
 * tentativa paga a página anterior UMA única vez; ao esgotar avisa UMA vez;
 * desmontar ou trocar de alvo limpa o timer (nada dispara depois).
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  HIGHLIGHT_ATTEMPT_INTERVAL_MS,
  HIGHLIGHT_LOAD_OLDER_AT_ATTEMPT,
  HIGHLIGHT_MAX_ATTEMPTS,
  findHighlightTarget,
  useInitialHighlight,
  type HighlightableMessage,
} from '@/hooks/chat/useInitialHighlight';

function montar(messages: HighlightableMessage[], messageId: string | null) {
  const onLoadOlder = vi.fn();
  const onFound = vi.fn();
  const onNotFound = vi.fn();
  const hook = renderHook(
    ({ msgs, alvo }: { msgs: HighlightableMessage[]; alvo: string | null }) => useInitialHighlight({
      messageId: alvo,
      messages: msgs,
      onLoadOlder,
      onFound,
      onNotFound,
    }),
    { initialProps: { msgs: messages, alvo: messageId } },
  );
  return { ...hook, onLoadOlder, onFound, onNotFound };
}

function avancarTentativas(n: number) {
  act(() => {
    vi.advanceTimersByTime(HIGHLIGHT_ATTEMPT_INTERVAL_MS * n);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useInitialHighlight — modelo por tempo (DL1)', () => {
  it('acha o alvo no primeiro tick e resolve UMA vez', () => {
    const { onLoadOlder, onFound, onNotFound } = montar(
      [{ id: 'm-1' }, { id: 'm-2' }],
      'm-2',
    );

    // Modelo por timer: nada dispara de forma síncrona na montagem.
    expect(onFound).not.toHaveBeenCalled();

    avancarTentativas(1);
    expect(onFound).toHaveBeenCalledTimes(1);
    expect(onFound).toHaveBeenCalledWith('m-2');
    expect(onLoadOlder).not.toHaveBeenCalled();
    expect(onNotFound).not.toHaveBeenCalled();

    // Timer encerrado ao achar: avançar o relógio não repete.
    avancarTentativas(HIGHLIGHT_MAX_ATTEMPTS);
    expect(onFound).toHaveBeenCalledTimes(1);
    expect(onNotFound).not.toHaveBeenCalled();
  });

  it('acha pelo external_id e devolve o id interno real', () => {
    const { onFound } = montar(
      [{ id: 'interno-9', external_id: 'wa-999' }],
      'wa-999',
    );

    avancarTentativas(1);
    expect(onFound).toHaveBeenCalledTimes(1);
    expect(onFound).toHaveBeenCalledWith('interno-9');
  });

  it('acha depois de pagar a página anterior — onLoadOlder UMA única vez', () => {
    const { rerender, onLoadOlder, onFound, onNotFound } = montar(
      [{ id: 'm-1' }],
      'm-antiga',
    );

    // 4 primeiras tentativas: nem achou, nem pagou.
    avancarTentativas(HIGHLIGHT_LOAD_OLDER_AT_ATTEMPT - 1);
    expect(onFound).not.toHaveBeenCalled();
    expect(onLoadOlder).not.toHaveBeenCalled();

    // 5ª tentativa: paga a página anterior UMA vez.
    avancarTentativas(1);
    expect(onLoadOlder).toHaveBeenCalledTimes(1);
    expect(onFound).not.toHaveBeenCalled();

    // A página chega (lista nova com o alvo): acha no próximo tick…
    rerender({
      msgs: [{ id: 'm-antiga' }, { id: 'm-1' }],
      alvo: 'm-antiga',
    });
    avancarTentativas(1);
    expect(onFound).toHaveBeenCalledTimes(1);
    expect(onFound).toHaveBeenCalledWith('m-antiga');

    // …e nunca mais paga nem avisa, mesmo até o fim do teto.
    avancarTentativas(HIGHLIGHT_MAX_ATTEMPTS);
    expect(onLoadOlder).toHaveBeenCalledTimes(1);
    expect(onNotFound).not.toHaveBeenCalled();
  });

  it('não acha em 20 tentativas: avisa UMA vez e pagou UMA vez', () => {
    const { onLoadOlder, onFound, onNotFound } = montar(
      [{ id: 'm-1' }],
      'm-inexistente',
    );

    avancarTentativas(HIGHLIGHT_MAX_ATTEMPTS - 1);
    expect(onFound).not.toHaveBeenCalled();
    expect(onNotFound).not.toHaveBeenCalled();

    avancarTentativas(1);
    expect(onNotFound).toHaveBeenCalledTimes(1);
    expect(onNotFound).toHaveBeenCalledWith('m-inexistente');
    expect(onLoadOlder).toHaveBeenCalledTimes(1);

    // Assentou: o relógio pode correr que nada mais dispara.
    avancarTentativas(HIGHLIGHT_MAX_ATTEMPTS);
    expect(onNotFound).toHaveBeenCalledTimes(1);
    expect(onLoadOlder).toHaveBeenCalledTimes(1);
  });

  it('com contrato desconhecido o teto resolve: avisa em vez de prender', () => {
    // Ponto 2 da recusa: sem o teto, `hasOlderMessages === undefined` deixava
    // o alvo pendente para sempre. No modelo por tempo não há espera infinita.
    const { onNotFound, onLoadOlder } = montar([{ id: 'm-1' }], 'm-solta');

    avancarTentativas(HIGHLIGHT_MAX_ATTEMPTS);
    expect(onNotFound).toHaveBeenCalledTimes(1);
    expect(onLoadOlder).toHaveBeenCalledTimes(1);
  });

  it('desmontar no meio: nenhum callback dispara depois', () => {
    const { unmount, onLoadOlder, onFound, onNotFound } = montar(
      [{ id: 'm-1' }],
      'm-alvo',
    );

    // Paga a página (6 ticks > 5ª tentativa) mas não acha ainda.
    avancarTentativas(HIGHLIGHT_LOAD_OLDER_AT_ATTEMPT + 1);
    expect(onLoadOlder).toHaveBeenCalledTimes(1);
    expect(onFound).not.toHaveBeenCalled();

    unmount();

    // O alvo chega tarde demais: o timer morreu na desmontagem.
    avancarTentativas(HIGHLIGHT_MAX_ATTEMPTS * 2);
    expect(onFound).not.toHaveBeenCalled();
    expect(onNotFound).not.toHaveBeenCalled();
    expect(onLoadOlder).toHaveBeenCalledTimes(1);
  });

  it('trocar de alvo limpa o timer do alvo antigo', () => {
    const alvoAntigo = 'm-antiga';
    const alvoNovo = 'm-nova';
    const montado = montar([{ id: 'm-nova' }], alvoAntigo);
    const { rerender, onFound, onNotFound, onLoadOlder } = montado;

    avancarTentativas(2);

    rerender({ msgs: [{ id: 'm-nova' }], alvo: alvoNovo });
    avancarTentativas(1);

    // Só o alvo novo resolveu; o antigo nunca dispara (nem achado, nem aviso).
    expect(onFound).toHaveBeenCalledTimes(1);
    expect(onFound).toHaveBeenCalledWith('m-nova');
    expect(onNotFound).not.toHaveBeenCalled();

    avancarTentativas(HIGHLIGHT_MAX_ATTEMPTS);
    expect(onFound).toHaveBeenCalledTimes(1);
    expect(onNotFound).not.toHaveBeenCalled();
    expect(onLoadOlder).not.toHaveBeenCalled();
  });

  it('sem alvo não arma timer nenhum', () => {
    const { onLoadOlder, onFound, onNotFound } = montar([{ id: 'm-1' }], null);

    avancarTentativas(HIGHLIGHT_MAX_ATTEMPTS);
    expect(onLoadOlder).not.toHaveBeenCalled();
    expect(onFound).not.toHaveBeenCalled();
    expect(onNotFound).not.toHaveBeenCalled();
  });
});

describe('findHighlightTarget', () => {
  it('retorna null sem alvo e ignora external_id nulo', () => {
    expect(findHighlightTarget([{ id: 'm-1' }], null)).toBeNull();
    expect(findHighlightTarget([{ id: 'm-1', external_id: null }], 'x')).toBeNull();
    expect(findHighlightTarget([], 'm-1')).toBeNull();
  });
});
