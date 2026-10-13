/**
 * DL1 — realce da mensagem alvo de um link direto (`?message=` / busca global).
 *
 * O hook recebe a lista já carregada e o `loadOlderMessages` do painel; aqui os
 * testes cobrem os canais onde ele costuma falhar: mensagem na primeira página,
 * mensagem em página antiga (paginação paga uma vez por rodada), alvo por
 * `external_id`, histórico esgotado (desiste com aviso, sem repetir) e a corrida
 * de trocar de alvo/conversa no meio (o atraso da conversa A não contamina a B).
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useInitialHighlight, type HighlightableMessage } from '@/hooks/chat/useInitialHighlight';

function msg(id: string, external_id?: string): HighlightableMessage {
  return { id, external_id: external_id ?? null };
}

describe('useInitialHighlight — realce do alvo do deep link (DL1)', () => {
  it('encontra a mensagem na primeira página e dispara o realce uma única vez', () => {
    const onFound = vi.fn();
    const loadOlderMessages = vi.fn();
    const props = {
      messageId: 'm2',
      messages: [msg('m1'), msg('m2'), msg('m3')],
      hasOlderMessages: false,
      loadingOlderMessages: false,
      loadOlderMessages,
      onFound,
    };

    const { rerender } = renderHook((p: typeof props) => useInitialHighlight(p), { initialProps: props });

    expect(onFound).toHaveBeenCalledTimes(1);
    expect(onFound).toHaveBeenCalledWith('m2');
    expect(loadOlderMessages).not.toHaveBeenCalled();

    // Uma nova lista chegando (realtime) não repete o realce.
    rerender({ ...props, messages: [msg('m1'), msg('m2'), msg('m3'), msg('m4')] });
    expect(onFound).toHaveBeenCalledTimes(1);
  });

  it('pagina o histórico uma vez por rodada até achar a mensagem na página antiga', () => {
    const onFound = vi.fn();
    const loadOlderMessages = vi.fn();
    const props = {
      messageId: 'antiga',
      messages: [msg('m9')],
      hasOlderMessages: true,
      loadingOlderMessages: false,
      loadOlderMessages,
      onFound,
    };

    const { rerender } = renderHook((p: typeof props) => useInitialHighlight(p), { initialProps: props });

    expect(loadOlderMessages).toHaveBeenCalledTimes(1);
    expect(onFound).not.toHaveBeenCalled();

    // A página anterior chegou com a mensagem: realce com o id interno.
    rerender({ ...props, messages: [msg('antiga'), msg('m9')], hasOlderMessages: false });
    expect(onFound).toHaveBeenCalledTimes(1);
    expect(onFound).toHaveBeenCalledWith('antiga');
    expect(loadOlderMessages).toHaveBeenCalledTimes(1);
  });

  it('aceita o alvo pelo external_id (id do WhatsApp) e devolve o id interno', () => {
    const onFound = vi.fn();
    renderHook(() => useInitialHighlight({
      messageId: 'WA-ABC-123',
      messages: [msg('uuid-1', 'WA-ABC-123')],
      hasOlderMessages: false,
      loadingOlderMessages: false,
      onFound,
    }));

    expect(onFound).toHaveBeenCalledTimes(1);
    expect(onFound).toHaveBeenCalledWith('uuid-1');
  });

  it('não paga paginação enquanto ela está em voo (uma rodada por lista nova)', () => {
    const onFound = vi.fn();
    const loadOlderMessages = vi.fn();
    const { rerender } = renderHook((p: Parameters<typeof useInitialHighlight>[0]) => useInitialHighlight(p), {
      initialProps: {
        messageId: 'x',
        messages: [msg('m1')],
        hasOlderMessages: true,
        loadingOlderMessages: false,
        loadOlderMessages,
        onFound,
      },
    });
    expect(loadOlderMessages).toHaveBeenCalledTimes(1);

    rerender({
      messageId: 'x',
      messages: [msg('m1')],
      hasOlderMessages: true,
      loadingOlderMessages: true,
      loadOlderMessages,
      onFound,
    });
    expect(loadOlderMessages).toHaveBeenCalledTimes(1);
  });

  it('desiste com aviso depois do teto de rodadas, sem repetir o aviso', () => {
    const onFound = vi.fn();
    const onNotFound = vi.fn();
    const loadOlderMessages = vi.fn();
    const props = {
      messageId: 'fantasma',
      messages: [msg('m1')],
      hasOlderMessages: true,
      loadingOlderMessages: false,
      loadOlderMessages,
      onFound,
      onNotFound,
      maxRounds: 2,
    };

    const { rerender } = renderHook((p: typeof props) => useInitialHighlight(p), { initialProps: props });
    expect(loadOlderMessages).toHaveBeenCalledTimes(1);

    rerender({ ...props, messages: [msg('m1'), msg('m2')] });
    expect(loadOlderMessages).toHaveBeenCalledTimes(2);
    expect(onNotFound).not.toHaveBeenCalled();

    rerender({ ...props, messages: [msg('m1'), msg('m2'), msg('m3')] });
    expect(onNotFound).toHaveBeenCalledTimes(1);
    expect(onNotFound).toHaveBeenCalledWith('fantasma');

    rerender({ ...props, messages: [msg('m1'), msg('m2'), msg('m3'), msg('m4')] });
    expect(onNotFound).toHaveBeenCalledTimes(1);
  });

  it('avisa "não encontrada" quando o histórico acabou (hasOlderMessages === false)', () => {
    const onFound = vi.fn();
    const onNotFound = vi.fn();
    renderHook(() => useInitialHighlight({
      messageId: 'apagada',
      messages: [msg('m1')],
      hasOlderMessages: false,
      loadingOlderMessages: false,
      onFound,
      onNotFound,
    }));

    expect(onNotFound).toHaveBeenCalledTimes(1);
    expect(onNotFound).toHaveBeenCalledWith('apagada');
  });

  it('NÃO acusa falso "não encontrada" quando o contrato de paginação é desconhecido', () => {
    const onFound = vi.fn();
    const onNotFound = vi.fn();
    renderHook(() => useInitialHighlight({
      messageId: 'x',
      messages: [],
      hasOlderMessages: undefined,
      loadingOlderMessages: false,
      onFound,
      onNotFound,
    }));

    expect(onFound).not.toHaveBeenCalled();
    expect(onNotFound).not.toHaveBeenCalled();
  });

  it('troca de alvo no meio (conversa A → B): atraso de A não contamina o realce de B', () => {
    const onFound = vi.fn();
    const loadOlderMessages = vi.fn();
    const props = {
      messageId: 'A',
      messages: [msg('m1')],
      hasOlderMessages: true,
      loadingOlderMessages: false,
      loadOlderMessages,
      onFound,
    };

    const { rerender } = renderHook((p: typeof props) => useInitialHighlight(p), { initialProps: props });
    expect(loadOlderMessages).toHaveBeenCalledTimes(1);

    // A conversa B abriu com o alvo dela já na primeira página.
    rerender({ ...props, messageId: 'B', messages: [msg('B'), msg('m1')], hasOlderMessages: false });

    expect(onFound).toHaveBeenCalledTimes(1);
    expect(onFound).toHaveBeenCalledWith('B');
    expect(onFound).not.toHaveBeenCalledWith('A');
  });
});
