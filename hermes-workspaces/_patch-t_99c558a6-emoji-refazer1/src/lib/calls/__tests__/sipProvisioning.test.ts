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

import { provisionarSip } from '../sipProvisioning';
import { toast } from '@/lib/lazyToast';

const mockInvoke = vi.mocked(
  (await import('@/integrations/supabase/client')).supabase.functions.invoke
);
const mockToastError = vi.mocked(toast.error);
const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
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