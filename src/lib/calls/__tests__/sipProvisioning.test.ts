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
