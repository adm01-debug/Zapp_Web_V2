/**
 * Testes do `useMessageSignature` (hooks do Inbox, paridade V3 -> V2, passada 2).
 *
 * O bug: `applySignature` não era idempotente (aplicar duas vezes empilhava o prefixo
 * "*Nome:*\n" a cada passagem) e o hook chamava `supabase.auth.getUser()` — ida à rede —
 * a cada montagem do `ChatPanel`. A identidade já está resolvida no `useAuth`.
 *
 * A fronteira dublada é só a rede (`useAuth` devolve o usuário resolvido; o cliente
 * Supabase só serve a consulta de `profiles`). O hook testado é o REAL.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  user: { id: 'agente-1' } as { id: string } | null,
  perfil: { name: 'Ana Souza', job_title: null as string | null } as
    | { name: string; job_title: string | null }
    | null,
  getUser: vi.fn(async () => ({ data: { user: { id: 'agente-1' } } })),
  tabelas: [] as string[],
  userIds: [] as string[],
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  // A identidade vem do contexto de autenticação — NÃO de uma ida à rede.
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock('@/integrations/supabase/client', () => {
  const chain = {
    select: () => chain,
    eq: (coluna: string, valor: string) => {
      if (coluna === 'user_id') mocks.userIds.push(valor);
      return chain;
    },
    maybeSingle: async () => ({ data: mocks.perfil }),
  };
  return {
    supabase: {
      auth: { getUser: mocks.getUser },
      from: (tabela: string) => {
        mocks.tabelas.push(tabela);
        return chain;
      },
    },
  };
});

import { useMessageSignature } from '@/hooks/chat/useMessageSignature';

const PREFIXO_ANA = '*Ana:*\n';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.user = { id: 'agente-1' };
  mocks.perfil = { name: 'Ana Souza', job_title: null };
  mocks.tabelas = [];
  mocks.userIds = [];
});

describe('useMessageSignature — sem rede: identidade do useAuth', () => {
  it('resolve o nome pelo perfil do usuário do useAuth, sem chamar auth.getUser', async () => {
    const { result } = renderHook(() => useMessageSignature());

    await waitFor(() => expect(result.current.agentName).toBe('Ana'));

    // A rede que existia antes: `auth.getUser()` a cada montagem. Agora não há chamada.
    expect(mocks.getUser).not.toHaveBeenCalled();
    // A consulta de perfil usa o id do usuário JÁ resolvido pelo contexto.
    expect(mocks.tabelas).toContain('profiles');
    expect(mocks.userIds).toEqual(['agente-1']);
  });

  it('sem usuário (deslogado) não consulta o banco nenhuma vez', async () => {
    mocks.user = null;

    const { result } = renderHook(() => useMessageSignature());
    await act(async () => { await Promise.resolve(); });

    expect(mocks.tabelas).toEqual([]);
    expect(result.current.agentName).toBe('');
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('usa o job_title no prefixo quando o perfil tem cargo', async () => {
    mocks.perfil = { name: 'Ana Souza', job_title: 'Atendente' };

    const { result } = renderHook(() => useMessageSignature());
    await waitFor(() => expect(result.current.agentName).toBe('Ana - Atendente'));

    expect(result.current.applySignature('oi')).toBe('*Ana - Atendente:*\noi');
  });
});

describe('useMessageSignature — applySignature idempotente', () => {
  async function montar() {
    const { result } = renderHook(() => useMessageSignature());
    await waitFor(() => expect(result.current.agentName).toBe('Ana'));
    return result;
  }

  it('aplicar duas vezes não empilha a assinatura', async () => {
    const result = await montar();
    const corpo = 'corpo da mensagem';

    const umaVez = result.current.applySignature(corpo);
    const duasVezes = result.current.applySignature(umaVez);

    expect(umaVez).toBe(`${PREFIXO_ANA}${corpo}`);
    expect(duasVezes).toBe(umaVez);
    // O prefixo aparece uma única vez, no começo.
    expect(duasVezes.split('*Ana:*').length - 1).toBe(1);
  });

  it('texto que já começa pelo prefixo volta intacto', async () => {
    const result = await montar();
    const jaAssinado = `${PREFIXO_ANA}texto pronto`;

    expect(result.current.applySignature(jaAssinado)).toBe(jaAssinado);
  });

  it('conteúdo vazio não ganha assinatura (só o vazio literal; espaços são texto)', async () => {
    const result = await montar();

    // Vazio literal: nada de assinatura pendurada sozinha.
    expect(result.current.applySignature('')).toBe('');
    // Espaços são conteúdo do usuário (o limite do envio também os conta): recebem prefixo.
    expect(result.current.applySignature('   ')).toBe(`${PREFIXO_ANA}   `);
  });

  it('aplica a assinatura uma única vez em várias passagens seguidas', async () => {
    const result = await montar();
    let saida = 'mensagem';
    for (let i = 0; i < 3; i += 1) saida = result.current.applySignature(saida);

    expect(saida).toBe(`${PREFIXO_ANA}mensagem`);
  });
});

describe('useMessageSignature — alternância e persistência', () => {
  it('desligar remove a assinatura e grava a preferência', async () => {
    const { result } = renderHook(() => useMessageSignature());
    await waitFor(() => expect(result.current.agentName).toBe('Ana'));
    expect(result.current.signatureEnabled).toBe(true);

    act(() => result.current.toggleSignature());

    expect(result.current.signatureEnabled).toBe(false);
    expect(result.current.applySignature('oi')).toBe('oi');
    expect(localStorage.getItem('chat_signature_enabled')).toBe('false');

    act(() => result.current.toggleSignature());
    expect(result.current.signatureEnabled).toBe(true);
    expect(result.current.applySignature('oi')).toBe(`${PREFIXO_ANA}oi`);
    expect(localStorage.getItem('chat_signature_enabled')).toBe('true');
  });

  it('com a preferência salva como desligada, monta desligado', () => {
    localStorage.setItem('chat_signature_enabled', 'false');
    const { result } = renderHook(() => useMessageSignature());
    expect(result.current.signatureEnabled).toBe(false);
  });
});
