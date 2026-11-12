import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

vi.mock('@/lib/lazyToast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { provisionarSip, SIP_NOT_CONFIGURED_STORAGE_KEY, SIP_NOT_CONFIGURED_TTL_MS } from '../sipProvisioning';
import { toast } from '@/lib/lazyToast';

const mockInvoke = vi.mocked(
  (await import('@/integrations/supabase/client')).supabase.functions.invoke
);
const mockToastError = vi.mocked(toast.error);

afterEach(() => {
  vi.useRealTimers();
});
const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  localStorage.clear();
  mockInvoke.mockReset();
  mockToastError.mockReset();
  mockConsoleWarn.mockClear();
});

describe('provisionarSip — mensagem de erro sem jargão técnico', () => {
  it('não exibe SIP_PASSWORD nem Supabase no toast quando o segredo está ausente (503)', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: { context: { status: 503, code: 'SIP_NOT_CONFIGURED' } },
    });

    const result = await provisionarSip();

    expect(result).toBeNull();
    expect(mockToastError).toHaveBeenCalledWith(
      expect.not.stringContaining('SIP_PASSWORD')
    );
    expect(mockToastError).toHaveBeenCalledWith(
      expect.not.stringContaining('Supabase')
    );
    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining('Fale com o administrador')
    );
  });

  it('não exibe SIP_PASSWORD nem Supabase no toast quando não há erro mas falta a senha', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: null });

    const result = await provisionarSip();

    expect(result).toBeNull();
    expect(mockToastError).toHaveBeenCalledWith(
      expect.not.stringContaining('SIP_PASSWORD')
    );
    expect(mockToastError).toHaveBeenCalledWith(
      expect.not.stringContaining('Supabase')
    );
    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining('Fale com o administrador')
    );
  });

  it('escreve o detalhe técnico no log (console.warn) quando o segredo está ausente', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: { context: { status: 503, code: 'SIP_NOT_CONFIGURED' } },
    });

    await provisionarSip();

    expect(mockConsoleWarn).toHaveBeenCalledWith(
      expect.stringContaining('SIP_PASSWORD')
    );
  });
});
describe('provisionarSip — telefonia não configurada não repete a cada carregamento', () => {
  const naoConfigurado = { data: null, error: { context: { status: 503, code: 'SIP_NOT_CONFIGURED' } } };

  it('depois do 503 SIP_NOT_CONFIGURED não chama a função de novo (nem log, nem toast) dentro do prazo', async () => {
    mockInvoke.mockResolvedValue(naoConfigurado);

    expect(await provisionarSip()).toBeNull();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockConsoleWarn).toHaveBeenCalledTimes(1);
    expect(mockToastError).toHaveBeenCalledTimes(1);

    // Novo carregamento / nova aba líder: nada de 503 no console outra vez.
    expect(await provisionarSip()).toBeNull();
    expect(await provisionarSip()).toBeNull();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockConsoleWarn).toHaveBeenCalledTimes(1);
    expect(mockToastError).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(SIP_NOT_CONFIGURED_STORAGE_KEY)).not.toBeNull();
  });

  it('passado o prazo, tenta de novo (o administrador pode ter configurado o segredo)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-12T12:00:00Z'));
    mockInvoke.mockResolvedValueOnce(naoConfigurado);
    await provisionarSip();

    vi.setSystemTime(new Date(Date.now() + SIP_NOT_CONFIGURED_TTL_MS + 1));
    mockInvoke.mockResolvedValueOnce({
      data: { password: 'p', server: 'sip.example', user: 'u', wsPort: 8089 },
      error: null,
    });
    expect(await provisionarSip()).toEqual({ password: 'p', server: 'sip.example', user: 'u', wsPort: 8089 });
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });

  it('erro que NÃO é falta de segredo (ex.: sessão) não trava as próximas tentativas', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { context: { status: 401 } } });
    await provisionarSip();
    await provisionarSip();
    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(SIP_NOT_CONFIGURED_STORAGE_KEY)).toBeNull();
  });
});
describe('provisionarSip — trava só no SIP_NOT_CONFIGURED explícito, com prazo limitado', () => {
  // Como o SDK real entrega: `context` é a Response com o corpo JSON da função.
  const respostaErro = (status: number, body: unknown) => ({
    data: null,
    error: { name: 'FunctionsHttpError', message: 'non-2xx', context: new Response(JSON.stringify(body), { status }) },
  });
  const ok = { data: { password: 'p', server: 'sip.example', user: 'u', wsPort: 8089 }, error: null };

  it('503 SIP_NOT_CONFIGURED lido do corpo da Response trava', async () => {
    mockInvoke.mockResolvedValue(respostaErro(503, { error: 'SIP não configurado', code: 'SIP_NOT_CONFIGURED' }));
    await provisionarSip();
    await provisionarSip();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining('administrador'));
  });

  it('503 passageiro (BOOT_ERROR da Edge) NÃO trava: a próxima tentativa conecta', async () => {
    mockInvoke.mockResolvedValueOnce(respostaErro(503, { code: 'BOOT_ERROR', message: 'Function failed to start' }));
    expect(await provisionarSip()).toBeNull();
    expect(localStorage.getItem(SIP_NOT_CONFIGURED_STORAGE_KEY)).toBeNull();
    expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining('Erro ao conectar'));
    mockInvoke.mockResolvedValueOnce(ok);
    expect(await provisionarSip()).toEqual(ok.data);
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });

  it('503 sem corpo legível não trava (mas segue com o aviso ao administrador)', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { context: new Response('gateway', { status: 503 }) } });
    await provisionarSip();
    expect(localStorage.getItem(SIP_NOT_CONFIGURED_STORAGE_KEY)).toBeNull();
    expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining('administrador'));
  });

  it('`até` além do prazo (relógio corrigido / valor adulterado) é ignorado e apagado', async () => {
    localStorage.setItem(SIP_NOT_CONFIGURED_STORAGE_KEY, String(Date.now() + 10 * 24 * 3_600_000));
    mockInvoke.mockResolvedValue(ok);
    expect(await provisionarSip()).toEqual(ok.data);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(SIP_NOT_CONFIGURED_STORAGE_KEY)).toBeNull();
  });

  it('valor não numérico na trava é ignorado', async () => {
    localStorage.setItem(SIP_NOT_CONFIGURED_STORAGE_KEY, 'lixo');
    mockInvoke.mockResolvedValue(ok);
    expect(await provisionarSip()).toEqual(ok.data);
  });

  it('ignorarTrava (pedido explícito) chama a função mesmo travado e solta a trava no sucesso', async () => {
    localStorage.setItem(SIP_NOT_CONFIGURED_STORAGE_KEY, String(Date.now() + 60_000));
    mockInvoke.mockResolvedValue(ok);
    expect(await provisionarSip()).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(await provisionarSip({ ignorarTrava: true })).toEqual(ok.data);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(SIP_NOT_CONFIGURED_STORAGE_KEY)).toBeNull();
  });
});
