import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFileUploadLogic } from '../useFileUploadLogic';

const mocks = vi.hoisted(() => ({
  storageFrom: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  remove: vi.fn(),
  sendOutboundMessage: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: { from: mocks.storageFrom },
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

function createFile(name = 'Relatório final (cliente #1).pdf') {
  return new File(['conteúdo'], name, { type: 'application/pdf' });
}

function renderUpload(onFileSent = vi.fn()) {
  return {
    onFileSent,
    ...renderHook(() => useFileUploadLogic({
      contactId: CONTACT_ID,
      connectionId: 'connection-1',
      onFileSent,
    })),
  };
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
});

describe('useFileUploadLogic — storage path', () => {
  it('escopa o upload por contato e sanitiza o nome do arquivo', async () => {
    const hook = renderUpload();
    act(() => {
      hook.result.current.handleExternalFile(createFile());
    });
    await act(async () => {
      await hook.result.current.handleSendFile();
    });

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    const [storagePath] = mocks.upload.mock.calls[0];
    expect(storagePath.startsWith(`${CONTACT_ID}/`)).toBe(true);
    // sem acento, sem espaço, sem parênteses/#
    expect(storagePath).not.toMatch(/[áàâãéêíóôõúü() #]/i);
    expect(storagePath.endsWith('.pdf')).toBe(true);
  });

  it('nunca envia sem contactId selecionado (encaminha para seleção externa)', async () => {
    const onFileSelect = vi.fn();
    const hook = renderHook(() => useFileUploadLogic({ onFileSelect }));
    act(() => {
      hook.result.current.handleExternalFile(createFile());
    });
    await act(async () => {
      await hook.result.current.handleSendFile();
    });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(onFileSelect).toHaveBeenCalledTimes(1);
  });

  it('remove o objeto órfão do storage quando o envio falha após o upload', async () => {
    mocks.sendOutboundMessage.mockRejectedValueOnce(new Error('fila cheia'));
    const hook = renderUpload();
    act(() => {
      hook.result.current.handleExternalFile(createFile());
    });
    await act(async () => {
      await hook.result.current.handleSendFile();
    });

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledTimes(1));
    const [[removedPaths]] = mocks.remove.mock.calls;
    const [uploadedPath] = mocks.upload.mock.calls[0];
    expect(removedPaths).toEqual([uploadedPath]);
    expect(mocks.toastError).toHaveBeenCalled();
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
