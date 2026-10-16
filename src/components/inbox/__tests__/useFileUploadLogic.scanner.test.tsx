import { createRef } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFileUploadLogic } from '../useFileUploadLogic';

/**
 * HZ1-02 — o arquivo que o agente manda ao cliente passa pelo `file-security-scanner`.
 *
 * O caso de referência do cartão é o EICAR: a Edge responde 422 MALWARE_DETECTED e o
 * arquivo NÃO pode subir para o Storage nem virar mensagem para o cliente. Os outros
 * dois caminhos provam que o bloqueio não virou um "não envia nada": falha passageira
 * oferece "Tentar novamente" (e o clique reenvia de verdade) e o servidor em
 * falha-aberto (`scanned:false`) deixa passar com aviso discreto.
 */

const mocks = vi.hoisted(() => ({
  storageFrom: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  remove: vi.fn(),
  tableFrom: vi.fn(),
  scanInvoke: vi.fn(),
  sendOutboundMessage: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: { from: mocks.storageFrom },
    from: mocks.tableFrom,
    functions: { invoke: mocks.scanInvoke },
  },
}));

vi.mock('@/services/outbound-message.service', () => ({
  sendOutboundMessage: mocks.sendOutboundMessage,
}));

vi.mock('sonner', () => ({
  toast: {
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
    error: mocks.toastError,
    warning: mocks.toastWarning,
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const CONTACT_ID = '32a7c69a-bbbb-4b94-8888-61b95bb25a0d';
const LOCATOR_URL = 'https://project.test/storage/v1/object/public/whatsapp-media/locator';
const CLEAN = {
  data: { success: true, scanned: true, verdict: 'clean', scanId: 'scan-1', message: 'Arquivo verificado.' },
  error: null,
};

function httpError(status: number, body: unknown) {
  return {
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  };
}

/** Cadeia minima da reconciliacao por (contact_id, client_message_id). */
function reconcileChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    limit: () => Promise.resolve(result),
  };
  return chain;
}

function renderUpload(onFileSent = vi.fn()) {
  return {
    onFileSent,
    ...renderHook(() => useFileUploadLogic({
      contactId: CONTACT_ID,
      connectionId: 'connection-1',
      onFileSent,
      fileInputRef: createRef<HTMLInputElement>(),
    })),
  };
}

async function send(hook: { result: { current: ReturnType<typeof useFileUploadLogic> } }) {
  await act(async () => {
    await hook.result.current.handleSendFile();
  });
}

/** O caso de referência: texto do arquivo de teste padrão EICAR (não é malware real). */
function eicarFile() {
  return new File(
    ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'],
    'eicar.txt',
    { type: 'text/plain' },
  );
}

function document(name = 'laudo.pdf') {
  return new File(['conteúdo'], name, { type: 'application/pdf' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storageFrom.mockReturnValue({
    upload: mocks.upload,
    getPublicUrl: mocks.getPublicUrl,
    remove: mocks.remove,
  });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.getPublicUrl.mockReturnValue({ data: { publicUrl: LOCATOR_URL } });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.sendOutboundMessage.mockResolvedValue({ id: 'msg-1', status: 'sent', externalId: 'ext-1', idempotent: false });
  mocks.tableFrom.mockReturnValue(reconcileChain({ data: [{ id: 'msg-1' }], error: null }));
  mocks.scanInvoke.mockResolvedValue(CLEAN);
});

describe('useFileUploadLogic — varredura antes do envio', () => {
  it('EICAR barrado (422 MALWARE_DETECTED) não sobe nem vira mensagem, e avisa', async () => {
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

    const hook = renderUpload();
    act(() => {
      hook.result.current.handleExternalFile(eicarFile());
    });
    await send(hook);
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());

    // O arquivo não saiu do sistema: nada no Storage, nada para o cliente.
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.sendOutboundMessage).not.toHaveBeenCalled();
    // E a tela diz por quê, sem oferecer "Tentar novamente" (reenviar o mesmo barrado não faz sentido).
    expect(mocks.toastError.mock.calls[0][0]).toBe('Arquivo bloqueado: ameaça detectada.');
    expect(mocks.toastError.mock.calls[0][1]?.action).toBeUndefined();
    expect(mocks.toastError.mock.calls[0][1]?.description).toContain('eicar.txt');
  });

  it('arquivo limpo segue o fluxo de sempre (varredura não atrapalha o envio)', async () => {
    const hook = renderUpload();
    act(() => {
      hook.result.current.handleExternalFile(document());
    });
    await send(hook);
    await waitFor(() => expect(mocks.sendOutboundMessage).toHaveBeenCalledTimes(1));

    expect(mocks.scanInvoke).toHaveBeenCalledTimes(1);
    const [fnName, options] = mocks.scanInvoke.mock.calls[0];
    expect(fnName).toBe('file-security-scanner');
    expect(options.body).toBeInstanceOf(FormData);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('408 SCAN_TIMEOUT oferece "Tentar novamente" e o clique reenvia o MESMO arquivo', async () => {
    mocks.scanInvoke
      .mockResolvedValueOnce({
        data: null,
        error: httpError(408, {
          error: true,
          code: 'SCAN_TIMEOUT',
          message: 'Tempo esgotado ao verificar o arquivo.',
          verdict: 'unknown',
          scanId: 'scan-2',
        }),
      })
      .mockResolvedValueOnce(CLEAN);

    const hook = renderUpload();
    act(() => {
      hook.result.current.handleExternalFile(document());
    });
    await send(hook);
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());

    expect(mocks.upload).not.toHaveBeenCalled();
    const [, opts] = mocks.toastError.mock.calls[0];
    expect(opts.action?.label).toBe('Tentar novamente');

    // O botão repete o envio: segunda varredura passa e o arquivo sobe uma única vez.
    await act(async () => {
      opts.action.onClick();
    });
    await waitFor(() => expect(mocks.sendOutboundMessage).toHaveBeenCalledTimes(1));
    expect(mocks.scanInvoke).toHaveBeenCalledTimes(2);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
  });

  it('servidor em falha-aberto (scanned:false) envia, mas avisa que não houve verificação', async () => {
    mocks.scanInvoke.mockResolvedValue({
      data: {
        success: true,
        scanned: false,
        verdict: 'unknown',
        reason: 'no_key',
        message: 'O arquivo não pôde ser verificado agora e será enviado mesmo assim.',
        scanId: null,
      },
      error: null,
    });

    const hook = renderUpload();
    act(() => {
      hook.result.current.handleExternalFile(document('reuniao.pdf'));
    });
    await send(hook);
    await waitFor(() => expect(mocks.sendOutboundMessage).toHaveBeenCalledTimes(1));

    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).not.toHaveBeenCalled();
    // O aviso de "não verificado" sai em id PRÓPRIO: precisa sobreviver ao toast de sucesso.
    const skipCall = mocks.toastInfo.mock.calls.find(([, o]) => o?.id === 'file-upload-scan');
    expect(skipCall, 'aviso discreto de "não verificado" não foi emitido').toBeTruthy();
    expect(skipCall?.[0]).toContain('enviado mesmo assim');
  });

  it('lote com 2 skipped emite um aviso por arquivo, cada um no próprio id', async () => {
    mocks.scanInvoke.mockResolvedValue({
      data: {
        success: true,
        scanned: false,
        verdict: 'unknown',
        reason: 'no_key',
        message: 'O arquivo não pôde ser verificado agora e será enviado mesmo assim.',
        scanId: null,
      },
      error: null,
    });

    const hook = renderUpload();
    act(() => {
      hook.result.current.handleExternalFiles([document('a.pdf'), document('b.pdf')]);
    });
    await act(async () => {
      await hook.result.current.handleSendAllFiles();
    });
    await waitFor(() => expect(mocks.sendOutboundMessage).toHaveBeenCalledTimes(2));

    // Um aviso por arquivo, cada um no id do próprio item: o segundo não apaga o primeiro.
    const skipAvisos = mocks.toastInfo.mock.calls.filter(
      ([, o]) => typeof o?.id === 'string' && o.id.includes('scan'),
    );
    expect(skipAvisos.length).toBe(2);
    expect(new Set(skipAvisos.map(([, o]) => o.id)).size).toBe(2);
  });

  it('durante a varredura expõe isScanning e mantém o formulário aberto (R3)', async () => {
    let resolveScan!: (value: unknown) => void;
    mocks.scanInvoke.mockReturnValueOnce(new Promise((resolve) => { resolveScan = resolve; }));

    const hook = renderUpload();
    act(() => {
      hook.result.current.handleExternalFile(document());
    });
    let sending!: Promise<void>;
    act(() => {
      sending = hook.result.current.handleSendFile();
    });
    await waitFor(() => expect(hook.result.current.isScanning).toBe(true));

    // A janela dos 30 s não fecha nem limpa o formulário no meio da verificação.
    expect(hook.result.current.filePreview).toBeTruthy();
    expect(hook.result.current.isDialogOpen).toBe(true);

    await act(async () => {
      resolveScan(CLEAN);
      await sending;
    });
    await waitFor(() => expect(mocks.sendOutboundMessage).toHaveBeenCalledTimes(1));
    expect(hook.result.current.isScanning).toBe(false);
  });

  it('duplo envio concorrente (R3) sobe e despacha uma única vez', async () => {
    let resolveScan!: (value: unknown) => void;
    mocks.scanInvoke.mockReturnValue(new Promise((resolve) => { resolveScan = resolve; }));

    const onFileSent = vi.fn();
    const hook = renderUpload(onFileSent);
    act(() => {
      hook.result.current.handleExternalFile(document());
    });
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = hook.result.current.handleSendFile();
      second = hook.result.current.handleSendFile();
    });
    await act(async () => {
      resolveScan(CLEAN);
      await Promise.all([first, second]);
    });

    // O segundo clique reaproveita o envio em curso: um scan, um objeto, uma mensagem.
    await waitFor(() => expect(mocks.sendOutboundMessage).toHaveBeenCalledTimes(1));
    expect(mocks.scanInvoke).toHaveBeenCalledTimes(1);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(onFileSent).toHaveBeenCalledTimes(1);
  });
});
