import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useScanResponseHandler } from '../useScanResponseHandler';
import type { ScanResult } from '@/lib/scanResponse';

/**
 * HZ1-02 — o resultado da varredura vira UM aviso na tela.
 *
 * O que este teste protege: bloqueio NÃO oferece "Tentar novamente" (reenviar o
 * mesmo arquivo barrado é o erro que o cartão quer evitar) e o aviso de "não
 * verificado" não pode cair no id do envio, senão o toast de sucesso o apaga
 * antes de alguém ler.
 */

const mocks = vi.hoisted(() => ({
  toastInfo: vi.fn(),
  toastError: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { info: mocks.toastInfo, error: mocks.toastError, success: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), warn: mocks.warn, error: mocks.error },
}));

const clean: ScanResult = { status: 'success', verdict: 'clean', scanId: 'scan-1', message: 'Arquivo verificado.', payload: {} };
const malware: ScanResult = {
  status: 'error',
  code: 'MALWARE_DETECTED',
  message: 'Arquivo bloqueado: ameaça detectada.',
  verdict: 'malicious',
  scanId: 'scan-eicar',
};
const timeout: ScanResult = {
  status: 'error',
  code: 'SCAN_TIMEOUT',
  message: 'Tempo esgotado ao verificar o arquivo.',
  verdict: 'unknown',
  scanId: 'scan-2',
};
const skipped: ScanResult = {
  status: 'skipped',
  reason: 'no_key',
  message: 'O arquivo não pôde ser verificado agora e será enviado mesmo assim.',
  scanId: null,
  payload: {},
};
const invalid: ScanResult = {
  status: 'error',
  code: 'INVALID_INPUT',
  message: 'Arquivo inválido.',
  verdict: 'unknown',
  scanId: null,
};

function handler() {
  return renderHook(() => useScanResponseHandler()).result.current.handleScanResult;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useScanResponseHandler', () => {
  it('sucesso não mostra aviso nenhum (quem chamou dá a boa notícia do envio)', () => {
    const handle = handler();
    let outcome = '';
    act(() => {
      outcome = handle(clean, { fileName: 'a.pdf' });
    });

    expect(outcome).toBe('success');
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.toastInfo).not.toHaveBeenCalled();
  });

  it('malware bloqueia com aviso forte, sem "Tentar novamente"', () => {
    const handle = handler();
    let outcome = '';
    act(() => {
      outcome = handle(malware, { fileName: 'eicar.pdf', toastId: 'upload-1' });
    });

    expect(outcome).toBe('blocked');
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    const [message, opts] = mocks.toastError.mock.calls[0];
    expect(message).toBe('Arquivo bloqueado: ameaça detectada.');
    expect(opts).toMatchObject({
      id: 'upload-1',
      description: 'Arquivo: eicar.pdf · ID da varredura: scan-eicar',
      duration: 8000,
    });
    expect(opts.action).toBeUndefined();
    expect(mocks.toastInfo).not.toHaveBeenCalled();
  });

  it('falha passageira mostra o botão que repete o envio', () => {
    const onRetry = vi.fn();
    const handle = handler();
    let outcome = '';
    act(() => {
      outcome = handle(timeout, { fileName: 'grande.zip', toastId: 'upload-1', onRetry });
    });

    expect(outcome).toBe('retry');
    const [, opts] = mocks.toastError.mock.calls[0];
    expect(opts).toMatchObject({ id: 'upload-1', duration: 10000 });
    expect(opts.action.label).toBe('Tentar novamente');
    act(() => {
      opts.action.onClick();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('falha passageira sem callback não mostra botão (não promete o que não faz)', () => {
    const handle = handler();
    act(() => {
      handle(timeout, { fileName: 'grande.zip' });
    });
    const [, opts] = mocks.toastError.mock.calls[0];
    expect(opts.action).toBeUndefined();
  });

  it('"não verificado" avisa em voz baixa e em id PRÓPRIO — o envio segue', () => {
    const handle = handler();
    let outcome = '';
    act(() => {
      outcome = handle(skipped, { fileName: 'video.mp4', toastId: 'upload-1' });
    });

    expect(outcome).toBe('skipped');
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.toastInfo).toHaveBeenCalledTimes(1);
    const [message, opts] = mocks.toastInfo.mock.calls[0];
    expect(message).toContain('enviado mesmo assim');
    expect(opts).toMatchObject({ id: 'upload-1-scan', description: 'Arquivo: video.mp4', duration: 8000 });
    expect(mocks.warn).toHaveBeenCalled();
  });

  it('erro de pedido (INVALID_INPUT) não oferece repetição', () => {
    const handle = handler();
    let outcome = '';
    act(() => {
      outcome = handle(invalid, { fileName: 'x.bin' });
    });

    expect(outcome).toBe('input');
    const [, opts] = mocks.toastError.mock.calls[0];
    expect(opts.action).toBeUndefined();
  });

  it('falha desconhecida é registrada como erro e avisada sem botão', () => {
    const handle = handler();
    act(() => {
      handle({ status: 'error', code: 'UNKNOWN', message: 'Resposta inválida do servidor.', verdict: 'unknown', scanId: null }, {});
    });

    expect(mocks.error).toHaveBeenCalled();
    const [, opts] = mocks.toastError.mock.calls[0];
    expect(opts.action).toBeUndefined();
  });
});
