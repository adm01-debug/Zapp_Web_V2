import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

type InvokeResult = { data: unknown; error: unknown };
type Deferred = { resolve: (value: InvokeResult) => void };

const h = vi.hoisted(() => ({
  invoke: vi.fn<(fn: string, opts?: unknown) => Promise<{ data: unknown; error: unknown }>>(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: h.invoke } },
}));

import {
  useAutomationSuggestions,
  resetAutomationSuggestionsMemory,
  AUTOMATION_SUGGESTIONS_DEBOUNCE_MS,
} from '@/hooks/chat/useAutomationSuggestions';

const CONTACT = 'c1';

function ok(suggestions: Array<{ text: string; source?: unknown }>): InvokeResult {
  return { data: { suggestions: suggestions.map((s) => ({ source: null, ...s })) }, error: null };
}

function httpError(status: number, message = 'Edge Function returned a non-2xx status code'): InvokeResult {
  return { data: null, error: { name: 'FunctionsHttpError', message, context: { status } } };
}

/** Espera o debounce + microtarefas, sem fake timers. */
async function afterDebounce() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, AUTOMATION_SUGGESTIONS_DEBOUNCE_MS + 30));
  });
}

function render(contactId: string | null, messageId: string | null) {
  return renderHook(
    ({ c, m }: { c: string | null; m: string | null }) => useAutomationSuggestions(c, m),
    { initialProps: { c: contactId, m: messageId } },
  );
}

describe('useAutomationSuggestions', () => {
  beforeEach(() => {
    h.invoke.mockReset();
    // Base: nenhum teste cai em `undefined` por falta de resposta programada.
    h.invoke.mockResolvedValue(ok([{ text: 'De novo' }]));
    resetAutomationSuggestionsMemory();
  });

  it('não vai à Edge quando a última mensagem é do agente (lastInboundMessageId nulo)', async () => {
    const hook = render(CONTACT, null);
    await afterDebounce();

    expect(h.invoke).not.toHaveBeenCalled();
    expect(hook.result.current).toMatchObject({ suggestions: [], loading: false, error: null });
  });

  it('chama a Edge com o contact_id e expõe as sugestões do contrato, com a fonte carimbada', async () => {
    h.invoke.mockResolvedValueOnce(
      ok([
        { text: 'Oi! Já te mando a tabela.', source: { article_id: 'a1', title: 'Tabela de preços' } },
        { text: 'O prazo de produção é de 10 dias úteis.' },
      ]),
    );

    const hook = render(CONTACT, 'm1');
    await afterDebounce();

    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(h.invoke).toHaveBeenCalledWith('automation-suggest-reply', {
      body: { contact_id: CONTACT, message_id: 'm1' },
    });
    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.suggestions).toEqual([
      { text: 'Oi! Já te mando a tabela.', source: { article_id: 'a1', title: 'Tabela de preços' } },
      { text: 'O prazo de produção é de 10 dias úteis.', source: null },
    ]);
  });

  it('espera o debounce antes de chamar (mensagem que ainda está chegando não gasta IA)', async () => {
    h.invoke.mockResolvedValueOnce(ok([{ text: 'Oi' }]));

    const hook = render(CONTACT, 'm1');
    expect(h.invoke).not.toHaveBeenCalled();
    expect(hook.result.current.loading).toBe(true);

    await afterDebounce();

    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(hook.result.current.loading).toBe(false);
  });

  it('não repete a chamada para a mesma mensagem (memória por id, mesmo remontando)', async () => {
    h.invoke.mockResolvedValueOnce(ok([{ text: 'Oi' }]));

    const first = render(CONTACT, 'm1');
    await afterDebounce();
    expect(h.invoke).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = render(CONTACT, 'm1');
    await afterDebounce();

    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(second.result.current.suggestions).toEqual([{ text: 'Oi', source: null }]);
    expect(second.result.current.loading).toBe(false);
  });

  it('reusa o cache ao voltar por rerender para uma mensagem já carregada em outra montagem', async () => {
    h.invoke.mockResolvedValueOnce(ok([{ text: 'Sugestão de m1' }]));
    h.invoke.mockResolvedValueOnce(ok([{ text: 'Sugestão de m2' }]));

    const first = render(CONTACT, 'm1');
    await afterDebounce();
    expect(first.result.current.suggestions).toEqual([{ text: 'Sugestão de m1', source: null }]);
    first.unmount();

    const hook = render(CONTACT, 'm2');
    await afterDebounce();
    expect(hook.result.current.suggestions).toEqual([{ text: 'Sugestão de m2', source: null }]);

    await act(async () => {
      hook.rerender({ c: CONTACT, m: 'm1' });
    });
    await afterDebounce();

    expect(h.invoke).toHaveBeenCalledTimes(2);
    expect(h.invoke).toHaveBeenNthCalledWith(1, 'automation-suggest-reply', {
      body: { contact_id: CONTACT, message_id: 'm1' },
    });
    expect(h.invoke).toHaveBeenNthCalledWith(2, 'automation-suggest-reply', {
      body: { contact_id: CONTACT, message_id: 'm2' },
    });
    expect(hook.result.current.suggestions).toEqual([{ text: 'Sugestão de m1', source: null }]);
    expect(hook.result.current.loading).toBe(false);
  });

  it('mensagem nova refaz a chamada e troca as sugestões', async () => {
    h.invoke.mockResolvedValueOnce(ok([{ text: 'Antiga' }]));
    h.invoke.mockResolvedValueOnce(ok([{ text: 'Nova' }]));

    const hook = render(CONTACT, 'm1');
    await afterDebounce();
    expect(hook.result.current.suggestions).toEqual([{ text: 'Antiga', source: null }]);

    await act(async () => {
      hook.rerender({ c: CONTACT, m: 'm2' });
    });
    await afterDebounce();

    expect(h.invoke).toHaveBeenCalledTimes(2);
    expect(h.invoke).toHaveBeenLastCalledWith('automation-suggest-reply', {
      body: { contact_id: CONTACT, message_id: 'm2' },
    });
    expect(hook.result.current.suggestions).toEqual([{ text: 'Nova', source: null }]);
  });

  it('descarta a resposta atrasada da mensagem anterior (corrida)', async () => {
    let resolveFirst: Deferred['resolve'] = () => {};
    h.invoke.mockImplementationOnce(() => new Promise<InvokeResult>((resolve) => { resolveFirst = resolve; }));
    h.invoke.mockResolvedValueOnce(ok([{ text: 'Nova' }]));

    const hook = render(CONTACT, 'm1');
    await afterDebounce();
    expect(h.invoke).toHaveBeenCalledTimes(1);

    await act(async () => {
      hook.rerender({ c: CONTACT, m: 'm2' });
    });
    await afterDebounce();
    expect(hook.result.current.suggestions).toEqual([{ text: 'Nova', source: null }]);

    // A resposta antiga chega DEPOIS: tem de ser descartada.
    await act(async () => {
      resolveFirst(ok([{ text: 'Antiga e obsoleta' }]));
      await Promise.resolve();
    });

    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.suggestions).toEqual([{ text: 'Nova', source: null }]);

    // Voltar à mensagem da resposta descartada NÃO reaproveita o que foi jogado
    // fora: busca de novo.
    await act(async () => {
      hook.rerender({ c: CONTACT, m: 'm1' });
    });
    expect(hook.result.current.suggestions).toEqual([]);
    expect(hook.result.current.loading).toBe(true);
    await afterDebounce();
    expect(h.invoke).toHaveBeenCalledTimes(3);
    expect(hook.result.current.suggestions).toEqual([{ text: 'De novo', source: null }]);
  });

  it('dismiss esconde a barra sem nova chamada e continua escondida ao remontar a mesma mensagem', async () => {
    h.invoke.mockResolvedValueOnce(ok([{ text: 'Oi' }]));

    const hook = render(CONTACT, 'm1');
    await afterDebounce();
    expect(hook.result.current.suggestions).toHaveLength(1);

    await act(async () => {
      hook.result.current.dismiss();
    });

    expect(hook.result.current.isDismissed).toBe(true);
    expect(hook.result.current.suggestions).toEqual([]);
    expect(hook.result.current.loading).toBe(false);
    await afterDebounce();
    expect(h.invoke).toHaveBeenCalledTimes(1);

    hook.unmount();
    const again = render(CONTACT, 'm1');
    await afterDebounce();
    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(again.result.current.isDismissed).toBe(true);
    expect(again.result.current.suggestions).toEqual([]);
    expect(again.result.current.loading).toBe(false);
  });

  it('429 (orçamento de IA/limite de ritmo) é silencioso: nada na tela e nenhum erro exposto', async () => {
    h.invoke.mockResolvedValueOnce(httpError(429));

    const hook = render(CONTACT, 'm1');
    await afterDebounce();

    expect(hook.result.current.suggestions).toEqual([]);
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.loading).toBe(false);
  });

  it('falha de rede é silenciosa: lista vazia, sem erro exposto', async () => {
    h.invoke.mockResolvedValueOnce({
      data: null,
      error: { name: 'FunctionsFetchError', message: 'Failed to fetch' },
    });

    const hook = render(CONTACT, 'm1');
    await afterDebounce();

    expect(hook.result.current.suggestions).toEqual([]);
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.loading).toBe(false);
  });

  it('falha inesperada não é engolida: a barra fica vazia mas o motivo sobrevive em error', async () => {
    h.invoke.mockResolvedValueOnce(httpError(500, 'automation provider exploded'));

    const hook = render(CONTACT, 'm1');
    await afterDebounce();

    expect(hook.result.current.suggestions).toEqual([]);
    expect(hook.result.current.error).toBe('automation provider exploded');
    expect(hook.result.current.loading).toBe(false);
  });

  it('resposta fora do contrato vira lista vazia sinalizada, nunca sugestão inventada', async () => {
    h.invoke.mockResolvedValueOnce({ data: { suggestions: 'nada aqui' }, error: null });

    const hook = render(CONTACT, 'm1');
    await afterDebounce();

    expect(hook.result.current.suggestions).toEqual([]);
    expect(hook.result.current.error).toBeTruthy();
    expect(hook.result.current.loading).toBe(false);
  });

  it('resposta vazia do servidor é ausência sinalizada (fallback silencioso da Edge não vira "ok")', async () => {
    h.invoke.mockResolvedValueOnce(ok([]));

    const hook = render(CONTACT, 'm1');
    await afterDebounce();

    expect(hook.result.current.suggestions).toEqual([]);
    expect(hook.result.current.error).toBe('A automação não encontrou uma sugestão para esta mensagem.');
    expect(hook.result.current.loading).toBe(false);
  });

  it('dispensa de outra montagem alcançada por rerender continua escondida (sem loading preso)', async () => {
    h.invoke.mockResolvedValue(ok([{ text: 'Oi' }]));

    const other = render(CONTACT, 'm2');
    await act(async () => {
      other.result.current.dismiss();
    });
    other.unmount();

    const hook = render(CONTACT, 'm1');
    await afterDebounce();
    const callsAfterM1 = h.invoke.mock.calls.length;

    await act(async () => {
      hook.rerender({ c: CONTACT, m: 'm2' });
    });
    await afterDebounce();

    expect(hook.result.current.isDismissed).toBe(true);
    expect(hook.result.current.suggestions).toEqual([]);
    expect(hook.result.current.loading).toBe(false);
    expect(h.invoke.mock.calls.length).toBe(callsAfterM1);
  });

  it('mutação do array devolvido não contamina o cache entre montagens', async () => {
    h.invoke.mockResolvedValueOnce(ok([{ text: 'Oi' }]));

    const first = render(CONTACT, 'm1');
    await afterDebounce();
    expect(first.result.current.suggestions).toEqual([{ text: 'Oi', source: null }]);

    await act(async () => {
      first.result.current.suggestions.push({ text: 'INVENTADA', source: null });
      first.result.current.suggestions[0].text = 'ADULTERADA';
    });
    first.unmount();

    const second = render(CONTACT, 'm1');
    await afterDebounce();

    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(second.result.current.suggestions).toEqual([{ text: 'Oi', source: null }]);
  });

  it('reconhece o 429 pelo status no topo do erro (não só em context.status)', async () => {
    h.invoke.mockResolvedValueOnce({
      data: null,
      error: { name: 'FunctionsHttpError', status: 429, message: 'Too many requests' },
    });

    const hook = render(CONTACT, 'm1');
    await afterDebounce();

    expect(hook.result.current.suggestions).toEqual([]);
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.loading).toBe(false);
  });

  it('texto "Failed to fetch" sem status conhecido não vira silêncio de rede: o motivo sobrevive em error', async () => {
    h.invoke.mockResolvedValueOnce({
      data: null,
      error: { name: 'FunctionsRelayError', message: 'Failed to fetch' },
    });

    const hook = render(CONTACT, 'm1');
    await afterDebounce();

    expect(hook.result.current.suggestions).toEqual([]);
    expect(hook.result.current.error).toBe('Failed to fetch');
    expect(hook.result.current.loading).toBe(false);
  });
});
