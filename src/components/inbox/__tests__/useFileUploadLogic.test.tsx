import { createRef } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFileUploadLogic } from '../useFileUploadLogic';

const mocks = vi.hoisted(() => ({
  storageFrom: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  remove: vi.fn(),
  tableFrom: vi.fn(),
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

/**
 * SL-202: a ref do `<input type="file">` passou a ser do componente e entra no hook por
 * parametro (antes o hook a criava e a devolvia, e o objeto devolvido — por carregar uma
 * ref — era tratado como ref-like pelo compilador, gerando 75 `react-hooks/refs`).
 */
function makeFileInputRef() {
  return createRef<HTMLInputElement>();
}

function createFile(name = 'Relatório final (cliente #1).pdf') {
  return new File(['conteúdo'], name, { type: 'application/pdf' });
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
      fileInputRef: makeFileInputRef(),
    })),
  };
}

async function send(hook: { result: { current: ReturnType<typeof useFileUploadLogic> } }) {
  await act(async () => {
    await hook.result.current.handleSendFile();
  });
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
  // Padrao conservador: nenhuma linha encontrada so quando o teste provar isso.
  mocks.tableFrom.mockReturnValue(reconcileChain({ data: [{ id: 'msg-1' }], error: null }));
});

describe('useFileUploadLogic — storage path', () => {
  it('escopa o upload por contato e sanitiza o nome do arquivo', async () => {
    const hook = renderUpload();
    act(() => {
      hook.result.current.handleExternalFile(createFile());
    });
    await send(hook);

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    const [storagePath] = mocks.upload.mock.calls[0];
    expect(storagePath.startsWith(`${CONTACT_ID}/`)).toBe(true);
    // sem acento, sem espaço, sem parênteses/#
    expect(storagePath).not.toMatch(/[áàâãéêíóôõúü() #]/i);
    expect(storagePath.endsWith('.pdf')).toBe(true);
  });

  it('nunca envia sem contactId selecionado (encaminha para seleção externa)', async () => {
    const onFileSelect = vi.fn();
    const hook = renderHook(() => useFileUploadLogic({ onFileSelect, fileInputRef: makeFileInputRef() }));
    act(() => {
      hook.result.current.handleExternalFile(createFile());
    });
    await send(hook);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(onFileSelect).toHaveBeenCalledTimes(1);
  });

  it('repete a mesma sanitização em envio de fila (múltiplos arquivos)', async () => {
    const hook = renderUpload();
    act(() => {
      hook.result.current.handleExternalFiles([
        createFile('áéíóú çãõ.png'),
        createFile('segundo arquivo!!.png'),
      ]);
    });
    await act(async () => {
      await hook.result.current.handleSendAllFiles();
    });

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));
    for (const [storagePath] of mocks.upload.mock.calls) {
      expect(storagePath.startsWith(`${CONTACT_ID}/`)).toBe(true);
      expect(storagePath).not.toMatch(/[áàâãéêíóôõúü() #!]/i);
    }
  });
});

describe('useFileUploadLogic — R2-INB-006: falha após enqueue e retry', () => {
  it('remove o objeto órfão quando o envio falha e a fila prova que NÃO há linha', async () => {
    mocks.sendOutboundMessage.mockRejectedValueOnce(new Error('fila cheia'));
    mocks.tableFrom.mockReturnValue(reconcileChain({ data: [], error: null }));

    const hook = renderUpload();
    act(() => {
      hook.result.current.handleExternalFile(createFile());
    });
    await send(hook);

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledTimes(1));
    const [[removedPaths]] = mocks.remove.mock.calls;
    const [uploadedPath] = mocks.upload.mock.calls[0];
    expect(removedPaths).toEqual([uploadedPath]);
    expect(mocks.tableFrom).toHaveBeenCalledWith('messages');
    expect(mocks.toastError).toHaveBeenCalled();
  });

  it('NÃO remove o objeto quando a falha vem depois do enqueue (linha persistida)', async () => {
    mocks.sendOutboundMessage.mockRejectedValueOnce(new Error('entrega indisponível'));
    mocks.tableFrom.mockReturnValue(reconcileChain({ data: [{ id: 'msg-1' }], error: null }));

    const hook = renderUpload();
    act(() => {
      hook.result.current.handleExternalFile(createFile());
    });
    await send(hook);

    await waitFor(() => expect(mocks.sendOutboundMessage).toHaveBeenCalledTimes(1));
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalled();
  });

  it('mantém o objeto quando a reconciliação falha (estado indeterminado)', async () => {
    mocks.sendOutboundMessage.mockRejectedValueOnce(new Error('entrega indisponível'));
    mocks.tableFrom.mockReturnValue(reconcileChain({ data: null, error: { message: 'rls' } }));

    const hook = renderUpload();
    act(() => {
      hook.result.current.handleExternalFile(createFile());
    });
    await send(hook);

    await waitFor(() => expect(mocks.sendOutboundMessage).toHaveBeenCalledTimes(1));
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('retry reaproveita o objeto e o mesmo id lógico (sem novo upload nem outra ação)', async () => {
    const file = createFile('contrato.pdf');
    mocks.sendOutboundMessage
      .mockRejectedValueOnce(new Error('entrega indisponível'))
      .mockResolvedValueOnce({ id: 'msg-1', status: 'sent', externalId: 'ext-1', idempotent: true });
    mocks.tableFrom.mockReturnValue(reconcileChain({ data: [{ id: 'msg-1' }], error: null }));

    const hook = renderUpload();
    act(() => {
      hook.result.current.handleExternalFile(file);
    });
    await send(hook);
    await waitFor(() => expect(mocks.sendOutboundMessage).toHaveBeenCalledTimes(1));

    // Reenvio do mesmo arquivo depois da falha de entrega.
    act(() => {
      hook.result.current.handleExternalFile(file);
    });
    await send(hook);
    await waitFor(() => expect(mocks.sendOutboundMessage).toHaveBeenCalledTimes(2));

    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.remove).not.toHaveBeenCalled();

    const [firstInput] = mocks.sendOutboundMessage.mock.calls[0];
    const [secondInput] = mocks.sendOutboundMessage.mock.calls[1];
    expect(secondInput.clientMessageId).toBe(firstInput.clientMessageId);
    expect(secondInput.mediaUrl).toBe(firstInput.mediaUrl);
    expect(secondInput.clientMessageId).toBeTruthy();
  });
});
