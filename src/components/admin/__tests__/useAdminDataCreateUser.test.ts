import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Criação de usuário passa pela camada padrão de Edge (`invokeEdge`, de
// src/lib/invokeEdge, como o PE-43), com refresh de sessão em 401, leitura
// guardada do corpo de erro e mensagem traduzida para o CAMPO do formulário. O
// caminho antigo era `fetch` cru com `Bearer ${session?.access_token}` (podia
// virar 'Bearer undefined'), `await response.json()` sem guarda e a mensagem
// crua do servidor mostrada ao usuário.
const { mockInvokeEdge, mockRefreshSession, mockFrom, mockUpload } = vi.hoisted(() => ({
  mockInvokeEdge: vi.fn(),
  mockRefreshSession: vi.fn(),
  mockFrom: vi.fn(),
  mockUpload: vi.fn(),
}));

// `invokeEdge`/`supabase` de `useAdminData.ts` vêm de `@/lib/invokeEdge` e
// `@/integrations/supabase/client` — não de `@/lib/supabaseHelpers` (módulo
// que o hook não importa). Mockar o caminho errado deixava o `invokeEdge` e o
// `supabase` REAIS em ação: `supabase.functions.invoke` real (sem client real)
// lançava, caindo sempre no `catch` e devolvendo `false`, qualquer que fosse o
// cenário do teste. `readEdgeError` (`parseEdgeError`) continua REAL via
// `importOriginal` — é só leitura/parsing do erro, sem dependência externa, e
// o `httpError()` abaixo já monta o formato exato que ele espera.
vi.mock('@/lib/invokeEdge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/invokeEdge')>();
  return { ...actual, invokeEdge: mockInvokeEdge };
});

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_URL: 'https://local.test',
  supabase: {
    auth: { refreshSession: mockRefreshSession },
    from: mockFrom.mockImplementation(() => ({
      select: vi.fn(() =>
        Object.assign(Promise.resolve({ data: [], error: null }), {
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        })
      ),
    })),
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://exemplo/avatar.png' } })),
      })),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

import { useAdminData, mapCreateUserError } from '@/components/admin/useAdminData';
import { toast } from 'sonner';

type Payload = Parameters<ReturnType<typeof useAdminData>['handleCreateUser']>[0];

const payload: Payload = {
  name: 'Ana Souza',
  email: 'ana.souza@exemplo.com',
  password: 'senha1234',
  role: 'agent',
};

// Erro no formato do supabase-js: `FunctionsHttpError` com o `Response` cru em
// `error.context` (é de onde sai a mensagem real da Edge). `invokeEdge` lança
// esse erro em vez de devolvê-lo.
function httpError(status: number, body: string, contentType = 'application/json') {
  return {
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: new Response(body, { status, headers: { 'Content-Type': contentType } }),
  };
}

async function cria(result: { current: ReturnType<typeof useAdminData> }, p: Payload = payload) {
  let ok: boolean | undefined;
  await act(async () => {
    ok = await result.current.handleCreateUser(p);
  });
  return ok;
}

describe('useAdminData.handleCreateUser — camada de Edge padrão', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpload.mockResolvedValue({ error: null });
    mockRefreshSession.mockResolvedValue({ error: null });
    mockInvokeEdge.mockResolvedValue({ success: true, user_id: 'u-1' });
  });

  it('usa invokeEdge (sem fetch cru) e manda o corpo para create-user', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() => useAdminData('users'));

    const ok = await cria(result);

    expect(ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockInvokeEdge).toHaveBeenCalledTimes(1);
    // `invokeEdge(functionName, options)` — o corpo vai em `options.body`
    // (contrato de `src/lib/invokeEdge.ts`), não como 2º argumento direto.
    const [fnName, options] = mockInvokeEdge.mock.calls[0];
    const body = (options as { body: unknown }).body;
    expect(fnName).toBe('create-user');
    expect(body).toMatchObject({
      name: 'Ana Souza',
      email: 'ana.souza@exemplo.com',
      role: 'agent',
    });
    expect(toast.success).toHaveBeenCalledWith('Usuário criado com sucesso!');
    expect(mockFrom).toHaveBeenCalledWith('profiles');
    fetchSpy.mockRestore();
  });

  it('e-mail duplicado vira erro do campo email, em pt-BR, sem mostrar a mensagem crua', async () => {
    mockInvokeEdge.mockRejectedValue(
      httpError(
        422,
        JSON.stringify({ error: 'A user with this email address has already been registered' })
      )
    );
    const { result } = renderHook(() => useAdminData('users'));

    const ok = await cria(result);

    expect(ok).toBe(false);
    await waitFor(() =>
      expect(result.current.createUserError).toEqual({
        field: 'email',
        message: 'Este e-mail já está cadastrado.',
      })
    );
    expect(toast.error).toHaveBeenCalledWith('Este e-mail já está cadastrado.');
    expect(toast.error).not.toHaveBeenCalledWith(
      'A user with this email address has already been registered'
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('papel inválido vira erro do campo role', async () => {
    mockInvokeEdge.mockRejectedValue(
      httpError(
        400,
        JSON.stringify({
          error:
            "Invalid enum value. Expected 'admin' | 'supervisor' | 'agent' | 'special_agent', received 'chefe'",
        })
      )
    );
    const { result } = renderHook(() => useAdminData('users'));

    const ok = await cria(result);

    expect(ok).toBe(false);
    await waitFor(() =>
      expect(result.current.createUserError).toEqual({
        field: 'role',
        message: 'Papel de usuário inválido.',
      })
    );
    expect(toast.error).toHaveBeenCalledWith('Papel de usuário inválido.');
  });

  it('em 401 renova a sessão uma vez e repete a criação, dando certo no retry', async () => {
    mockInvokeEdge
      .mockRejectedValueOnce(httpError(401, JSON.stringify({ error: 'Não autorizado' })))
      .mockResolvedValueOnce({ success: true, user_id: 'u-2' });
    const { result } = renderHook(() => useAdminData('users'));

    const ok = await cria(result);

    expect(ok).toBe(true);
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    expect(mockInvokeEdge).toHaveBeenCalledTimes(2);
    expect(toast.success).toHaveBeenCalledWith('Usuário criado com sucesso!');
  });

  it('em 401 cujo refresh falha não repete a chamada e devolve erro geral', async () => {
    mockInvokeEdge.mockRejectedValue(httpError(401, JSON.stringify({ error: 'Não autorizado' })));
    mockRefreshSession.mockResolvedValue({ error: { message: 'refresh_token_not_found' } });
    const { result } = renderHook(() => useAdminData('users'));

    const ok = await cria(result);

    expect(ok).toBe(false);
    expect(mockInvokeEdge).toHaveBeenCalledTimes(1);
    expect(result.current.createUserError).toEqual({
      field: null,
      message: 'Erro ao criar usuário',
    });
    expect(toast.error).toHaveBeenCalledWith('Erro ao criar usuário');
  });

  it('corpo de erro não-JSON (HTML de proxy) não quebra e cai na mensagem geral', async () => {
    mockInvokeEdge.mockRejectedValue(httpError(502, '<html>Bad gateway</html>', 'text/html'));
    const { result } = renderHook(() => useAdminData('users'));

    const ok = await cria(result);

    expect(ok).toBe(false);
    expect(result.current.createUserError).toEqual({
      field: null,
      message: 'Erro ao criar usuário',
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('a tentativa seguinte limpa o erro por campo da anterior', async () => {
    mockInvokeEdge.mockRejectedValueOnce(
      httpError(422, JSON.stringify({ error: 'User already registered' }))
    );
    const { result } = renderHook(() => useAdminData('users'));

    await cria(result);
    await waitFor(() => expect(result.current.createUserError?.field).toBe('email'));

    mockInvokeEdge.mockResolvedValueOnce({ success: true });
    const ok = await cria(result);

    expect(ok).toBe(true);
    expect(result.current.createUserError).toBeNull();
  });

  it('mapCreateUserError classifica sem mostrar a mensagem crua do servidor', () => {
    expect(mapCreateUserError('Email inválido')).toEqual({
      field: 'email',
      message: 'Informe um e-mail válido.',
    });
    expect(mapCreateUserError('Senha deve ter no mínimo 8 caracteres')).toEqual({
      field: 'password',
      message: 'A senha deve ter pelo menos 8 caracteres.',
    });
    expect(mapCreateUserError('Nome é obrigatório')).toEqual({
      field: 'name',
      message: 'Informe o nome do usuário.',
    });
    expect(mapCreateUserError('Internal server error')).toEqual({
      field: null,
      message: 'Erro ao criar usuário',
    });
    expect(mapCreateUserError(undefined)).toEqual({
      field: null,
      message: 'Erro ao criar usuário',
    });
  });
});
