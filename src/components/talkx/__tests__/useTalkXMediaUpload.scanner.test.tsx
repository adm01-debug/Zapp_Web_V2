import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTalkXMediaUpload } from '../useTalkXMediaUpload';

/**
 * HZ1-02 — o upload de mídia do Talk X também passa pelo `file-security-scanner`.
 *
 * Espelho do caso do compositor: arquivo barrado não é gravado no bucket; a falha
 * passageira sobe como erro para o dropzone mostrar o "Tente novamente"; e o
 * `scanned:false` (servidor em falha-aberto) não impede o envio.
 */

const mocks = vi.hoisted(() => ({
  storageFrom: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  scanInvoke: vi.fn(),
  profile: { id: '11111111-2222-3333-4444-555555555555' } as { id: string } | null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: mocks.storageFrom }, functions: { invoke: mocks.scanInvoke } },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: mocks.profile }),
}));

const CLEAN = {
  data: { success: true, scanned: true, verdict: 'clean', scanId: 'scan-tx', message: 'Arquivo verificado.' },
  error: null,
};

function httpError(status: number, body: unknown) {
  return {
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storageFrom.mockImplementation((bucket: string) => ({
    upload: (path: string, file: unknown, opts: unknown) => mocks.upload(bucket, path, file, opts),
    remove: (paths: string[]) => mocks.remove(bucket, paths),
  }));
  mocks.upload.mockResolvedValue({ data: { path: 'x' }, error: null });
  mocks.remove.mockResolvedValue({ data: null, error: null });
  mocks.scanInvoke.mockResolvedValue(CLEAN);
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 100, height: 100, close: vi.fn() })));
});

describe('useTalkXMediaUpload — varredura antes de gravar no bucket', () => {
  it('arquivo barrado (422 MALWARE_DETECTED) não é gravado e o erro sobe para a tela', async () => {
    mocks.scanInvoke.mockResolvedValue({
      data: null,
      error: httpError(422, {
        error: true,
        code: 'MALWARE_DETECTED',
        message: 'Arquivo bloqueado: ameaça detectada.',
        verdict: 'malicious',
        scanId: 'scan-eicar',
      }),
    });

    const { result } = renderHook(() => useTalkXMediaUpload());
    const file = new File(['eicar'], 'eicar.pdf', { type: 'application/pdf' });

    await expect(result.current.upload(file)).rejects.toThrow('Arquivo bloqueado: ameaça detectada.');
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('falha passageira (408) sobe com o texto de repetir', async () => {
    mocks.scanInvoke.mockResolvedValue({
      data: null,
      error: httpError(408, {
        error: true,
        code: 'SCAN_TIMEOUT',
        message: 'Tempo esgotado ao verificar o arquivo.',
        verdict: 'unknown',
      }),
    });

    const { result } = renderHook(() => useTalkXMediaUpload());
    const file = new File(['conteudo'], 'manual.pdf', { type: 'application/pdf' });

    await expect(result.current.upload(file)).rejects.toThrow('Tempo esgotado ao verificar o arquivo.');
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('arquivo limpo sobe normalmente (varredura não trava o fluxo)', async () => {
    const { result } = renderHook(() => useTalkXMediaUpload());
    const file = new File(['conteudo'], 'manual.pdf', { type: 'application/pdf' });

    const value = await result.current.upload(file);

    expect(mocks.scanInvoke).toHaveBeenCalledWith('file-security-scanner', { body: expect.any(FormData) });
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(value.media_type).toBe('document');
  });

  it('scanned:false (servidor em falha-aberto) não impede a gravação', async () => {
    mocks.scanInvoke.mockResolvedValue({
      data: { success: true, scanned: false, verdict: 'unknown', reason: 'too_large', scanId: null },
      error: null,
    });

    const { result } = renderHook(() => useTalkXMediaUpload());
    const file = new File(['conteudo'], 'manual.pdf', { type: 'application/pdf' });

    await expect(result.current.upload(file)).resolves.toBeTruthy();
    expect(mocks.upload).toHaveBeenCalledTimes(1);
  });
});
