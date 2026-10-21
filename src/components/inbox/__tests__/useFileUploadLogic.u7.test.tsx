/**
 * U7 (paridade V3→V2, doc 11) — `useFileUploadLogic` não tinha teste de:
 *   - ordenação da fila por categoria (imagem antes de documento);
 *   - corte em MAX_FILES (10) com aviso ao usuário;
 *   - compressão aplicada / fallback quando a compressão falha;
 *   - lote parcial ("N enviados / N falharam").
 * O arquivo existente (`useFileUploadLogic.test.tsx`) cobre storage path e R2-INB-006.
 *
 * GIF/sticker sem compressão: ver it.todo no fim — na V2 o caminho é inalcançável.
 */
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
  compressImage: vi.fn(),
  formatCompressionInfo: vi.fn(() => '100 KB → 30 KB'),
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

vi.mock('@/utils/imageCompression', () => ({
  compressImage: mocks.compressImage,
  formatCompressionInfo: mocks.formatCompressionInfo,
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
  createLogger: () => ({ debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const CONTACT_ID = '32a7c69a-bbbb-4b94-8888-61b95bb25a0d';
const LOCATOR_URL = 'https://project.test/storage/v1/object/public/whatsapp-media/locator';

function reconcileChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    limit: () => Promise.resolve(result),
  };
  return chain;
}

function renderUpload() {
  return renderHook(() =>
    useFileUploadLogic({
      contactId: CONTACT_ID,
      connectionId: 'connection-1',
      onFileSent: vi.fn(),
      fileInputRef: createRef<HTMLInputElement>(),
    }),
  );
}

function pngFile(name = 'foto.png') {
  return new File(['x'], name, { type: 'image/png' });
}
function pdfFile(name = 'contrato.pdf') {
  return new File(['x'], name, { type: 'application/pdf' });
}

beforeEach(() => {
  vi.clearAllMocks();
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${++n}`);
  URL.revokeObjectURL = vi.fn();
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
});

describe('useFileUploadLogic — U7: fila, limites e compressão', () => {
  it('ordena a fila por categoria (imagem antes de documento)', () => {
    const hook = renderUpload();
    act(() => {
      hook.result.current.handleExternalFiles([pdfFile(), pngFile()]);
    });

    const queue = hook.result.current.fileQueue;
    expect(queue).toHaveLength(2);
    expect(queue[0].file.type).toBe('image/png');
    expect(queue[1].file.type).toBe('application/pdf');
    expect(hook.result.current.isMultiMode).toBe(true);
  });

  it('corta em 10 arquivos e avisa o usuário do limite', () => {
    const hook = renderUpload();
    const files = Array.from({ length: 11 }, (_, i) => pdfFile(`doc-${i}.pdf`));
    act(() => {
      hook.result.current.handleExternalFiles(files);
    });

    expect(hook.result.current.fileQueue).toHaveLength(10);
    expect(mocks.toastWarning).toHaveBeenCalledWith(expect.stringContaining('10'));
  });

  it('usa o arquivo comprimido quando a compressão diz wasCompressed', async () => {
    const original = pngFile('grande.png');
    const comprimido = new File(['y'], 'grande-comprimido.png', { type: 'image/png' });
    mocks.compressImage.mockResolvedValueOnce({
      wasCompressed: true,
      file: comprimido,
      originalSize: 1024,
      compressedSize: 300,
    });

    const hook = renderUpload();
    act(() => {
      hook.result.current.handleExternalFile(original);
    });
    await act(async () => {
      await hook.result.current.handleSendFile();
    });

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    expect(mocks.compressImage).toHaveBeenCalledWith(original);
    const [, uploadedFile] = mocks.upload.mock.calls[0];
    expect((uploadedFile as File).name).toBe('grande-comprimido.png');
  });

  it('cai no arquivo ORIGINAL quando a compressão falha (não bloqueia o envio)', async () => {
    const original = pngFile('foto.png');
    mocks.compressImage.mockRejectedValueOnce(new Error('canvas indisponível'));

    const hook = renderUpload();
    act(() => {
      hook.result.current.handleExternalFile(original);
    });
    await act(async () => {
      await hook.result.current.handleSendFile();
    });

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    const [, uploadedFile] = mocks.upload.mock.calls[0];
    expect((uploadedFile as File).name).toBe('foto.png');
    expect(mocks.sendOutboundMessage).toHaveBeenCalledTimes(1);
  });

  it('em lote parcial reporta quantos foram enviados e quantos falharam', async () => {
    mocks.sendOutboundMessage
      .mockResolvedValueOnce({ id: 'msg-1', status: 'sent', externalId: 'ext-1', idempotent: false })
      .mockRejectedValueOnce(new Error('entrega indisponível'));

    const hook = renderUpload();
    act(() => {
      hook.result.current.handleExternalFiles([pngFile('a.png'), pdfFile('b.pdf')]);
    });
    await act(async () => {
      await hook.result.current.handleSendAllFiles();
    });

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith(expect.stringContaining('1 arquivo(s) enviado(s)')));
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('1 arquivo(s) falharam'));
  });

  it('removeFromQueue revoga o object URL do preview removido', () => {
    const hook = renderUpload();
    act(() => {
      hook.result.current.handleExternalFiles([pngFile('a.png'), pdfFile('b.pdf')]);
    });

    const imagem = hook.result.current.fileQueue.find((f) => f.file.type === 'image/png');
    expect(imagem?.preview).toBeTruthy();

    act(() => {
      hook.result.current.removeFromQueue(imagem!.id);
    });

    expect(URL.revokeObjectURL).toHaveBeenCalledWith(imagem!.preview);
    expect(hook.result.current.fileQueue.some((f) => f.file.type === 'image/png')).toBe(false);
  });

  // U7 item b (gif/sticker sem compressão): na V2 o caminho é INALCANÇÁVEL.
  // O guard `file.type !== 'image/gif'` existe, mas `validateFile` rejeita gif (não está
  // em nenhuma lista) e classifica webp como `image` (a entrada `sticker` de
  // WHATSAPP_FILE_TYPES é inalcançável porque `image` casa primeiro). Sem arquivo válido
  // que pule a compressão, não há como provar o skip pelo fluxo público.
  it.todo('gif/sticker não passa pela compressão — inalcançável na V2 (reportado ao Claude)');
});
