/**
 * Testes do `useForwardMessage` (etapas 36-39: encaminhar do chat e da aba Arquivos).
 *
 * O alvo é o HOOK REAL; a fronteira dublada é só a rede (o cliente Supabase) e o
 * toast/logger. Nada de `readFileSync` — cada caso chama o hook por `renderHook` e
 * olha o estado/efeito observável (estado devolvido, chamadas ao transporte, toast).
 *
 * Casos cobertos: carga ao abrir (open/allowGroups), erro de rede e de RLS (data
 * nulo), busca (`name`/`phone`, grupos), seleção, guarda de reentrância, limites
 * (arquivos x destinos), resultado parcial (falha e não-encaminhável), progresso,
 * `failedTargets` e `retryFailed` (só o que falhou), fechamento/reset.
 *
 * Fuso horário e paginação NÃO se aplicam a este hook (não há data nem leitura
 * paginada). O bug encontrado vive documentado em `it.fails` (ver relato).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  tables: [] as string[],
  contactsResult: { data: null as unknown, error: null as unknown },
  groupsResult: { data: null as unknown, error: null as unknown },
  toast: vi.fn(),
  logError: vi.fn(),
  onForward: vi.fn(),
  onOpenChange: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => {
  const makeChain = (result: { data: unknown; error: unknown }) => {
    const chain = {
      select: () => chain,
      order: () => Promise.resolve(result),
    };
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => {
        mocks.tables.push(table);
        return makeChain(table === 'contacts' ? mocks.contactsResult : mocks.groupsResult);
      },
    },
  };
});

vi.mock('@/hooks/ui/use-toast', () => ({ toast: mocks.toast }));

vi.mock('@/lib/logger', () => ({
  log: { error: mocks.logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { useForwardMessage, type UseForwardMessageOptions } from '@/hooks/chat/useForwardMessage';
import type {
  ForwardResult,
  ForwardPairOutcome,
  ForwardNonForwardable,
} from '@/hooks/chat/useForwardMedia';

interface ContactFixture {
  id: string;
  name: string;
  phone: string;
  avatar_url?: string | null;
}
interface GroupFixture {
  id: string;
  name: string;
  participant_count: number;
  avatar_url?: string | null;
}

function contact(id: string, name: string, phone = '+5511990000000'): ContactFixture {
  return { id, name, phone, avatar_url: null };
}
function group(id: string, name: string): GroupFixture {
  return { id, name, participant_count: 3, avatar_url: null };
}

function pair(targetId: string, ok: boolean, over: Partial<ForwardPairOutcome> = {}): ForwardPairOutcome {
  return { itemId: 'i1', targetId, targetType: 'contact', ok, ...over };
}

/** Monta um `ForwardResult` coerente (o hook recomputa a soma, mas o tipo exige os campos). */
function fwdResult(
  pairs: ForwardPairOutcome[],
  nonForwardable: ForwardNonForwardable[] = [],
): ForwardResult {
  const sent = pairs.filter((p) => p.ok).length;
  return {
    pairOutcomes: pairs,
    nonForwardable,
    attempted: pairs.length,
    sent,
    failed: pairs.length - sent,
  };
}

type HookResult = { current: ReturnType<typeof useForwardMessage> };

function renderFwd(initialProps: Partial<UseForwardMessageOptions> = {}) {
  return renderHook(
    (props: Partial<UseForwardMessageOptions>) =>
      useForwardMessage({
        open: true,
        onForward: mocks.onForward,
        onOpenChange: mocks.onOpenChange,
        ...props,
      }),
    { initialProps },
  );
}

function selectTargets(result: HookResult, ids: string[], type: 'contact' | 'group' = 'contact') {
  for (const id of ids) {
    act(() => {
      if (type === 'contact') result.current.toggleContact(id);
      else result.current.toggleGroup(id);
    });
  }
}

function lastToast(): { title?: string; description?: string; variant?: string } | undefined {
  const calls = mocks.toast.mock.calls;
  return calls.length > 0 ? (calls[calls.length - 1][0] as { title?: string }) : undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tables = [];
  mocks.contactsResult = { data: null, error: null };
  mocks.groupsResult = { data: null, error: null };
});

describe('useForwardMessage — carga dos destinos ao abrir', () => {
  it('só consulta o banco quando `open` é true; ao abrir busca contatos e grupos', async () => {
    const { rerender, result } = renderFwd({ open: false });
    // Fechado não há consulta nenhuma (nem contatos, nem grupos).
    expect(mocks.tables).toEqual([]);

    rerender({ open: true });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.tables).toContain('contacts');
    expect(mocks.tables).toContain('whatsapp_groups');
  });

  it('com allowGroups=false não busca a tabela de grupos', async () => {
    const { result } = renderFwd({ allowGroups: false });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mocks.tables).toContain('contacts');
    expect(mocks.tables).not.toContain('whatsapp_groups');
  });

  it('erro de rede/RLS ao buscar contatos: lista vazia, erro registrado e isLoading de volta a false', async () => {
    mocks.contactsResult = { data: null, error: { message: 'permission denied for table contacts' } };

    const { result } = renderFwd();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.filteredContacts).toEqual([]);
    expect(mocks.logError).toHaveBeenCalledWith(
      'Error fetching contacts:',
      expect.objectContaining({ message: 'permission denied for table contacts' }),
    );
  });

  it('data nulo sem erro (RLS devolve null) deixa a lista vazia, sem quebrar', async () => {
    mocks.contactsResult = { data: null, error: null };
    mocks.groupsResult = { data: null, error: null };

    const { result } = renderFwd();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.filteredContacts).toEqual([]);
    expect(result.current.filteredGroups).toEqual([]);
  });

  it('erro ao buscar grupos não zera os contatos já carregados', async () => {
    mocks.contactsResult = { data: [contact('c1', 'Ana')], error: null };
    mocks.groupsResult = { data: null, error: { message: 'rls groups' } };

    const { result } = renderFwd();
    await waitFor(() => expect(result.current.filteredContacts).toHaveLength(1));
    expect(result.current.filteredGroups).toEqual([]);
    expect(mocks.logError).toHaveBeenCalledWith('Error fetching groups:', expect.anything());

    // BUG (documentado): a lista do diálogo não pode cair quando um contato vem com
    // `name`/`phone` nulos. Hoje `c.name.toLowerCase()` estoura no render.
    // Ver relato: useForwardMessage.ts:137-143.
  });

  it.fails('contato com `name` nulo (dado malformado) não pode derrubar a listagem', async () => {
    mocks.contactsResult = {
      data: [{ id: 'c-nulo', name: null, phone: '+5511900000000', avatar_url: null }],
      error: null,
    };

    const { result } = renderFwd();
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.filteredContacts).toHaveLength(1);
  });
});

describe('useForwardMessage — filtro de busca', () => {
  it('filtra contatos por nome sem diferenciar maiúsculas e por telefone', async () => {
    mocks.contactsResult = {
      data: [contact('c1', 'Ana Silva', '+5511911112222'), contact('c2', 'Bruno Souza', '+5532988887777')],
      error: null,
    };
    const { result } = renderFwd();
    await waitFor(() => expect(result.current.filteredContacts).toHaveLength(2));

    act(() => result.current.setSearchQuery('ANA'));
    expect(result.current.filteredContacts.map((c) => c.id)).toEqual(['c1']);

    // busca por telefone (o nome não contém o trecho).
    act(() => result.current.setSearchQuery('98888'));
    expect(result.current.filteredContacts.map((c) => c.id)).toEqual(['c2']);

    act(() => result.current.setSearchQuery('nao-existe'));
    expect(result.current.filteredContacts).toEqual([]);
  });

  it('filtra grupos por nome', async () => {
    mocks.groupsResult = { data: [group('g1', 'Suporte'), group('g2', 'Vendas')], error: null };
    const { result } = renderFwd();
    await waitFor(() => expect(result.current.filteredGroups).toHaveLength(2));

    act(() => result.current.setSearchQuery('vend'));
    expect(result.current.filteredGroups.map((g) => g.id)).toEqual(['g2']);
  });
});

describe('useForwardMessage — seleção', () => {
  it('toggleContact adiciona e remove o mesmo id sem duplicar', () => {
    const { result } = renderFwd({ open: false });

    act(() => result.current.toggleContact('c1'));
    act(() => result.current.toggleContact('c2'));
    expect(result.current.selectedContacts).toEqual(['c1', 'c2']);

    act(() => result.current.toggleContact('c1'));
    expect(result.current.selectedContacts).toEqual(['c2']);
  });

  it('totalSelected soma contatos e grupos quando allowGroups é true', () => {
    const { result } = renderFwd({ open: false });

    selectTargets(result, ['c1', 'c2']);
    selectTargets(result, ['g1'], 'group');
    expect(result.current.totalSelected).toBe(3);
  });

  it('allowGroups=false mantém o grupo selecionável no estado mas FORA da conta de destinos', () => {
    const { result } = renderFwd({ open: false, allowGroups: false });

    selectTargets(result, ['g1'], 'group');
    expect(result.current.selectedGroups).toEqual(['g1']);
    expect(result.current.totalSelected).toBe(0);
  });
});

describe('useForwardMessage — handleForward: guardas', () => {
  it('sem destinatário: toast destrutivo e nenhuma chamada ao transporte', async () => {
    const { result } = renderFwd({ open: false });

    await act(async () => {
      await result.current.handleForward();
    });

    expect(mocks.onForward).not.toHaveBeenCalled();
    expect(lastToast()).toMatchObject({ title: 'Selecione destinatários', variant: 'destructive' });
  });

  it('11 destinos (> 10) bloqueia antes de enviar, com o motivo na tela', async () => {
    mocks.contactsResult = { data: Array.from({ length: 11 }, (_, i) => contact(`c${i}`, `C${i}`)), error: null };
    const { result } = renderFwd();
    await waitFor(() => expect(result.current.filteredContacts).toHaveLength(11));

    selectTargets(result, Array.from({ length: 11 }, (_, i) => `c${i}`));
    await act(async () => {
      await result.current.handleForward();
    });

    expect(mocks.onForward).not.toHaveBeenCalled();
    expect(lastToast()?.title).toBe('Limite excedido');
    expect(lastToast()?.description).toContain('Máximo de 10 destinos');
    expect(lastToast()?.description).toContain('11');
  });

  it('11 arquivos (> 10) bloqueia mesmo com 1 destino', async () => {
    const { result } = renderFwd({ open: false, itemCount: 11 });

    selectTargets(result, ['c1']);
    await act(async () => {
      await result.current.handleForward();
    });

    expect(mocks.onForward).not.toHaveBeenCalled();
    expect(lastToast()?.description).toContain('Máximo de 10 arquivos');
  });

  // BUG (documentado): `enforceLimits` (default false = caminho legado do chat) é
  // recebido, mas o hook aplica o limite SEMPRE — a opção é morta e o caminho legado
  // passa a bloquear acima de 10 destinos, contra o contrato da etapa 39.
  // Ver relato: useForwardMessage.ts:49, :211.
  it.fails('caminho legado (enforceLimits=false) não pode bloquear acima de 10 destinos', async () => {
    mocks.contactsResult = { data: Array.from({ length: 11 }, (_, i) => contact(`c${i}`, `C${i}`)), error: null };
    const { result } = renderFwd({ enforceLimits: false });
    await waitFor(() => expect(result.current.filteredContacts).toHaveLength(11));

    selectTargets(result, Array.from({ length: 11 }, (_, i) => `c${i}`));
    await act(async () => {
      await result.current.handleForward();
    });

    expect(mocks.onForward).toHaveBeenCalledTimes(1);
  });
});

describe('useForwardMessage — handleForward: envio e resultado', () => {
  it('só contatos: um envio e o toast conta os DESTINOS, não os arquivos', async () => {
    mocks.contactsResult = { data: [contact('c1', 'Ana'), contact('c2', 'Bruno')], error: null };
    mocks.onForward.mockResolvedValue(
      fwdResult([pair('c1', true), pair('c2', true, { itemId: 'i2' })]),
    );

    const { result } = renderFwd();
    await waitFor(() => expect(result.current.filteredContacts).toHaveLength(2));

    selectTargets(result, ['c1', 'c2']);
    await act(async () => {
      await result.current.handleForward();
    });

    expect(mocks.onForward).toHaveBeenCalledTimes(1);
    expect(mocks.onForward.mock.calls[0][0]).toEqual(['c1', 'c2']);
    expect(mocks.onForward.mock.calls[0][1]).toBe('contact');
    expect(lastToast()).toMatchObject({
      title: 'Encaminhado!',
      description: 'Encaminhado para 2 destinos.',
    });
    // sucesso limpa a seleção e fecha o diálogo.
    expect(result.current.selectedContacts).toEqual([]);
    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('3 arquivos para 1 destino contam como 1 destino (singular)', async () => {
    mocks.onForward.mockResolvedValue(
      fwdResult([pair('c1', true), pair('c1', true, { itemId: 'i2' }), pair('c1', true, { itemId: 'i3' })]),
    );

    const { result } = renderFwd({ open: false });
    selectTargets(result, ['c1']);
    await act(async () => {
      await result.current.handleForward();
    });

    expect(lastToast()?.description).toBe('Encaminhado para 1 destino.');
  });

  it('contatos + grupos: um envio por tipo, com os ids certos', async () => {
    mocks.onForward.mockImplementation((ids: string[], type: 'contact' | 'group') =>
      Promise.resolve(
        fwdResult(ids.map((id, index) => pair(id, true, { itemId: `i${index}`, targetType: type }))),
      ),
    );

    const { result } = renderFwd({ open: false });
    selectTargets(result, ['c1']);
    selectTargets(result, ['g1'], 'group');
    await act(async () => {
      await result.current.handleForward();
    });

    expect(mocks.onForward).toHaveBeenCalledTimes(2);
    expect(mocks.onForward.mock.calls[0].slice(0, 2)).toEqual([['c1'], 'contact']);
    expect(mocks.onForward.mock.calls[1].slice(0, 2)).toEqual([['g1'], 'group']);
    expect(lastToast()?.description).toBe('Encaminhado para 2 destinos.');
  });

  it('allowGroups=false ignora os grupos selecionados (nada de enviar para grupo)', async () => {
    const { result } = renderFwd({ open: false, allowGroups: false });

    selectTargets(result, ['g1'], 'group');
    await act(async () => {
      await result.current.handleForward();
    });

    expect(mocks.onForward).not.toHaveBeenCalled();
    expect(lastToast()?.title).toBe('Selecione destinatários');
  });

  it('só grupo selecionado: um único envio, do tipo group', async () => {
    mocks.onForward.mockResolvedValue(fwdResult([pair('g1', true, { targetType: 'group' })]));

    const { result } = renderFwd({ open: false });
    selectTargets(result, ['g1'], 'group');
    await act(async () => {
      await result.current.handleForward();
    });

    expect(mocks.onForward).toHaveBeenCalledTimes(1);
    expect(mocks.onForward.mock.calls[0].slice(0, 2)).toEqual([['g1'], 'group']);
  });

  it('o onProgress do transporte alimenta `progress` (X/Y enviados)', async () => {
    mocks.onForward.mockImplementation(
      (ids: string[], _type: string, onProgress?: (done: number, total: number) => void) => {
        onProgress?.(1, 3);
        // Um par falha: o caminho parcial NÃO reseta o estado, então `progress` fica visível.
        return Promise.resolve(fwdResult([pair(ids[0], false), pair(ids[0], true)]));
      },
    );

    const { result } = renderFwd({ open: false });
    selectTargets(result, ['c1']);
    await act(async () => {
      await result.current.handleForward();
    });

    expect(typeof mocks.onForward.mock.calls[0][2]).toBe('function');
    expect(result.current.progress).toEqual({ done: 1, total: 3 });
  });

  it('falha parcial: toast com a contagem e o diálogo continua aberto com a seleção', async () => {
    mocks.onForward.mockResolvedValue(fwdResult([pair('c1', true), pair('c2', false), pair('c3', false)]));

    const { result } = renderFwd({ open: false });
    selectTargets(result, ['c1', 'c2', 'c3']);
    await act(async () => {
      await result.current.handleForward();
    });

    expect(lastToast()).toMatchObject({
      title: 'Encaminhamento parcial',
      description: '2 envios falharam',
      variant: 'destructive',
    });
    expect(result.current.selectedContacts).toEqual(['c1', 'c2', 'c3']);
    expect(mocks.onOpenChange).not.toHaveBeenCalled();
    expect(result.current.lastResult?.failed).toBe(2);
  });

  it('um único envio falho usa o singular "envio falhou"', async () => {
    mocks.onForward.mockResolvedValue(fwdResult([pair('c1', true), pair('c2', false)]));

    const { result } = renderFwd({ open: false });
    selectTargets(result, ['c1', 'c2']);
    await act(async () => {
      await result.current.handleForward();
    });

    expect(lastToast()?.description).toBe('1 envio falhou');
  });

  it('arquivo não encaminhável (sem falha de envio) também é parcial e não fecha o diálogo', async () => {
    mocks.onForward.mockResolvedValue(
      fwdResult([pair('c1', true)], [{ itemId: 'i2', reason: 'A origem não é bucket privado.' }]),
    );

    const { result } = renderFwd({ open: false });
    selectTargets(result, ['c1']);
    await act(async () => {
      await result.current.handleForward();
    });

    expect(lastToast()).toMatchObject({
      title: 'Encaminhamento parcial',
      description: '1 arquivo não pode ser encaminhado',
      variant: 'destructive',
    });
    expect(mocks.onOpenChange).not.toHaveBeenCalled();
  });

  it('falha de envio E arquivo não encaminhável juntam as duas contagens', async () => {
    mocks.onForward.mockResolvedValue(
      fwdResult(
        [pair('c1', false)],
        [
          { itemId: 'i2', reason: 'a' },
          { itemId: 'i3', reason: 'b' },
        ],
      ),
    );

    const { result } = renderFwd({ open: false });
    selectTargets(result, ['c1']);
    await act(async () => {
      await result.current.handleForward();
    });

    expect(lastToast()?.description).toBe('1 envio falhou · 2 arquivos não podem ser encaminhados');
  });

  it('rejeição do transporte: toast de erro e isSending volta a false', async () => {
    mocks.onForward.mockRejectedValue(new Error('send_messages_permission_required'));

    const { result } = renderFwd({ open: false });
    selectTargets(result, ['c1']);
    await act(async () => {
      await result.current.handleForward();
    });

    expect(lastToast()).toMatchObject({
      title: 'Erro ao encaminhar',
      description: 'Não foi possível encaminhar a mensagem.',
      variant: 'destructive',
    });
    expect(result.current.isSending).toBe(false);
    expect(mocks.logError).toHaveBeenCalledWith('Error forwarding:', expect.any(Error));
  });

  it('transporte sem resultado (undefined) é tratado como falha, nunca como sucesso', async () => {
    mocks.onForward.mockResolvedValue(undefined as unknown as ForwardResult);

    const { result } = renderFwd({ open: false });
    selectTargets(result, ['c1']);
    await act(async () => {
      await result.current.handleForward();
    });

    expect(lastToast()?.title).toBe('Erro ao encaminhar');
    expect(result.current.isSending).toBe(false);
    expect(result.current.lastResult).toBeNull();
    // A falha é a da GUARDA R2-INB-002 (resultado ausente), não um TypeError de
    // `undefined.pairOutcomes` — é isso que prova a guarda.
    expect(mocks.logError).toHaveBeenCalledWith(
      'Error forwarding:',
      expect.objectContaining({
        message: 'O encaminhamento não devolveu o resultado do transporte.',
      }),
    );
  });

  it('corrida: com um envio em voo, o segundo disparo não abre um segundo envio', async () => {
    let resolveSend: ((value: ForwardResult) => void) | undefined;
    mocks.onForward.mockImplementation(
      () =>
        new Promise<ForwardResult>((resolve) => {
          resolveSend = resolve;
        }),
    );

    const { result } = renderFwd({ open: false });
    selectTargets(result, ['c1']);

    let first: Promise<void> | undefined;
    await act(async () => {
      first = result.current.handleForward();
    });
    await waitFor(() => expect(result.current.isSending).toBe(true));

    await act(async () => {
      await result.current.handleForward();
    });
    expect(mocks.onForward).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSend?.(fwdResult([pair('c1', true)]));
      await first;
    });
    await waitFor(() => expect(result.current.isSending).toBe(false));
  });
});

describe('useForwardMessage — failedTargets e retryFailed', () => {
  it('lista cada destino falho UMA vez, com o nome conhecido e o rótulo genérico para id desconhecido', async () => {
    mocks.contactsResult = { data: [contact('c1', 'Ana Silva')], error: null };
    mocks.groupsResult = { data: [group('g1', 'Equipe')], error: null };
    // c1 falha em dois pares (dois arquivos) → uma entrada só; `c-ausente` e `g-ausente`
    // não estão nas listas carregadas → rótulo genérico.
    mocks.onForward.mockImplementation((ids: string[], type: 'contact' | 'group') =>
      Promise.resolve(
        fwdResult([
          pair(ids[0], false, { itemId: 'i1', targetType: type }),
          pair(ids[0], false, { itemId: 'i2', targetType: type }),
          pair(ids[1], false, { itemId: 'i1', targetType: type }),
        ]),
      ),
    );

    const { result } = renderFwd();
    await waitFor(() => expect(result.current.filteredGroups).toHaveLength(1));

    selectTargets(result, ['c1', 'c-ausente']);
    selectTargets(result, ['g1', 'g-ausente'], 'group');
    await act(async () => {
      await result.current.handleForward();
    });

    expect(result.current.failedTargets).toEqual([
      { id: 'c1', name: 'Ana Silva', type: 'contact' },
      { id: 'c-ausente', name: 'Contato', type: 'contact' },
      { id: 'g1', name: 'Equipe', type: 'group' },
      { id: 'g-ausente', name: 'Grupo', type: 'group' },
    ]);
  });

  it('retryFailed reenvia SÓ os ids que falharam, separados por tipo', async () => {
    mocks.onForward
      // 3 destinos selecionados: só c1 e g1 falham.
      .mockResolvedValueOnce(
        fwdResult([
          pair('c1', false),
          pair('c2', true),
        ]),
      )
      .mockResolvedValueOnce(
        fwdResult([pair('g1', false, { targetType: 'group' })]),
      )
      .mockResolvedValueOnce(fwdResult([pair('c1', true)]))
      .mockResolvedValueOnce(fwdResult([pair('g1', true, { targetType: 'group' })]));

    const { result } = renderFwd({ open: false });
    selectTargets(result, ['c1', 'c2']);
    selectTargets(result, ['g1'], 'group');
    await act(async () => {
      await result.current.handleForward();
    });
    expect(result.current.failedTargets.map((t) => t.id)).toEqual(['c1', 'g1']);

    await act(async () => {
      await result.current.retryFailed();
    });

    // Só os 2 que falharam voltam (c2 fica de fora).
    expect(mocks.onForward.mock.calls[2].slice(0, 2)).toEqual([['c1'], 'contact']);
    expect(mocks.onForward.mock.calls[3].slice(0, 2)).toEqual([['g1'], 'group']);
    expect(mocks.onForward).toHaveBeenCalledTimes(4);
  });

  it('retryFailed sem falhas não chama o transporte', async () => {
    const { result } = renderFwd({ open: false });

    await act(async () => {
      await result.current.retryFailed();
    });

    expect(mocks.onForward).not.toHaveBeenCalled();
  });

  it('retryFailed só com grupo falho dispara um único envio de grupo', async () => {
    mocks.onForward
      .mockResolvedValueOnce(fwdResult([pair('g1', false, { itemId: 'i1', targetType: 'group' })]))
      .mockResolvedValueOnce(fwdResult([pair('g1', true, { itemId: 'i1', targetType: 'group' })]));

    const { result } = renderFwd({ open: false });
    selectTargets(result, ['g1'], 'group');
    await act(async () => {
      await result.current.handleForward();
    });
    await act(async () => {
      await result.current.retryFailed();
    });

    expect(mocks.onForward).toHaveBeenCalledTimes(2);
    expect(mocks.onForward.mock.calls[1].slice(0, 2)).toEqual([['g1'], 'group']);
  });

  it('retryFailed com erro do transporte avisa com a mensagem própria do reenvio', async () => {
    mocks.onForward
      .mockResolvedValueOnce(fwdResult([pair('c1', false)]))
      .mockRejectedValueOnce(new Error('boom'));

    const { result } = renderFwd({ open: false });
    selectTargets(result, ['c1']);
    await act(async () => {
      await result.current.handleForward();
    });

    await act(async () => {
      await result.current.retryFailed();
    });

    expect(lastToast()).toMatchObject({
      title: 'Erro ao encaminhar',
      description: 'Não foi possível reenviar aos destinos que falharam.',
    });
    expect(result.current.isSending).toBe(false);
  });
});

describe('useForwardMessage — fechamento', () => {
  it('handleClose limpa busca, seleção e resultado e avisa o fechamento', async () => {
    mocks.contactsResult = { data: [contact('c1', 'Ana')], error: null };
    mocks.onForward.mockResolvedValue(fwdResult([pair('c1', false)]));

    const { result } = renderFwd();
    await waitFor(() => expect(result.current.filteredContacts).toHaveLength(1));

    act(() => result.current.setSearchQuery('ana'));
    selectTargets(result, ['c1']);
    await act(async () => {
      await result.current.handleForward();
    });
    expect(result.current.lastResult).not.toBeNull();

    act(() => result.current.handleClose());

    expect(result.current.searchQuery).toBe('');
    expect(result.current.selectedContacts).toEqual([]);
    expect(result.current.selectedGroups).toEqual([]);
    expect(result.current.progress).toBeNull();
    expect(result.current.lastResult).toBeNull();
    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('setActiveTab troca a aba ativa', () => {
    const { result } = renderFwd({ open: false });

    expect(result.current.activeTab).toBe('contacts');
    act(() => result.current.setActiveTab('groups'));
    expect(result.current.activeTab).toBe('groups');
  });
});
