import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFileUploadLogic, type FileDeliveryOutcome } from '../useFileUploadLogic';

const mocks = vi.hoisted(() => ({
  storageFrom: vi.fn(),
  upload: vi.fn(),
  createSignedUrl: vi.fn(),
  getPublicUrl: vi.fn(),
  remove: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
  sendMediaMessage: vi.fn(),
  sendAudioMessage: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: { from: mocks.storageFrom },
    from: mocks.from,
  },
}));

vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({
    sendMediaMessage: mocks.sendMediaMessage,
    sendAudioMessage: mocks.sendAudioMessage,
    isLoading: false,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
    error: mocks.toastError,
  },
}));

vi.mock('@/lib/logger', () => ({
  log: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const CONTACT_ID = '32a7c69a-bbbb-4b94-8888-61b95bb25a0d';
const MESSAGE_ID = '52f61d80-5d7a-4d4a-932a-d0b0eed33333';
const LOCATOR_URL = 'https://project.test/storage/v1/object/public/whatsapp-media/locator';
const SIGNED_URL = 'https://project.test/storage/v1/object/sign/whatsapp-media/delivery';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createFile() {
  return new File(['conteúdo'], 'Relatório final (cliente #1).pdf', { type: 'text/plain' });
}

function renderUpload(onFileSent = vi.fn()) {
  return {
    onFileSent,
    ...renderHook(() => useFileUploadLogic({
      instanceName: 'instance-zapp',
      recipientNumber: '5511999999999',
      contactId: CONTACT_ID,
      connectionId: 'connection-1',
      onFileSent,
    })),
  };
}

async function selectAndSend(
  hook: ReturnType<typeof renderUpload>,
): Promise<FileDeliveryOutcome | null> {
  act(() => hook.result.current.handleExternalFile(createFile()));
  let outcome: FileDeliveryOutcome | null = null;
  await act(async () => {
    outcome = await hook.result.current.handleSendFile();
  });
  return outcome;
}

describe('useFileUploadLogic — integridade do envio', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.storageFrom.mockReturnValue({
      upload: mocks.upload,
      createSignedUrl: mocks.createSignedUrl,
      getPublicUrl: mocks.getPublicUrl,
      remove: mocks.remove,
    });
    mocks.upload.mockResolvedValue({ error: null });
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: SIGNED_URL }, error: null });
    mocks.getPublicUrl.mockReturnValue({ data: { publicUrl: LOCATOR_URL } });
    mocks.remove.mockResolvedValue({ error: null });

    mocks.from.mockReturnValue({ insert: mocks.insert, update: mocks.update });
    mocks.insert.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ single: mocks.single });
    mocks.single.mockResolvedValue({ data: { id: MESSAGE_ID }, error: null });
    mocks.update.mockImplementation((payload: unknown) => ({
      eq: (column: string, value: string) => mocks.updateEq(payload, column, value),
    }));
    mocks.updateEq.mockResolvedValue({ error: null });
    mocks.sendMediaMessage.mockResolvedValue({ key: { id: 'evolution-message-1' } });
    mocks.sendAudioMessage.mockResolvedValue({ key: { id: 'evolution-audio-1' } });
  });

  it('usa pasta do contato autorizada para agente comum e UUID com nome sanitizado', async () => {
    const hook = renderUpload();

    await selectAndSend(hook);

    expect(mocks.upload).toHaveBeenCalledTimes(1);
    const storagePath = mocks.upload.mock.calls[0][0] as string;
    expect(storagePath).toMatch(new RegExp(
      `^${CONTACT_ID}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-Relatorio-final-cliente-1\\.pdf$`,
      'i',
    ));
    expect(storagePath).not.toContain('/uploads/');
    expect(mocks.storageFrom).toHaveBeenCalledWith('whatsapp-media');
  });

  it.each([
    ['erro retornado', () => Promise.resolve({ data: null, error: { message: 'RLS recusou insert' } })],
    ['rejeição de rede', () => Promise.reject(new Error('database unavailable'))],
  ])('limpa o objeto e não chama a API quando o insert no banco falha (%s)', async (_caseName, insertResult) => {
    mocks.single.mockImplementationOnce(insertResult);
    const hook = renderUpload();

    const outcome = await selectAndSend(hook);

    expect(outcome).toBeNull();
    expect(mocks.sendMediaMessage).not.toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledWith([mocks.upload.mock.calls[0][0]]);
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    expect(hook.onFileSent).not.toHaveBeenCalled();
  });

  it('aguarda status failed quando a API rejeita após o insert', async () => {
    const failedStatus = deferred<{ error: null }>();
    mocks.sendMediaMessage.mockRejectedValueOnce(new Error('Evolution indisponível'));
    mocks.updateEq.mockImplementationOnce(() => failedStatus.promise);
    const hook = renderUpload();

    act(() => hook.result.current.handleExternalFile(createFile()));
    let operation!: Promise<FileDeliveryOutcome | null>;
    act(() => {
      operation = hook.result.current.handleSendFile();
    });

    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ status: 'failed' }));
    expect(mocks.toastError).not.toHaveBeenCalled();

    await act(async () => {
      failedStatus.resolve({ error: null });
      await operation;
    });

    expect(mocks.updateEq).toHaveBeenCalledWith({ status: 'failed' }, 'id', MESSAGE_ID);
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    expect(hook.onFileSent).not.toHaveBeenCalled();
  });

  it('marca failed quando a API responde sem external_id', async () => {
    mocks.sendMediaMessage.mockResolvedValueOnce({ accepted: true });
    const hook = renderUpload();

    const outcome = await selectAndSend(hook);

    expect(outcome).toBeNull();
    expect(mocks.update).toHaveBeenCalledWith({ status: 'failed' });
    expect(mocks.updateEq).toHaveBeenCalledWith({ status: 'failed' }, 'id', MESSAGE_ID);
    expect(mocks.toastError).toHaveBeenCalledWith(
      expect.stringContaining('não confirmou o identificador externo'),
      expect.objectContaining({ id: 'file-upload' }),
    );
  });

  it('confirma o insert antes da API e aguarda a atualização no sucesso completo', async () => {
    const hook = renderUpload();

    const outcome = await selectAndSend(hook);

    expect(outcome).toEqual(expect.objectContaining({
      deliveryState: 'sent',
      historyPending: false,
      mediaUrl: LOCATOR_URL,
    }));
    expect(mocks.single.mock.invocationCallOrder[0]).toBeLessThan(mocks.sendMediaMessage.mock.invocationCallOrder[0]);
    expect(mocks.sendMediaMessage.mock.invocationCallOrder[0]).toBeLessThan(mocks.update.mock.invocationCallOrder[0]);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      contact_id: CONTACT_ID,
      sender: 'agent',
      status: 'sending',
      media_url: LOCATOR_URL,
    }));
    expect(mocks.update).toHaveBeenCalledWith({ external_id: 'evolution-message-1', status: 'sent' });
    expect(mocks.updateEq).toHaveBeenCalledWith(
      { external_id: 'evolution-message-1', status: 'sent' },
      'id',
      MESSAGE_ID,
    );
    expect(hook.onFileSent).toHaveBeenCalledWith(expect.objectContaining({
      deliveryState: 'sent',
      historyPending: false,
    }));
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Arquivo enviado!', { id: 'file-upload' });
    expect(mocks.toastWarning).not.toHaveBeenCalled();
  });

  it.each([
    ['erro retornado', () => Promise.resolve({ error: { message: 'update recusado' } })],
    ['rejeição de rede', () => Promise.reject(new Error('update indisponível'))],
  ])('retorna histórico pendente sem sugerir reenvio após entrega confirmada (%s)', async (_caseName, updateResult) => {
    mocks.updateEq.mockImplementationOnce(updateResult);
    const hook = renderUpload();

    const outcome = await selectAndSend(hook);

    expect(outcome).toEqual(expect.objectContaining({
      deliveryState: 'history_pending',
      historyPending: true,
      mediaUrl: LOCATOR_URL,
    }));
    expect(mocks.sendMediaMessage).toHaveBeenCalledTimes(1);
    expect(hook.onFileSent).toHaveBeenCalledWith(expect.objectContaining({
      deliveryState: 'history_pending',
      historyPending: true,
    }));
    expect(mocks.toastWarning).toHaveBeenCalledWith(
      expect.stringMatching(/entregue ao WhatsApp.*histórico local.*Não reenvie/i),
      expect.objectContaining({ id: 'file-upload' }),
    );
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalledWith({ status: 'failed' });
  });
});
